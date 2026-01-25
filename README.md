[英文](README_En.md)

⭐ 开源不易，点个Star支持下吧 ⭐

---

# three-video-projector

[![NPM Package][npm]][npm-url]

基于 `three.js` 的视频投影工具。仓库包含示例及源码。

该工具将 `THREE.VideoTexture` 从一个投影相机投影到场景中的目标模型上，支持深度遮挡剔除、边缘羽化、强度与透明度控制等。

---

## 在线演示

点击图片查看在线演示：

### 视频融合

[![视频融合](https://raw.githubusercontent.com/hh-hang/three-video-projection/main/example/public/imgs/2.gif "点击查看视频融合示例")](https://hh-hang.github.io/three-video-projection/)

### 电影院

[![电影院](https://raw.githubusercontent.com/hh-hang/three-video-projection/main/example/public/imgs/1.gif "点击查看电影院示例")](https://hh-hang.github.io/three-video-projection/cinema.html)

---

## 本地运行示例

```bash
# 克隆仓库
git clone https://github.com/hh-hang/three-video-projection.git

# 安装依赖
npm install

# 进入示例目录
cd example

# 安装示例依赖
npm install

# 运行开发服务器
npm run dev
```

然后在浏览器访问 `http://localhost:5173` 查看示例。

---

## 安装

```bash
npm install three-video-projection
```

---

## 快速开始

```ts
import * as THREE from "three";
import { createVideoProjector } from "./path/to/projector";

// 创建video元素并生成 VideoTexture
const video = document.createElement("video");
video.src = "path/to/video.mp4";
video.loop = true;
video.muted = true;
video.playsInline = true;
await video.play();
const videoTexture = new THREE.VideoTexture(video);

// 注：可以使用视频流，只要保证最后成功创建videoTexture

// 创建投影器
const projector = await createVideoProjector({
  scene, // three 场景
  renderer, // three 渲染器
  videoTexture, // 视频纹理
  projCamPosition: [2, 2, 2], // 投影相机位置
  projCamParams: { fov: 30, aspect: 1, near: 0.5, far: 50 }, // 投影相机参数
  orientationParams: { azimuthDeg: 180, elevationDeg: -10, rollDeg: 0 }, // 方位角/俯仰/滚转
  intensity: 1.0, // 投影颜色强度
  opacity: 1.0, // 投影透明度
  projBias: 0.0001, // 深度偏移
  edgeFeather: 0.05, // 边缘羽化程度
  isShowHelper: true, // 是否显示相机辅助器
});

// 将需要被投影的 mesh 加入
projector.addTargetMesh(myMesh1);

// 渲染循环
function animate() {
  // ... 更新场景、控制器
  projector.update();
}
animate();

// 销毁时
projector.dispose();
```

---

## API

### createVideoProjector(opts: ProjectorToolOptions): Promise<ProjectorTool>

#### ProjectorToolOptions

- `scene: THREE.Scene` — three 场景（必需）。
- `renderer: THREE.WebGLRenderer` — three 渲染器（必需）。
- `videoTexture: THREE.VideoTexture` — 用于投影的视频纹理（必需）。
- `projCamPosition?: [number, number, number]` — 投影相机在世界空间的位置。默认 `[0,0,0]`。
- `projCamParams?: { fov?: number; aspect?: number; near?: number; far?: number }` — 投影相机参数。默认 `{ fov: 30, aspect: 1, near: 0.5, far: 50 }`。
- `orientationParams?: { azimuthDeg?: number; elevationDeg?: number; rollDeg?: number }` — 方位角/俯仰/滚转（度）。默认均为 `0`。
- `depthSize?: number` — 深度渲染目标分辨率（宽/高）。默认 `1024`。
- `intensity?: number` — 投影颜色强度，默认 `1.0`。
- `opacity?: number` — 全局透明度，默认 `1.0`。
- `projBias?: number` — 深度偏移，默认 `0.0001`。
- `edgeFeather?: number` — 边缘羽化宽度，默认 `0.05`。
- `isShowHelper?: boolean` — 是否显示 `CameraHelper` 来可视化投影相机，默认 `true`。

---

#### ProjectorTool (返回对象)

方法：

- `addTargetMesh(mesh: THREE.Mesh): void` — 将目标网格加入投影列表。会在场景中创建一个 overlay（投影用）和 depth proxy（用于深度渲染）。
- `removeTargetMesh(mesh: THREE.Mesh): void` — 从投影列表移除指定 mesh，并清理对应资源。
- `update(): void` — 每帧调用以更新深度渲染目标、投影矩阵，并同步 overlay 的矩阵。
- `dispose(): void` — 销毁内部资源并从场景中移除创建的对象。
- `updateAzimuthDeg(deg: number): void` — 设置方位角（度）并应用到投影相机。
- `updateElevationDeg(deg: number): void` — 设置俯仰角（度）。
- `updateRollDeg(deg: number): void` — 设置滚转角（度）。
- `updateOpacity(opacity: number): void` — 更新投影透明度（0~1）。

属性：

- `uniforms` — 暴露给外部的着色器 uniform 对象（包含 `projectorMap`、`projectorDepthMap`、`projectorMatrix`、`intensity`、`projBias`、`edgeFeather`、`opacity` 等）。
- `overlays: THREE.Mesh[]` — 内部创建的 overlay 列表（投影用透明网格）。
- `targetMeshes: THREE.Mesh[]` — 当前被投影的目标网格列表。
- `projCam: THREE.PerspectiveCamera` — 用于投影的相机。
- `camHelper: THREE.CameraHelper | null` — 可选的相机辅助器实例。
- `orientationParams` — 当前的方位/俯仰/滚转角（度）。

---

[npm]: https://img.shields.io/npm/v/three-video-projection
[npm-url]: https://www.npmjs.com/package/three-video-projection
