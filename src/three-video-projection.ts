import * as THREE from "three";

export type ProjectorToolOptions = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  videoTexture: THREE.VideoTexture;
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
  depthSize?: number;
  intensity?: number;
  opacity?: number;
  projBias?: number;
  edgeFeather?: number;
  isShowHelper?: boolean;
};

export type ProjectorTool = {
  addTargetMesh: (mesh: THREE.Mesh) => void;
  removeTargetMesh: (mesh: THREE.Mesh) => void;
  update: () => void;
  dispose: () => void;
  updateAzimuthDeg: (deg: number) => void;
  updateElevationDeg: (deg: number) => void;
  updateRollDeg: (deg: number) => void;
  updateOpacity: (opacity: number) => void;
  uniforms: any;
  overlays: THREE.Mesh[];
  targetMeshes: THREE.Mesh[];
  projCam: THREE.PerspectiveCamera;
  camHelper: THREE.CameraHelper | null;
  orientationParams: {
    azimuthDeg: number;
    elevationDeg: number;
    rollDeg: number;
  };
};

export async function createVideoProjector(
  opts: ProjectorToolOptions,
): Promise<ProjectorTool> {
  const {
    scene,
    renderer,
    videoTexture,
    projCamPosition = [0, 0, 0],
    projCamParams = { fov: 30, aspect: 1, near: 0.5, far: 50 },
    orientationParams = { azimuthDeg: 0, elevationDeg: 0, rollDeg: 0 },
    depthSize = 1024,
    intensity = 1.0,
    opacity = 1.0,
    projBias = 0.0001,
    edgeFeather = 0.05,
    isShowHelper = true,
  } = opts;

  let orientParams = {
    azimuthDeg: orientationParams.azimuthDeg ?? 0,
    elevationDeg: orientationParams.elevationDeg ?? 0,
    rollDeg: orientationParams.rollDeg ?? 0,
  };
  let projCam: THREE.PerspectiveCamera;
  let camHelper: THREE.CameraHelper | null = null;

  // 创建投影相机
  projCam = new THREE.PerspectiveCamera(
    projCamParams.fov ?? 30,
    projCamParams.aspect ?? 1,
    projCamParams.near ?? 0.5,
    projCamParams.far ?? 50,
  );
  projCam.position.set(
    projCamPosition[0],
    projCamPosition[1],
    projCamPosition[2],
  );
  projCam.lookAt(0, 0, 0);
  scene.add(projCam);

  // 更新相机朝向
  applyOrientationFromAngles();

  // 创建相机辅助器
  camHelper = new THREE.CameraHelper(projCam);
  camHelper.name = "camHelper";
  camHelper.visible = isShowHelper;
  scene.add(camHelper);

  // 视频纹理
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.generateMipmaps = false;

  // 着色器
  const projectorUniforms: any = {
    projectorMap: { value: videoTexture },
    projectorMatrix: { value: new THREE.Matrix4() },
    intensity: { value: intensity },
    projectorDepthMap: { value: null },
    projBias: { value: projBias },
    edgeFeather: { value: edgeFeather },
    opacity: { value: opacity },
  };

  const vertexShader = `
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldPos.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

  const fragmentShader = `
      uniform sampler2D projectorMap;
      uniform sampler2D projectorDepthMap;
      uniform mat4 projectorMatrix;
      uniform float intensity;
      uniform float projBias;
      uniform float edgeFeather;
      uniform float opacity;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec4 projPos = projectorMatrix * vec4(vWorldPos, 1.0);
        if (projPos.w <= 0.0) discard;
        vec2 uv = projPos.xy / projPos.w * 0.5 + 0.5;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
        vec4 color = texture(projectorMap, uv);
        
        // 遮挡剔除
        float projNDCz = projPos.z / projPos.w;
        float projDepth01 = projNDCz * 0.5 + 0.5;
        float sceneDepth01 = texture(projectorDepthMap, uv).x;
        if (projDepth01 > sceneDepth01 + projBias) {
          discard;
        }

        // 边缘羽化
        vec2 adjUV = uv;
        float minDist = min(min(adjUV.x, 1.0 - adjUV.x), min(adjUV.y, 1.0 - adjUV.y));
        float edgeFactor = 1.0;
        if (edgeFeather > 0.0) {
            edgeFactor = smoothstep(0.0, edgeFeather, minDist);
        }
        float effectiveAlpha = color.a * edgeFactor;

        // 输出
        vec3 outRGB = color.rgb * intensity * edgeFactor * opacity;
        float outA = effectiveAlpha * opacity;
        gl_FragColor = vec4(outRGB, outA);
      }
    `;

  const projectorMat = new THREE.ShaderMaterial({
    uniforms: projectorUniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    alphaTest: 0.02,
  });

  const projectorDepthRT = new THREE.WebGLRenderTarget(depthSize, depthSize, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    stencilBuffer: false,
    depthBuffer: true,
  });
  projectorDepthRT.depthTexture = new THREE.DepthTexture(
    depthSize,
    depthSize,
    THREE.UnsignedShortType,
  );

  const depthScene = new THREE.Scene();
  const depthMaterial = new THREE.MeshDepthMaterial();
  depthMaterial.depthPacking = THREE.RGBADepthPacking;
  depthMaterial.side = THREE.FrontSide;

  const overlays: THREE.Mesh[] = [];
  const targetMeshes: THREE.Mesh[] = [];
  const depthProxies: THREE.Mesh[] = [];

  // 创建投影mesh
  function makeProjectorOverlayAndProxy(mesh: THREE.Mesh) {
    const overlay = new THREE.Mesh(mesh.geometry, projectorMat);
    overlay.matrixAutoUpdate = false;
    overlay.renderOrder = (mesh.renderOrder || 0) + 1;
    mesh.updateMatrixWorld(true);
    overlay.matrix.copy(mesh.matrixWorld);
    scene.add(overlay);

    const proxy = new THREE.Mesh(mesh.geometry, depthMaterial);
    proxy.matrixAutoUpdate = false;
    depthScene.add(proxy);

    overlays.push(overlay);
    depthProxies.push(proxy);

    return { overlay, proxy };
  }

  // 添加目标mesh(投影)
  function addTargetMesh(mesh: THREE.Mesh) {
    if (targetMeshes.indexOf(mesh) !== -1) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    targetMeshes.push(mesh);
    makeProjectorOverlayAndProxy(mesh);
  }

  // 移除目标mesh
  function removeTargetMesh(mesh: THREE.Mesh) {
    const idx = targetMeshes.indexOf(mesh);
    if (idx === -1) return;
    targetMeshes.splice(idx, 1);

    const ov = overlays.splice(idx, 1)[0];
    if (ov) scene.remove(ov);

    const proxy = depthProxies.splice(idx, 1)[0];
    if (proxy) depthScene.remove(proxy);
  }

  // 每帧调用
  function update() {
    for (let i = 0; i < targetMeshes.length; i++) {
      const src = targetMeshes[i];
      const proxy = depthProxies[i];
      src.updateMatrixWorld(true);
      proxy.matrix.copy(src.matrixWorld);
    }

    renderer.setRenderTarget(projectorDepthRT);
    renderer.clear();
    renderer.render(depthScene, projCam);
    renderer.setRenderTarget(null);

    projectorUniforms.projectorDepthMap.value = projectorDepthRT.depthTexture;

    const projectorMatrix = new THREE.Matrix4();
    projectorMatrix.multiplyMatrices(
      projCam.projectionMatrix,
      projCam.matrixWorldInverse,
    );
    projectorUniforms.projectorMatrix.value.copy(projectorMatrix);

    for (let i = 0; i < targetMeshes.length; i++) {
      const src = targetMeshes[i];
      const overlay = overlays[i];
      src.updateMatrixWorld(true);
      overlay.matrix.copy(src.matrixWorld);
    }
  }

  // 销毁
  function dispose() {
    for (let ov of overlays) scene.remove(ov);
    for (let p of depthProxies) depthScene.remove(p);
    overlays.length = 0;
    depthProxies.length = 0;
    targetMeshes.length = 0;

    projectorMat.dispose();
    depthMaterial.dispose();
    try {
      projectorDepthRT.dispose();
    } catch (e) {}
    try {
      videoTexture.dispose();
    } catch (e) {}

    if (camHelper) {
      try {
        scene.remove(camHelper);
      } catch (e) {}
      camHelper = null;
    }
  }

  // 更新方位角
  function updateAzimuthDeg(deg: number) {
    orientParams.azimuthDeg = deg;
    applyOrientationFromAngles();
  }

  // 更新俯仰角
  function updateElevationDeg(deg: number) {
    orientParams.elevationDeg = deg;
    applyOrientationFromAngles();
  }

  // 更新滚转角
  function updateRollDeg(deg: number) {
    orientParams.rollDeg = deg;
    applyOrientationFromAngles();
  }

  // 更新相机朝向及旋转角
  function applyOrientationFromAngles() {
    const az = THREE.MathUtils.degToRad(orientParams.azimuthDeg);
    const el = THREE.MathUtils.degToRad(orientParams.elevationDeg);
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.cos(az),
      Math.sin(el),
      Math.cos(el) * Math.sin(az),
    ).normalize();
    const lookTarget = new THREE.Vector3().copy(projCam.position).add(dir);
    projCam.up.set(0, 1, 0);
    projCam.lookAt(lookTarget);
    projCam.updateMatrixWorld(true);
    const rollRad = THREE.MathUtils.degToRad(orientParams.rollDeg);
    projCam.rotateOnAxis(new THREE.Vector3(0, 0, 1), rollRad);
    projCam.updateMatrixWorld(true);
    if (camHelper) camHelper.update();
  }

  // 更新透明度
  function updateOpacity(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    projectorUniforms.opacity.value = clamped;
  }

  return {
    addTargetMesh,
    removeTargetMesh,
    update,
    dispose,
    updateAzimuthDeg,
    updateElevationDeg,
    updateRollDeg,
    updateOpacity,
    uniforms: projectorUniforms,
    overlays,
    targetMeshes,
    projCam,
    camHelper,
    orientationParams: orientParams,
  };
}
