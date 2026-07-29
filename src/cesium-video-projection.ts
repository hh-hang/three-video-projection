import * as Cesium from "cesium";
import ECEF from "./utils/ECEF";
import fragmentShader from "./shaders/cesium-video-projection.frag.glsl";
import computeQuadHomographyElements from "./utils/computeQuadHomographyElements";

// 由四角点计算Homography矩阵（投影UV空间 → 视频UV空间）
function computeQuadHomography(
    corners: [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
    ]
): Cesium.Matrix3 {
    const elements = computeQuadHomographyElements(corners);
    return Cesium.Matrix3.fromRowMajorArray(elements);
}

export type TextureSource =
    | HTMLVideoElement
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageData;

export interface CesiumProjectorOptions {
    projCamPosition?: [number, number, number];
    projCamParams?: {
        fov?: number;
        aspect?: number;
        near?: number;
        far?: number;
    };
    orientationParams?: {
        azimuthDeg?: number;
        elevationDeg?: number;
        rollDeg?: number;
    };
    source?: TextureSource;
    intensity?: number;
    opacity?: number;
    projBias?: number;
    edgeFeather?: number;
    isShowHelper?: boolean;
    cropRect?: [number, number, number, number];
    quadCorners?: [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
    ];
}

export type CesiumProjectorTool = {
    update: (frameState: any) => void;
    destroy: () => void;
    isDestroyed: () => boolean;
    azimuthDeg: number;
    elevationDeg: number;
    rollDeg: number;
    opacity: number;
    intensity: number;
    edgeFeather: number;
    projBias: number;
    aspect: number;
    fov: number;
    isShowHelper: boolean;
    cameraPosition: [number, number, number];
    far: number;
    near: number;
    source: TextureSource;
    cropRect: [number, number, number, number];
    quadCorners: [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
    ];
};

