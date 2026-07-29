import * as Cesium from "cesium";
import {
    clamp,
    median,
    solveCalibration,
    type CalibrationObservation,
    type CalibrationSolveResult,
} from "./calibration/core";
import ECEF from "./utils/ECEF";

/** 相机标定参数角度单位均为度，位置使用经度、纬度和高程 */
export interface CameraCalibrationParameters {
    /** 投影相机的 [longitude, latitude, altitude]，与 Cesium 投影工具一致 */
    position: [number, number, number];
    /** 水平方位角：ENU 中 0° 指向北，90° 指向东 */
    azimuthDeg: number;
    /** 俯仰角：向上为正，向下为负 */
    elevationDeg: number;
    /** 沿相机视线方向的横滚角 */
    rollDeg: number;
    /** 垂直视场角 */
    fovDeg: number;
    /** 视频宽高比 width / height */
    aspect: number;
    /** 近裁剪面距离；当前仅参与投影，不作为优化变量 */
    near: number;
    /** 远裁剪面距离；当前仅参与投影，并作为方位/俯仰视点距离，不作为优化变量 */
    far: number;
}

/** 一组视频像素点与三维场景点的对应观测 */
export interface CameraCalibrationObservation extends CalibrationObservation {
    /** 标定点编号，用于关联界面中的点位 */
    id: number;
}

/** 相机标定的求解结果与重投影误差 */
export type CameraCalibrationResult = CalibrationSolveResult<CameraCalibrationParameters>;

// 当前优化 7 个变量：位置 ENU 米制增量、方位/俯仰/横滚和垂直 FOV
const parameterCount = 7;
// 复用计算对象
const ecef = new ECEF();
const camPos = new Cesium.Cartesian3();
const tgtPos = new Cesium.Cartesian3();
const direction = new Cesium.Cartesian3();
const up = new Cesium.Cartesian3();
const right = new Cesium.Cartesian3();
const worldPoint = new Cesium.Cartesian3();
const eyePoint = new Cesium.Cartesian3();
const clipPoint = new Cesium.Cartesian4();
const viewMatrix = new Cesium.Matrix4();
const enuOffset = new Cesium.Cartesian3();
const enuToFixed = new Cesium.Matrix4();
const scratchQuat = new Cesium.Quaternion();
const scratchConjugate = new Cesium.Quaternion();
const scratchQv = new Cesium.Quaternion();
const scratchResult = new Cesium.Quaternion();
const frustum = new Cesium.PerspectiveFrustum();

/** 四元数旋转向量，与 cesium-video-projection 中 createShadowMap 一致 */
function rotateVectorByQuaternion(
    vector: Cesium.Cartesian3,
    quat: Cesium.Quaternion,
    result = new Cesium.Cartesian3(),
): Cesium.Cartesian3 {
    const qConjugate = Cesium.Quaternion.conjugate(quat, scratchConjugate);
    scratchQv.x = vector.x;
    scratchQv.y = vector.y;
    scratchQv.z = vector.z;
    scratchQv.w = 0;
    Cesium.Quaternion.multiply(quat, scratchQv, scratchResult);
    Cesium.Quaternion.multiply(scratchResult, qConjugate, scratchResult);
    result.x = scratchResult.x;
    result.y = scratchResult.y;
    result.z = scratchResult.z;
    return result;
}

/**
 * 根据参数构建求解用的透视相机状态
 * 朝向约定与 createShadowMap 一致：ENU 视点 + 地心径向 up + 绕视线 roll
 */
function buildCamera(params: CameraCalibrationParameters): {
    position: Cesium.Cartesian3;
    direction: Cesium.Cartesian3;
    up: Cesium.Cartesian3;
    right: Cesium.Cartesian3;
    frustum: Cesium.PerspectiveFrustum;
} {
    // 更新内参矩阵：FOV 和宽高比决定画面范围，near/far 决定有效深度范围
    frustum.fov = Cesium.Math.toRadians(params.fovDeg);
    frustum.aspectRatio = params.aspect;
    frustum.near = params.near;
    frustum.far = params.far;

    Cesium.Cartesian3.clone(
        Cesium.Cartesian3.fromDegrees(params.position[0], params.position[1], params.position[2]),
        camPos,
    );

    // 由方位角和俯仰角在 ENU 中求视点，再转到 ECEF
    const viewPoint = ecef.enu_to_ecef(
        {
            longitude: params.position[0],
            latitude: params.position[1],
            altitude: params.position[2],
        },
        {
            distance: params.far,
            azimuth: params.azimuthDeg,
            elevation: params.elevationDeg,
        },
    );
    Cesium.Cartesian3.clone(
        Cesium.Cartesian3.fromDegrees(
            viewPoint.longitude,
            viewPoint.latitude,
            viewPoint.altitude,
        ),
        tgtPos,
    );

    // 先用前向向量与地心径向 up 确定基础姿态，再绕视线叠加横滚角
    Cesium.Cartesian3.subtract(tgtPos, camPos, direction);
    Cesium.Cartesian3.normalize(direction, direction);
    Cesium.Cartesian3.normalize(camPos, up);
    const rollQuat = Cesium.Quaternion.fromAxisAngle(
        direction,
        Cesium.Math.toRadians(params.rollDeg),
        scratchQuat,
    );
    rotateVectorByQuaternion(direction, rollQuat, direction);
    rotateVectorByQuaternion(up, rollQuat, up);
    Cesium.Cartesian3.cross(direction, up, right);
    Cesium.Cartesian3.normalize(right, right);
    Cesium.Cartesian3.cross(right, direction, up);
    Cesium.Cartesian3.normalize(up, up);

    return {
        position: camPos,
        direction,
        up,
        right,
        frustum,
    };
}

