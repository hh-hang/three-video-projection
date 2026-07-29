[English](README_En.md)

---

# vid3d-projection

[![NPM Package][npm]][npm-url]

`vid3d-projection` 是一个面向 `Three.js` 和 `Cesium.js` 的三维视频投影工具库，支持把视频内容投射融合到 3D 模型或地理场景中，并提供基于 2D–3D 对应点的投影相机标定求解。

---

## 在线演示

点击图片查看在线示例：

### Three.js 视频融合

[![Three.js 视频融合](https://raw.githubusercontent.com/hh-hang/vid3d-projection/main/example/public/imgs/2.gif "点击查看 Three.js 视频融合示例")](https://hh-hang.github.io/vid3d-projection/three-monitor.html)

### Cesium.js 视频融合

[![Cesium.js 视频融合](https://raw.githubusercontent.com/hh-hang/vid3d-projection/main/example/public/imgs/3.gif "点击查看 Cesium.js 视频融合示例")](https://hh-hang.github.io/vid3d-projection/cesium-monitor.html)

### Three.js 电影院

[![Three.js 电影院](https://raw.githubusercontent.com/hh-hang/vid3d-projection/main/example/public/imgs/1.gif "点击查看 Three.js 电影院示例")](https://hh-hang.github.io/vid3d-projection/three-cinema.html)

---

## 本地运行示例

```bash
git clone https://github.com/hh-hang/vid3d-projection.git
cd vid3d-projection
npm install
npm run dev
```

浏览器打开：`http://localhost:5173`

---

## 安装

```bash
npm install vid3d-projection
```
---

## 导入方式

推荐按子路径导入：

```ts
import { createThreeVideoProjector } from "vid3d-projection/three";
import { createCesiumVideoProjector } from "vid3d-projection/cesium";
```

---

## 快速开始

### Three.js

```ts
import * as THREE from "three";
import { createThreeVideoProjector } from "vid3d-projection/three";

// 准备视频源
const video = document.createElement("video");
video.src = "/video/monitorTest.mp4";
video.loop = true;
video.muted = true;
video.playsInline = true;
await video.play();

// 由 video 生成可用于着色器采样的纹理
const videoTexture = new THREE.VideoTexture(video);

// 创建投影器（核心参数：相机位置、视锥参数、朝向）
const projector = await createThreeVideoProjector({
  scene, // Three 场景
  renderer, // Three 渲染器
  videoTexture, // 投影视频纹理
  projCamPosition: [2, 2, 2], // 投影相机位置 [x, y, z]
  projCamParams: { fov: 30, aspect: 1, near: 0.1, far: 50 }, // 投影视锥参数
  orientationParams: { azimuthDeg: 180, elevationDeg: -10, rollDeg: 0 }, // 方位/俯仰/横滚（度）
  intensity: 1.0, // 投影强度（对应 uniforms.intensity）
  opacity: 1.0, // 全局透明度（0~1）
  projBias: 0.0001, // 深度偏移，减轻自遮挡/闪烁
  edgeFeather: 0.05, // 投影边缘羽化
  cropRect: [0, 0, 1, 1], // 裁剪区域 [x0, y0, x1, y1]
  quadCorners: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ], // 四角透视校正（顺序：左下、右下、右上、左上）
  isShowHelper: true, // 显示投影相机辅助线
  enableOcclusionCulling: true, // 开启遮挡剔除（关闭可提升性能，但视频会穿透遮挡物）
});

// 添加需要被投影的目标 mesh
projector.addTargetMesh(meshA);
projector.addTargetMesh(meshB);

// 渲染循环中调用 update
renderer.setAnimationLoop(() => {
  projector.update();
  renderer.render(scene, camera);
});

// 释放资源（卸载页面或销毁场景时）
projector.dispose();
```

### Cesium.js

```ts
import * as Cesium from "cesium";
import { createCesiumVideoProjector } from "vid3d-projection/cesium";

// 初始化 Cesium Viewer
const viewer = new Cesium.Viewer("cesiumContainer");

// 准备视频源
const video = document.createElement("video");
video.src = "/video/monitorTest2.mp4";
video.loop = true;
video.muted = true;
video.playsInline = true;
await video.play();

// 创建投影器
const projector = createCesiumVideoProjector(viewer, {
  projCamPosition: [116.3974, 39.9093, 100], // [经度, 纬度, 高度]
  projCamParams: { fov: 36, aspect: 1, near: 0.1, far: 120 }, // 投影视锥参数
  orientationParams: { azimuthDeg: 47, elevationDeg: -22.6, rollDeg: 0 }, // 方位/俯仰/横滚（度）
  source: video, // 投影源
  intensity: 1, // 投影强度
  opacity: 1, // 投影透明度
  projBias: 0.0001, // 深度偏移
  edgeFeather: 0.05, // 边缘羽化
  cropRect: [0, 0, 1, 1], // 裁剪区域
  quadCorners: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ], // 四角透视校正
  isShowHelper: false, // 是否显示视锥辅助线
});

// 释放资源
projector.destroy();
```

说明：

- `createCesiumVideoProjector(viewer, opts)` 会把投影器作为 primitive 加入 `viewer.scene.primitives`。
- 不需要手动调用 `projector.update()`，Cesium 渲染流程会自动调用。

### 相机标定

通过视频像素点与三维点的对应关系，在**当前投影参数**基础上最小化重投影误差，优化位置、方位/俯仰/横滚和 FOV。初值需大致合理（可先手调 GUI），对应点分布越好，收敛越稳。库只提供求解函数；选点 UI 见监控示例。

标定期间请保持 `cropRect` / `quadCorners` 为默认恒等，否则求解投影模型与最终采样可能不一致。至少需要 6 组对应点，建议 10～20 组并覆盖画面边缘与不同景深。

#### Three.js

```ts
import { solveCameraCalibration } from "vid3d-projection/three/calibration";

const result = solveCameraCalibration(
  [
    { id: 1, uv: [0.22, 0.71], world: [10.2, 1.5, -8.4] },
    // ...至少 6 组
  ],
  {
    position: [projector.projCam.position.x, projector.projCam.position.y, projector.projCam.position.z],
    azimuthDeg: projector.azimuthDeg,
    elevationDeg: projector.elevationDeg,
    rollDeg: projector.rollDeg,
    fovDeg: projector.projCam.fov,
    aspect: projector.projCam.aspect,
    near: projector.projCam.near,
    far: projector.projCam.far,
  },
  video.videoWidth,
  video.videoHeight,
);

projector.projCam.position.fromArray(result.parameters.position);
projector.projCam.fov = result.parameters.fovDeg;
projector.projCam.updateProjectionMatrix();
projector.azimuthDeg = result.parameters.azimuthDeg;
projector.elevationDeg = result.parameters.elevationDeg;
projector.rollDeg = result.parameters.rollDeg;
```

`world` 使用 Three.js 场景坐标；`uv` 为归一化视频坐标 `[0, 1]`（原点在左下）。

#### Cesium.js

```ts
import { solveCameraCalibration } from "vid3d-projection/cesium/calibration";

const result = solveCameraCalibration(
  [
    { id: 1, uv: [0.22, 0.71], world: [ecefX, ecefY, ecefZ] },
    // ...至少 6 组
  ],
  {
    position: projector.cameraPosition, // [lon, lat, height]
    azimuthDeg: projector.azimuthDeg,
    elevationDeg: projector.elevationDeg,
    rollDeg: projector.rollDeg,
    fovDeg: projector.fov,
    aspect: projector.aspect,
    near: projector.near,
    far: projector.far,
  },
  video.videoWidth,
  video.videoHeight,
);

projector.cameraPosition = result.parameters.position;
projector.azimuthDeg = result.parameters.azimuthDeg;
projector.elevationDeg = result.parameters.elevationDeg;
projector.rollDeg = result.parameters.rollDeg;
projector.fov = result.parameters.fovDeg;
```

`world` 使用 ECEF 直角坐标；`position` 为 `[经度, 纬度, 高度]`。

---

## API

### Three API

#### `createThreeVideoProjector(opts: ThreeProjectorToolOptions): Promise<ThreeProjectorTool>`

`ThreeProjectorToolOptions` 参数表：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `scene` | `THREE.Scene` | 是 | - | Three 场景实例。 |
| `renderer` | `THREE.WebGLRenderer` | 是 | - | Three 渲染器实例。 |
| `videoTexture` | `THREE.VideoTexture` | 是 | - | 投影的视频纹理。 |
| `projCamPosition` | `[number, number, number]` | 否 | `[0, 0, 0]` | 投影相机位置 `[x, y, z]`。 |
| `projCamParams.fov` | `number` | 否 | `30` | 投影相机 FOV（度）。 |
| `projCamParams.aspect` | `number` | 否 | `1` | 投影相机宽高比。 |
| `projCamParams.near` | `number` | 否 | `0.1` | 投影相机近裁剪面。 |
| `projCamParams.far` | `number` | 否 | `50` | 投影相机远裁剪面。 |
| `orientationParams.azimuthDeg` | `number` | 否 | `0` | 方位角（度）。 |
| `orientationParams.elevationDeg` | `number` | 否 | `0` | 俯仰角（度）。 |
| `orientationParams.rollDeg` | `number` | 否 | `0` | 横滚角（度）。 |
| `depthSize` | `number` | 否 | `1024` | 深度贴图分辨率（宽高相同）。 |
| `intensity` | `number` | 否 | `1` | 初始投影强度（对应 `uniforms.intensity`）。 |
| `opacity` | `number` | 否 | `1` | 初始透明度，内部会限制到 `0~1`。 |
| `projBias` | `number` | 否 | `0.0001` | 深度偏移，减少投影穿插/闪烁。 |
| `edgeFeather` | `number` | 否 | `0.05` | 边缘羽化强度。 |
| `cropRect` | `[number, number, number, number]` | 否 | `[0, 0, 1, 1]` | UV 裁剪 `[x0, y0, x1, y1]`。 |
| `quadCorners` | `[[number, number], [number, number], [number, number], [number, number]]` | 否 | `[[0,0],[1,0],[1,1],[0,1]]` | 四角透视校正，顺序：左下、右下、右上、左上。 |
| `isShowHelper` | `boolean` | 否 | `true` | 是否显示 `CameraHelper`。 |
| `enableOcclusionCulling` | `boolean` | 否 | `true` | 是否开启遮挡剔除。关闭后视频可能投射到被遮挡的面，但省去每帧的深度预渲染 pass，性能更好。 |

`ThreeProjectorTool` 方法表：

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `addTargetMesh` | `(mesh: THREE.Mesh) => void` | 把目标网格加入投影列表，并创建 overlay/depth 代理。 |
| `removeTargetMesh` | `(mesh: THREE.Mesh) => void` | 从投影列表移除目标网格及其内部代理对象。 |
| `update` | `() => void` | 更新深度贴图、投影矩阵和 overlay 变换；建议在渲染循环中调用。 |
| `dispose` | `() => void` | 清理内部资源（材质、RT、辅助对象等）。 |

`ThreeProjectorTool` 属性表：

| 属性 | 类型 | 可写 | 说明 |
| --- | --- | --- | --- |
| `azimuthDeg` | `number` | 是 | 方位角（度），写入后立即更新投影方向。 |
| `elevationDeg` | `number` | 是 | 俯仰角（度）。 |
| `rollDeg` | `number` | 是 | 横滚角（度）。 |
| `opacity` | `number` | 是 | 透明度，范围会被限制为 `0~1`。 |
| `cropRect` | `[number, number, number, number]` | 是 | UV 裁剪区域。 |
| `quadCorners` | `[[number, number], [number, number], [number, number], [number, number]]` | 是（Setter） | 四角透视校正写入入口。 |
| `uniforms` | `any` | 否 | 着色器 uniforms（如 `intensity/projBias/edgeFeather`）。 |
| `overlays` | `THREE.Mesh[]` | 否 | 内部投影 overlay 列表。 |
| `targetMeshes` | `THREE.Mesh[]` | 否 | 当前目标 mesh 列表。 |
| `projCam` | `THREE.PerspectiveCamera` | 否 | 投影相机实例。 |
| `camHelper` | `THREE.CameraHelper \| null` | 否 | 相机辅助线实例。 |
| `orientationParams` | `{ azimuthDeg: number; elevationDeg: number; rollDeg: number }` | 否 | 当前朝向参数快照。 |
| `enableOcclusionCulling` | `boolean` | 是 | 遮挡剔除开关 |

### Cesium API

#### `createCesiumVideoProjector(viewer: Cesium.Viewer, opts: CesiumProjectorOptions): CesiumProjectorTool`

`CesiumProjectorOptions` 参数表：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `viewer` | `Cesium.Viewer` | 是（函数第 1 参） | - | Cesium Viewer。 |
| `projCamPosition` | `[number, number, number]` | 否 | `[0, 0, 0]` | 投影相机地理坐标 `[lon, lat, height]`。 |
| `projCamParams.fov` | `number` | 否 | `30` | 投影视锥 FOV（度）。 |
| `projCamParams.aspect` | `number` | 否 | `1` | 投影视锥宽高比。未传时会回落到视口比例。 |
| `projCamParams.near` | `number` | 否 | `0.1` | 近裁剪面。 |
| `projCamParams.far` | `number` | 否 | `50` | 远裁剪面，同时用于计算视点距离。 |
| `orientationParams.azimuthDeg` | `number` | 否 | `0` | 方位角（度）。 |
| `orientationParams.elevationDeg` | `number` | 否 | `0` | 俯仰角（度）。 |
| `orientationParams.rollDeg` | `number` | 否 | `0` | 横滚角（度）。 |
| `source` | `HTMLVideoElement \| HTMLImageElement \| HTMLCanvasElement \| ImageData` | 否 | - | 投影纹理源，可运行时切换。 |
| `intensity` | `number` | 否 | `1` | 投影强度。 |
| `opacity` | `number` | 否 | `1` | 投影透明度，内部限制到 `0~1`。 |
| `projBias` | `number` | 否 | `0.0001` | 深度偏移。 |
| `edgeFeather` | `number` | 否 | `0.05` | 边缘羽化。 |
| `isShowHelper` | `boolean` | 否 | `true` | 是否显示视锥辅助线。 |
| `cropRect` | `[number, number, number, number]` | 否 | `[0, 0, 1, 1]` | UV 裁剪区域。 |
| `quadCorners` | `[[number, number], [number, number], [number, number], [number, number]]` | 否 | `[[0,0],[1,0],[1,1],[0,1]]` | 四角透视校正，顺序：左下、右下、右上、左上。 |

`CesiumProjectorTool` 方法表：

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `update` | `(frameState: any) => void` | Cesium primitive 生命周期调用，手动调用通常不需要。 |
| `destroy` | `() => void` | 销毁后处理、纹理、阴影图与辅助对象。 |
| `isDestroyed` | `() => boolean` | 返回是否已销毁。 |

`CesiumProjectorTool` 属性表：

| 属性 | 类型 | 可写 | 说明 |
| --- | --- | --- | --- |
| `azimuthDeg` | `number` | 是 | 方位角（度），变更后会重建投影资源。 |
| `elevationDeg` | `number` | 是 | 俯仰角（度），变更后会重建。 |
| `rollDeg` | `number` | 是 | 横滚角（度），变更后会重建。 |
| `opacity` | `number` | 是 | 投影透明度。 |
| `intensity` | `number` | 是 | 投影强度。 |
| `edgeFeather` | `number` | 是 | 边缘羽化强度。 |
| `projBias` | `number` | 是 | 深度偏移。 |
| `aspect` | `number` | 是 | 宽高比，变更后会重建。 |
| `fov` | `number` | 是 | FOV（度），变更后会重建。 |
| `isShowHelper` | `boolean` | 是 | 控制视锥辅助线显隐。 |
| `cameraPosition` | `[number, number, number]` | 是 | 地理位置 `[lon, lat, height]`，变更后会重建。 |
| `far` | `number` | 是 | 远裁剪面，变更后会重建。 |
| `near` | `number` | 是 | 近裁剪面，变更后会重建。 |
| `cropRect` | `[number, number, number, number]` | 是 | UV 裁剪区域。 |
| `quadCorners` | `[[number, number], [number, number], [number, number], [number, number]]` | 是（Setter） | 四角透视校正写入入口。 |
| `source` | `TextureSource` | 是（Setter） | 投影源切换入口（video/image/canvas/imageData）。 |

### 标定 API

#### `solveCameraCalibration(observations, initial, imageWidth, imageHeight, maxIterations?): CameraCalibrationResult`

Three / Cesium 子路径各自导出同名函数，参数空间与投影器一致。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `observations` | `CameraCalibrationObservation[]` | 是 | - | 2D–3D 对应点，至少 6 组。 |
| `initial` | `CameraCalibrationParameters` | 是 | - | 当前投影参数，作为非线性求解初值。 |
| `imageWidth` | `number` | 是 | - | 原始视频宽度（像素）。 |
| `imageHeight` | `number` | 是 | - | 原始视频高度（像素）。 |
| `maxIterations` | `number` | 否 | `80` | LM 最大迭代次数。 |

`CameraCalibrationObservation`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `number` | 标定点编号，供 UI 关联；求解器不使用。 |
| `uv` | `[number, number]` | 归一化视频坐标 `[u, v]`。 |
| `world` | `[number, number, number]` | Three：场景坐标；Cesium：ECEF 坐标。 |

`CameraCalibrationParameters`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `position` | `[number, number, number]` | Three：`[x, y, z]`；Cesium：`[lon, lat, height]`。 |
| `azimuthDeg` | `number` | 方位角（度）。 |
| `elevationDeg` | `number` | 俯仰角（度）。 |
| `rollDeg` | `number` | 横滚角（度）。 |
| `fovDeg` | `number` | 垂直 FOV（度）；优化变量之一。 |
| `aspect` | `number` | 宽高比；固定，不参与优化。 |
| `near` | `number` | 近裁剪面；固定，不参与优化。 |
| `far` | `number` | 远裁剪面；固定，不参与优化。Cesium 中同时作为方位/俯仰视点距离。 |

`CameraCalibrationResult`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `parameters` | `CameraCalibrationParameters` | 求解后的完整相机参数。 |
| `rmsePx` | `number` | 重投影误差 RMSE（像素）。 |
| `maxErrorPx` | `number` | 最大单点重投影误差（像素）。 |
| `errorsPx` | `number[]` | 各点重投影误差，顺序与 `observations` 一致。 |
| `iterations` | `number` | 实际 LM 迭代次数。 |

优化变量为位置（Three：XYZ；Cesium：相对初值的 ENU 米制增量）、方位/俯仰/横滚和 FOV。

---

[npm]: https://img.shields.io/npm/v/vid3d-projection
[npm-url]: https://www.npmjs.com/package/vid3d-projection