// 创建视频投射工具
export function createCesiumVideoProjector(
    viewer: Cesium.Viewer,
    opts: CesiumProjectorOptions
): CesiumProjectorTool {
    let {
        projCamPosition = [0, 0, 0],
        projCamParams = { fov: 30, aspect: 1, near: 0.1, far: 50 },
        orientationParams = { azimuthDeg: 0, elevationDeg: 0, rollDeg: 0 },
        intensity = 1.0,
        opacity = 1.0,
        projBias = 0.0001,
        edgeFeather = 0.05,
        isShowHelper = true,
        cropRect = [0, 0, 1, 1] as [number, number, number, number],
        quadCorners = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
        ] as [
            [number, number],
            [number, number],
            [number, number],
            [number, number],
        ],
    } = opts;

    const ecef = new ECEF();
    let destroyed = false;

    const orientParams = {
        azimuthDeg: orientationParams.azimuthDeg ?? 0,
        elevationDeg: orientationParams.elevationDeg ?? 0,
        rollDeg: orientationParams.rollDeg ?? 0,
    };

    let aspect: number = projCamParams.aspect ?? 1;
    let fov: number = projCamParams.fov ?? 30;
    let near: number = projCamParams.near ?? 0.1;
    let far: number = projCamParams.far ?? 50;

    let activeVideoListenerFn: (() => void) | undefined;
    let videoEle: HTMLVideoElement | undefined;

    let cameraPosition!: Cesium.Cartesian3;
    let position!: Cesium.Cartesian3;
    let viewDis: number | undefined;
    let viewShadowMap!: any;
    let orientation!: Cesium.Quaternion;
    let postProcess: Cesium.PostProcessStage | null | undefined;
    let camHelper: Cesium.Primitive | null = null;
    let videoTexture: any;
    let quadHomography: Cesium.Matrix3;
    let cropRectVec4: Cesium.Cartesian4;

    // 获取视口宽高比
    function getWinWidHei(): number {
        const canvas = viewer.scene.canvas;
        return canvas.clientWidth / canvas.clientHeight;
    }

    // 解算相机与视点坐标
    function initCameraParam(): {
        cameraPosition: Cesium.Cartesian3;
        position: Cesium.Cartesian3;
    } {
        // ENU → ECEF 求视点经纬高
        const viewPoint = ecef.enu_to_ecef(
            {
                longitude: Number(projCamPosition[0]),
                latitude: Number(projCamPosition[1]),
                altitude: Number(projCamPosition[2]),
            },
            {
                distance: far,
                azimuth: Number(orientParams.azimuthDeg),
                elevation: Number(orientParams.elevationDeg),
            }
        );

        // 视点笛卡尔坐标
        const pos = Cesium.Cartesian3.fromDegrees(
            viewPoint.longitude,
            viewPoint.latitude,
            viewPoint.altitude
        );
        // 相机笛卡尔坐标
        const camPos = Cesium.Cartesian3.fromDegrees(
            Number(projCamPosition[0]),
            Number(projCamPosition[1]),
            Number(projCamPosition[2])
        );

        return { cameraPosition: camPos, position: pos };
    }

    // 四元数旋转向量
    function rotateVectorByQuaternion(
        vector: Cesium.Cartesian3,
        quat: Cesium.Quaternion
    ): Cesium.Cartesian3 {
        const qConjugate = Cesium.Quaternion.conjugate(
            quat,
            new Cesium.Quaternion()
        );
        const qv = new Cesium.Quaternion(vector.x, vector.y, vector.z, 0);
        const result = Cesium.Quaternion.multiply(
            Cesium.Quaternion.multiply(quat, qv, new Cesium.Quaternion()),
            qConjugate,
            new Cesium.Quaternion()
        );
        return new Cesium.Cartesian3(result.x, result.y, result.z);
    }

    // 构建投影阴影图
    function createShadowMap(): void {
        if (destroyed) return;

        const camPos = cameraPosition;
        const tgtPos = position;
        const cam = new Cesium.Camera(viewer.scene);

        // 设置光源相机朝向
        cam.position = camPos;
        cam.direction = Cesium.Cartesian3.subtract(
            tgtPos,
            camPos,
            new Cesium.Cartesian3()
        );
        cam.up = Cesium.Cartesian3.normalize(camPos, new Cesium.Cartesian3());

        // 记录投影距离
        const dis = Cesium.Cartesian3.distance(tgtPos, camPos);
        viewDis = dis;

        // 设置透视视锥体
        cam.frustum = new Cesium.PerspectiveFrustum({
            fov: Cesium.Math.toRadians(fov),
            aspectRatio: aspect,
            near,
            far: far,
        });

        // 应用 roll 旋转
        const angle = Cesium.Math.toRadians(orientParams.rollDeg);
        const rollQuat = Cesium.Quaternion.fromAxisAngle(cam.direction, angle);
        cam.direction = rotateVectorByQuaternion(cam.direction, rollQuat);
        cam.up = rotateVectorByQuaternion(cam.up, rollQuat);
        cam.right = rotateVectorByQuaternion(cam.right, rollQuat);

        // 创建阴影图
        // @ts-ignore
        viewShadowMap = new Cesium.ShadowMap({
            lightCamera: cam,
            enable: false,
            isPointLight: false,
            isSpotLight: true,
            cascadesEnabled: false,
            context: (viewer.scene as any).context,
            pointLightRadius: dis,
        });

        // 不参与光照
        viewShadowMap.fromLightSource = false;
    }

    // 计算视锥体朝向四元数
    function getOrientation(): Cesium.Quaternion {
        const camPos = cameraPosition;
        const tgtPos = position;

        // 初始朝向及上向量
        let dir = Cesium.Cartesian3.normalize(
            Cesium.Cartesian3.subtract(tgtPos, camPos, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
        );
        let up = Cesium.Cartesian3.normalize(camPos, new Cesium.Cartesian3());
        const cam = new Cesium.Camera(viewer.scene);
        cam.position = camPos;
        cam.direction = dir;
        cam.up = up;

        // 取世界坐标系下的轴向量
        dir = cam.directionWC;
        up = cam.upWC;
        const right = cam.right;

        // 构建旋转矩阵 四元数
        const negRight = Cesium.Cartesian3.negate(
            right,
            new Cesium.Cartesian3()
        );
        const rotMatrix = new Cesium.Matrix3();
        Cesium.Matrix3.setColumn(rotMatrix, 0, negRight, rotMatrix);
        Cesium.Matrix3.setColumn(rotMatrix, 1, up, rotMatrix);
        Cesium.Matrix3.setColumn(rotMatrix, 2, dir, rotMatrix);
        const quat = Cesium.Quaternion.fromRotationMatrix(
            rotMatrix,
            new Cesium.Quaternion()
        );

        // 叠加 roll 旋转
        const rollRad = Cesium.Math.toRadians(orientParams.rollDeg);
        const dir1 = Cesium.Cartesian3.normalize(
            Cesium.Cartesian3.subtract(
                position,
                cameraPosition,
                new Cesium.Cartesian3()
            ),
            new Cesium.Cartesian3()
        );
        const rollQuat = Cesium.Quaternion.fromAxisAngle(dir1, rollRad);
        const newQuat = Cesium.Quaternion.multiply(
            rollQuat,
            quat,
            new Cesium.Quaternion()
        );

        orientation = newQuat;
        return newQuat;
    }

    // 绘制视锥轮廓辅助线
    function addCamHelper(): void {
        camHelper = new Cesium.Primitive({
            geometryInstances: new Cesium.GeometryInstance({
                geometry: new Cesium.FrustumOutlineGeometry({
                    origin: cameraPosition,
                    orientation,
                    frustum: viewShadowMap._lightCamera.frustum,
                }),
                attributes: {
                    color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                        new Cesium.Color(0, 0.5, 0.5)
                    ),
                },
            }),
            appearance: new Cesium.PerInstanceColorAppearance({
                translucent: false,
                flat: true,
            }),
            asynchronous: false,
            show: isShowHelper,
        });
        viewer.scene.primitives.add(camHelper);
    }

    // 添加后处理效果
    function addPostProcess(): void {
        if (destroyed || !viewShadowMap) return;
        if (!quadHomography) {
            quadHomography = computeQuadHomography(quadCorners);
        }
        if (!cropRectVec4) {
            cropRectVec4 = new Cesium.Cartesian4(
                cropRect[0],
                cropRect[1],
                cropRect[2],
                cropRect[3]
            );
        }
        postProcess = new Cesium.PostProcessStage({
            fragmentShader: fragmentShader,
            uniforms: {
                // 混合系数 = 透明度
                opacity: () => opacity,
                // 投射亮度
                intensity: () => intensity,
                // 深度偏移
                projBias: () => projBias,
                // 阴影深度纹理
                shadowMapTexture: () => viewShadowMap._shadowMapTexture,
                // 投射纹理
                videoTexture: () => videoTexture,
                // 投影变换矩阵
                shadowMapMatrix: () => viewShadowMap._shadowMapMatrix,
                // texel 步长与深度偏移
                shadowMap_texelSizeDepthBiasAndNormalShadingSmooth: () => {
                    const t = new Cesium.Cartesian2();
                    t.x = 1 / viewShadowMap._textureSize.x;
                    t.y = 1 / viewShadowMap._textureSize.y;
                    const bias = viewShadowMap._primitiveBias;
                    return Cesium.Cartesian4.fromElements(
                        t.x,
                        t.y,
                        bias.depthBias,
                        bias.normalShadingSmooth
                    );
                },
                // 边缘羽化强度
                featherAmount: () => edgeFeather,
                // 裁剪区域
                cropRect: () => cropRectVec4,
                // 四角变换矩阵
                quadHomography: () => quadHomography,
            },
        });
        viewer.scene.postProcessStages.add(postProcess);
    }

    // 销毁旧资源并重建
    function updateResources(): void {
        if (destroyed) return;

        // 移除旧后处理
        if (postProcess) viewer.scene.postProcessStages.remove(postProcess);
        // 移除旧视锥线
        if (camHelper) viewer.scene.primitives.remove(camHelper);
        // 销毁旧阴影图
        if (viewShadowMap) viewShadowMap.destroy();

        createShadowMap();
        getOrientation();
        addCamHelper();
        addPostProcess();
    }

    // 停止视频帧监听
    function stopVideoListener(): void {
        if (activeVideoListenerFn) {
            try {
                if (viewer?.clock?.onTick) {
                    viewer.clock.onTick.removeEventListener(
                        activeVideoListenerFn
                    );
                }
            } catch (e) {
                console.warn("停止视频帧监听失败:", e);
            }
            activeVideoListenerFn = undefined;
        }
    }

    // 每帧注入阴影图
    function update(frameState: any): void {
        if (destroyed || !viewShadowMap) return;
        (viewer.scene as any).frameState.shadowMaps.push(viewShadowMap);
    }

    // 检查是否已销毁
    function isDestroyed(): boolean {
        return destroyed;
    }

    // 释放所有资源
    function destroy(): void {
        if (destroyed) return;
        // 停止视频监听
        stopVideoListener();
        // 移除后处理与视锥线
        if (postProcess) {
            viewer.scene.postProcessStages.remove(postProcess);
            postProcess = undefined;
        }
        if (camHelper) {
            viewer.scene.primitives.remove(camHelper);
            camHelper = null;
        }
        // 销毁纹理
        if (videoTexture) {
            videoTexture.destroy();
            videoTexture = undefined;
        }
        // 销毁阴影图
        if (viewShadowMap) {
            viewShadowMap.destroy();
            viewShadowMap = undefined as any;
        }
        // 置空所有闭包引用
        viewDis = undefined;
        cameraPosition = undefined as any;
        position = undefined as any;
        videoEle = undefined;
        orientation = undefined as any;
        // 设置销毁状态
        destroyed = true;
    }

    // 执行构造初始化
    const initParam = initCameraParam();
    cameraPosition = initParam.cameraPosition;
    position = initParam.position;

    // 未指定 aspect 时取视口比例
    if (!projCamParams.aspect) aspect = getWinWidHei();

    const tool = {
        update,
        destroy,
        isDestroyed,
    } as any;

    Object.defineProperties(tool, {
        // 透明度
        opacity: {
            get: () => opacity,
            set: (val: number) => {
                if (destroyed) return;
                opacity = Math.max(0, Math.min(1, val));
            },
            enumerable: true,
        },
        // 投射亮度
        intensity: {
            get: () => intensity,
            set: (val: number) => {
                if (destroyed) return;
                intensity = Math.max(0, val);
            },
            enumerable: true,
        },
        // 边缘羽化
        edgeFeather: {
            get: () => edgeFeather,
            set: (val: number) => {
                if (destroyed) return;
                edgeFeather = Math.max(0, Math.min(1, val));
            },
            enumerable: true,
        },
        // 深度偏移
        projBias: {
            get: () => projBias,
            set: (val: number) => {
                if (destroyed) return;
                projBias = val;
            },
            enumerable: true,
        },
        // 宽高比
        aspect: {
            get: () => aspect,
            set: (val: number) => {
                if (destroyed) return;
                aspect = val;
                updateResources();
            },
            enumerable: true,
        },
        // 视场角
        fov: {
            get: () => fov,
            set: (val: number) => {
                if (destroyed) return;
                fov = val;
                updateResources();
            },
            enumerable: true,
        },
        // 辅助线显隐
        isShowHelper: {
            get: () => isShowHelper,
            set: (val: boolean) => {
                if (destroyed) return;
                isShowHelper = val;
                if (camHelper) camHelper.show = val;
            },
            enumerable: true,
        },
        // 方位角
        azimuthDeg: {
            get: () => orientParams.azimuthDeg,
            set: (deg: number) => {
                if (destroyed) return;
                orientParams.azimuthDeg = deg;
                const p = initCameraParam();
                position = p.position;
                updateResources();
            },
            enumerable: true,
        },
        // 俯仰角
        elevationDeg: {
            get: () => orientParams.elevationDeg,
            set: (deg: number) => {
                if (destroyed) return;
                orientParams.elevationDeg = deg;
                const p = initCameraParam();
                position = p.position;
                updateResources();
            },
            enumerable: true,
        },
        // 横滚角
        rollDeg: {
            get: () => orientParams.rollDeg,
            set: (deg: number) => {
                if (destroyed) return;
                if (typeof deg === "number") {
                    orientParams.rollDeg = deg;
                    updateResources();
                }
            },
            enumerable: true,
        },
        // 相机位置
        cameraPosition: {
            get: (): [number, number, number] => projCamPosition,
            set: (pos: [number, number, number]) => {
                if (destroyed) return;
                if (pos) {
                    projCamPosition[0] = pos[0];
                    projCamPosition[1] = pos[1];
                    projCamPosition[2] = pos[2];
                    const { cameraPosition: newCamPos, position: newPos } =
                        initCameraParam();
                    cameraPosition = newCamPos;
                    position = newPos;
                    updateResources();
                }
            },
            enumerable: true,
        },
        // 远裁剪面
        far: {
            get: () => far,
            set: (val: number) => {
                if (destroyed) return;
                if (val) {
                    far = val;
                    const p = initCameraParam();
                    position = p.position;
                    updateResources();
                }
            },
            enumerable: true,
        },
        // 近裁剪面
        near: {
            get: () => near,
            set: (val: number) => {
                if (destroyed) return;
                if (typeof val === "number" && val > 0) {
                    near = val;
                    updateResources();
                }
            },
            enumerable: true,
        },
        // 裁剪区域（UV空间，[x0, y0, x1, y1]，范围 0~1）
        cropRect: {
            get: (): [number, number, number, number] => {
                return [
                    cropRectVec4.x,
                    cropRectVec4.y,
                    cropRectVec4.z,
                    cropRectVec4.w,
                ];
            },
            set: (rect: [number, number, number, number]) => {
                if (destroyed) return;
                cropRectVec4.x = rect[0];
                cropRectVec4.y = rect[1];
                cropRectVec4.z = rect[2];
                cropRectVec4.w = rect[3];
            },
            enumerable: true,
        },
        // 四角点变换（投影UV空间，顺序：左下、右下、右上、左上）
        quadCorners: {
            set: (
                corners: [
                    [number, number],
                    [number, number],
                    [number, number],
                    [number, number],
                ]
            ) => {
                if (destroyed) return;
                quadHomography = computeQuadHomography(corners);
            },
            enumerable: true,
        },
        // 投射源
        source: {
            set: (source: TextureSource) => {
                if (destroyed) return;

                stopVideoListener();

                if (source instanceof HTMLVideoElement) {
                    videoEle = source;
                    activeVideoListenerFn = () => {
                        if (destroyed) return;
                        if (videoTexture) videoTexture.destroy();
                        // @ts-ignore
                        videoTexture = new Cesium.Texture({
                            context: (viewer.scene as any).context,
                            source,
                            width: 1,
                            height: 1,
                            pixelFormat: Cesium.PixelFormat.RGBA,
                            pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
                        });
                    };
                    viewer.clock.onTick.addEventListener(activeVideoListenerFn);
                } else {
                    videoEle = undefined;
                    if (videoTexture) videoTexture.destroy();
                    // @ts-ignore
                    videoTexture = new Cesium.Texture({
                        context: (viewer.scene as any).context,
                        source: source as any,
                    });
                }
            },
            enumerable: true,
        },
    });

    if (opts.source) {
        tool.source = opts.source;
    }
    updateResources();

    viewer.scene.primitives.add(tool);

    return tool as CesiumProjectorTool;
}