/** 将一个三维观测点投影到归一化视频 UV；点位于相机后方或结果无效时返回 null */
function projectWorld(
    params: CameraCalibrationParameters,
    world: [number, number, number],
): [number, number] | null {
    // 构建透视相机
    const cam = buildCamera(params);
    worldPoint.x = world[0];
    worldPoint.y = world[1];
    worldPoint.z = world[2];
    // Cesium 相机朝向本地 -Z，z >= 0 表示该点不在相机前方
    Cesium.Matrix4.computeView(
        cam.position,
        cam.direction,
        cam.up,
        cam.right,
        viewMatrix,
    );
    Cesium.Matrix4.multiplyByPoint(viewMatrix, worldPoint, eyePoint);
    if (eyePoint.z >= -1e-6) return null;
    // 投影矩阵返回裁剪坐标，除以 w 得到 NDC，范围 [-1, 1]；再转换为视频 UV 的 [0, 1]
    Cesium.Matrix4.multiplyByVector(
        cam.frustum.projectionMatrix,
        Cesium.Cartesian4.fromElements(eyePoint.x, eyePoint.y, eyePoint.z, 1, clipPoint),
        clipPoint,
    );
    if (clipPoint.w <= 1e-6) return null;
    const ndcX = clipPoint.x / clipPoint.w;
    const ndcY = clipPoint.y / clipPoint.w;
    if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
    return [(ndcX + 1) / 2, (ndcY + 1) / 2];
}

/** 将相对初值相机的 ENU 米制偏移还原为经纬高 */
function enuMetersToPosition(
    initial: [number, number, number],
    east: number,
    north: number,
    upMeters: number,
): [number, number, number] {
    const fixed = Cesium.Cartesian3.fromDegrees(initial[0], initial[1], initial[2]);
    Cesium.Transforms.eastNorthUpToFixedFrame(fixed, Cesium.Ellipsoid.WGS84, enuToFixed);
    enuOffset.x = east;
    enuOffset.y = north;
    enuOffset.z = upMeters;
    Cesium.Matrix4.multiplyByPoint(enuToFixed, enuOffset, worldPoint);
    const cartographic = Cesium.Cartographic.fromCartesian(worldPoint);
    return [
        Cesium.Math.toDegrees(cartographic.longitude),
        Cesium.Math.toDegrees(cartographic.latitude),
        cartographic.height,
    ];
}

/**
 * 使用当前投影参数作为初值，通过鲁棒 Levenberg-Marquardt 最小化像素重投影误差
 * 优化变量为位置 ENU 米制增量、方位/俯仰/横滚和垂直 FOV；aspect/near/far 保持固定
 *
 * @param observations 视频 UV 与三维场景坐标的对应点，至少需要 6 组
 * @param initial 当前投影相机参数，用作非线性求解初值
 * @param imageWidth 原始视频宽度，用于把归一化 U 误差换算为像素
 * @param imageHeight 原始视频高度，用于把归一化 V 误差换算为像素
 * @param maxIterations 最大迭代次数
 * @returns 优化后的相机参数、各点误差及整体误差指标
 */
export function solveCameraCalibration(
    observations: CameraCalibrationObservation[],
    initial: CameraCalibrationParameters,
    imageWidth: number,
    imageHeight: number,
    maxIterations = 80,
): CameraCalibrationResult {
    // 按相机到标定点的典型距离缩放位置变量，使位置、角度和 FOV 的优化步长处于相近量级
    const initialPosition = Cesium.Cartesian3.fromDegrees(
        initial.position[0],
        initial.position[1],
        initial.position[2],
    );
    const distances = observations.map((item) =>
        Cesium.Cartesian3.distance(
            initialPosition,
            Cesium.Cartesian3.fromElements(item.world[0], item.world[1], item.world[2]),
        ),
    );
    const positionScale = clamp(median(distances) * 0.05, 1, 50);
    // 依次对应 ENU 东/北/天、方位角、俯仰角、横滚角、FOV 的实际变化尺度
    const scales = [positionScale, positionScale, positionScale, 5, 5, 5, 10];

    // 将无量纲增量还原为真实相机参数，并约束易退化参数的有效范围
    return solveCalibration({
        observations,
        imageWidth,
        imageHeight,
        parameterCount,
        maxIterations,
        project: projectWorld,
        toParameters: (values) => ({
            ...initial,
            position: enuMetersToPosition(
                initial.position,
                values[0] * scales[0],
                values[1] * scales[1],
                values[2] * scales[2],
            ),
            azimuthDeg: initial.azimuthDeg + values[3] * scales[3],
            elevationDeg: clamp(initial.elevationDeg + values[4] * scales[4], -89, 89),
            rollDeg: initial.rollDeg + values[5] * scales[5],
            fovDeg: clamp(initial.fovDeg + values[6] * scales[6], 5, 120),
        }),
    });
}
