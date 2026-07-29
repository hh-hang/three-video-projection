[中文](README.md)

---

# vid3d-projection

[![NPM Package][npm]][npm-url]

`vid3d-projection` is a 3D video projection utility for `Three.js` and `Cesium.js`, designed for projecting and blending video content into 3D meshes or geographic scenes.

---

## Live Demo

Click the images to open the live demos:

### Three.js Video Fusion

[![Three.js Video Fusion](https://raw.githubusercontent.com/hh-hang/vid3d-projection/main/example/public/imgs/2.gif "Open Three.js Video Fusion demo")](https://hh-hang.github.io/vid3d-projection/three-monitor.html)

### Cesium.js Video Fusion

[![Cesium.js Video Fusion](https://raw.githubusercontent.com/hh-hang/vid3d-projection/main/example/public/imgs/3.gif "Open Cesium.js Video Fusion demo")](https://hh-hang.github.io/vid3d-projection/cesium-monitor.html)

### Three.js Cinema

[![Three.js Cinema](https://raw.githubusercontent.com/hh-hang/vid3d-projection/main/example/public/imgs/1.gif "Open Three.js Cinema demo")](https://hh-hang.github.io/vid3d-projection/three-cinema.html)

---

## Run Examples Locally

```bash
git clone https://github.com/hh-hang/vid3d-projection.git
cd vid3d-projection
npm install
npm run dev
```

Open in browser: `http://localhost:5173`

---

## Installation

```bash
npm install vid3d-projection
```

---

## Imports

Recommended subpath imports:

```ts
import { createThreeVideoProjector } from "vid3d-projection/three";
import { createCesiumVideoProjector } from "vid3d-projection/cesium";
```

You can also import from the root entry:

```ts
import {
  createThreeVideoProjector,
  createCesiumVideoProjector,
} from "vid3d-projection";
```

---

## Quick Start

### Three.js

```ts
import * as THREE from "three";
import { createThreeVideoProjector } from "vid3d-projection/three";

// Prepare a video source
const video = document.createElement("video");
video.src = "/video/monitorTest.mp4";
video.loop = true;
video.muted = true;
video.playsInline = true;
await video.play();

// Create a texture from the video for shader sampling
const videoTexture = new THREE.VideoTexture(video);

// Create projector (core params: camera position, frustum, orientation)
const projector = await createThreeVideoProjector({
  scene, // Three scene
  renderer, // Three renderer
  videoTexture, // video texture to project
  projCamPosition: [2, 2, 2], // projector position [x, y, z]
  projCamParams: { fov: 30, aspect: 1, near: 0.1, far: 50 }, // projector frustum params
  orientationParams: { azimuthDeg: 180, elevationDeg: -10, rollDeg: 0 }, // azimuth/elevation/roll (degrees)
  intensity: 1.0, // projection intensity (maps to uniforms.intensity)
  opacity: 1.0, // global opacity (0~1)
  projBias: 0.0001, // depth bias to reduce acne/flicker
  edgeFeather: 0.05, // projection edge feathering
  cropRect: [0, 0, 1, 1], // crop area [x0, y0, x1, y1]
  quadCorners: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ], // keystone correction (order: BL, BR, TR, TL)
  isShowHelper: true, // show projector camera helper
  enableOcclusionCulling: true, // enable occlusion culling (disable to improve performance, but video will bleed through occluders)
});

// Add target meshes to receive projection
projector.addTargetMesh(meshA);
projector.addTargetMesh(meshB);

// Call update in render loop
renderer.setAnimationLoop(() => {
  projector.update();
  renderer.render(scene, camera);
});

// Dispose resources when unmounting/destroying scene
projector.dispose();
```

### Cesium.js

```ts
import * as Cesium from "cesium";
import { createCesiumVideoProjector } from "vid3d-projection/cesium";

// Initialize Cesium Viewer
const viewer = new Cesium.Viewer("cesiumContainer");

// Prepare a video source
const video = document.createElement("video");
video.src = "/video/monitorTest2.mp4";
video.loop = true;
video.muted = true;
video.playsInline = true;
await video.play();

// Create projector
const projector = createCesiumVideoProjector(viewer, {
  projCamPosition: [116.3974, 39.9093, 100], // [longitude, latitude, height]
  projCamParams: { fov: 36, aspect: 1, near: 0.1, far: 120 }, // projector frustum params
  orientationParams: { azimuthDeg: 47, elevationDeg: -22.6, rollDeg: 0 }, // azimuth/elevation/roll (degrees)
  source: video, // projection source
  intensity: 1, // projection intensity
  opacity: 1, // projection opacity
  projBias: 0.0001, // depth bias
  edgeFeather: 0.05, // edge feathering
  cropRect: [0, 0, 1, 1], // crop area
  quadCorners: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ], // keystone correction
  isShowHelper: false, // show/hide frustum helper
});

// Dispose resources
projector.destroy();
```

Notes:

- `createCesiumVideoProjector(viewer, opts)` adds the projector as a primitive into `viewer.scene.primitives`.
- You do not need to call `projector.update()` manually; Cesium calls it in its render pipeline.

---

## API

### Three API

#### `createThreeVideoProjector(opts: ThreeProjectorToolOptions): Promise<ThreeProjectorTool>`

`ThreeProjectorToolOptions` Parameter Table:

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `scene` | `THREE.Scene` | Yes | - | Three scene instance. |
| `renderer` | `THREE.WebGLRenderer` | Yes | - | Three renderer instance. |
| `videoTexture` | `THREE.VideoTexture` | Yes | - | Video texture used for projection. |
| `projCamPosition` | `[number, number, number]` | No | `[0, 0, 0]` | Projector camera position `[x, y, z]`. |
| `projCamParams.fov` | `number` | No | `30` | Projector camera FOV (degrees). |
| `projCamParams.aspect` | `number` | No | `1` | Projector camera aspect ratio. |
| `projCamParams.near` | `number` | No | `0.1` | Projector camera near plane. |
| `projCamParams.far` | `number` | No | `50` | Projector camera far plane. |
| `orientationParams.azimuthDeg` | `number` | No | `0` | Azimuth angle (degrees). |
| `orientationParams.elevationDeg` | `number` | No | `0` | Elevation angle (degrees). |
| `orientationParams.rollDeg` | `number` | No | `0` | Roll angle (degrees). |
| `depthSize` | `number` | No | `1024` | Depth texture resolution (square). |
| `intensity` | `number` | No | `1` | Initial projection intensity (maps to `uniforms.intensity`). |
| `opacity` | `number` | No | `1` | Initial opacity, clamped internally to `0~1`. |
| `projBias` | `number` | No | `0.0001` | Depth bias to reduce projection acne/flicker. |
| `edgeFeather` | `number` | No | `0.05` | Projection edge feather amount. |
| `cropRect` | `[number, number, number, number]` | No | `[0, 0, 1, 1]` | UV crop rectangle `[x0, y0, x1, y1]`. |
| `quadCorners` | `[[number, number], [number, number], [number, number], [number, number]]` | No | `[[0,0],[1,0],[1,1],[0,1]]` | Keystone correction corners; order: BL, BR, TR, TL. |
| `isShowHelper` | `boolean` | No | `true` | Whether to show `CameraHelper`. |
| `enableOcclusionCulling` | `boolean` | No | `true` | Whether to enable occlusion culling. When disabled, video may bleed through occluding geometry, but the per-frame depth pre-render pass is skipped for better performance. |

`ThreeProjectorTool` Method Table:

| Method | Signature | Description |
| --- | --- | --- |
| `addTargetMesh` | `(mesh: THREE.Mesh) => void` | Adds a mesh to projection targets and creates overlay/depth proxy. |
| `removeTargetMesh` | `(mesh: THREE.Mesh) => void` | Removes a mesh and related internal proxy objects. |
| `update` | `() => void` | Updates depth texture, projector matrix, and overlay transforms; call in render loop. |
| `dispose` | `() => void` | Cleans up internal resources (materials, render targets, helper objects). |

`ThreeProjectorTool` Property Table:

| Property | Type | Writable | Description |
| --- | --- | --- | --- |
| `azimuthDeg` | `number` | Yes | Azimuth angle (degrees); updates projector direction immediately. |
| `elevationDeg` | `number` | Yes | Elevation angle (degrees). |
| `rollDeg` | `number` | Yes | Roll angle (degrees). |
| `opacity` | `number` | Yes | Opacity, clamped to `0~1`. |
| `cropRect` | `[number, number, number, number]` | Yes | UV crop rectangle. |
| `quadCorners` | `[[number, number], [number, number], [number, number], [number, number]]` | Yes (Setter) | Setter entry for keystone correction corners. |
| `uniforms` | `any` | No | Shader uniforms (e.g. `intensity/projBias/edgeFeather`). |
| `overlays` | `THREE.Mesh[]` | No | Internal projection overlay mesh list. |
| `targetMeshes` | `THREE.Mesh[]` | No | Current projection target mesh list. |
| `projCam` | `THREE.PerspectiveCamera` | No | Projector camera instance. |
| `camHelper` | `THREE.CameraHelper \| null` | No | Camera helper instance. |
| `orientationParams` | `{ azimuthDeg: number; elevationDeg: number; rollDeg: number }` | No | Current orientation parameter snapshot. |
| `enableOcclusionCulling` | `boolean` | Yes | Occlusion culling toggle; can be switched at runtime. |

### Cesium API

#### `createCesiumVideoProjector(viewer: Cesium.Viewer, opts: CesiumProjectorOptions): CesiumProjectorTool`

`CesiumProjectorOptions` Parameter Table:

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `viewer` | `Cesium.Viewer` | Yes (1st function arg) | - | Cesium Viewer instance. |
| `projCamPosition` | `[number, number, number]` | No | `[0, 0, 0]` | Projector geodetic position `[lon, lat, height]`. |
| `projCamParams.fov` | `number` | No | `30` | Projector frustum FOV (degrees). |
| `projCamParams.aspect` | `number` | No | `1` | Projector frustum aspect ratio. Falls back to viewport ratio when omitted. |
| `projCamParams.near` | `number` | No | `0.1` | Near clipping plane. |
| `projCamParams.far` | `number` | No | `50` | Far clipping plane; also used for viewpoint distance computation. |
| `orientationParams.azimuthDeg` | `number` | No | `0` | Azimuth angle (degrees). |
| `orientationParams.elevationDeg` | `number` | No | `0` | Elevation angle (degrees). |
| `orientationParams.rollDeg` | `number` | No | `0` | Roll angle (degrees). |
| `source` | `HTMLVideoElement \| HTMLImageElement \| HTMLCanvasElement \| ImageData` | No | - | Projection texture source; can be switched at runtime. |
| `intensity` | `number` | No | `1` | Projection intensity. |
| `opacity` | `number` | No | `1` | Projection opacity, clamped internally to `0~1`. |
| `projBias` | `number` | No | `0.0001` | Depth bias. |
| `edgeFeather` | `number` | No | `0.05` | Edge feather amount. |
| `isShowHelper` | `boolean` | No | `true` | Whether to show the frustum helper. |
| `cropRect` | `[number, number, number, number]` | No | `[0, 0, 1, 1]` | UV crop rectangle. |
| `quadCorners` | `[[number, number], [number, number], [number, number], [number, number]]` | No | `[[0,0],[1,0],[1,1],[0,1]]` | Keystone correction corners; order: BL, BR, TR, TL. |

`CesiumProjectorTool` Method Table:

| Method | Signature | Description |
| --- | --- | --- |
| `update` | `(frameState: any) => void` | Called by Cesium primitive lifecycle; manual calling is usually unnecessary. |
| `destroy` | `() => void` | Destroys post-process stage, texture, shadow map, and helper resources. |
| `isDestroyed` | `() => boolean` | Returns whether the projector is already destroyed. |

`CesiumProjectorTool` Property Table:

| Property | Type | Writable | Description |
| --- | --- | --- | --- |
| `azimuthDeg` | `number` | Yes | Azimuth angle (degrees); rebuilding resources after change. |
| `elevationDeg` | `number` | Yes | Elevation angle (degrees); rebuilding resources after change. |
| `rollDeg` | `number` | Yes | Roll angle (degrees); rebuilding resources after change. |
| `opacity` | `number` | Yes | Projection opacity. |
| `intensity` | `number` | Yes | Projection intensity. |
| `edgeFeather` | `number` | Yes | Edge feather strength. |
| `projBias` | `number` | Yes | Depth bias. |
| `aspect` | `number` | Yes | Aspect ratio; rebuilding resources after change. |
| `fov` | `number` | Yes | FOV (degrees); rebuilding resources after change. |
| `isShowHelper` | `boolean` | Yes | Toggle frustum helper visibility. |
| `cameraPosition` | `[number, number, number]` | Yes | Geodetic position `[lon, lat, height]`; rebuilding resources after change. |
| `far` | `number` | Yes | Far plane; rebuilding resources after change. |
| `near` | `number` | Yes | Near plane; rebuilding resources after change. |
| `cropRect` | `[number, number, number, number]` | Yes | UV crop rectangle. |
| `quadCorners` | `[[number, number], [number, number], [number, number], [number, number]]` | Yes (Setter) | Setter entry for keystone correction corners. |
| `source` | `TextureSource` | Yes (Setter) | Projection source switch entry (video/image/canvas/imagedata). |

---

[npm]: https://img.shields.io/npm/v/vid3d-projection
[npm-url]: https://www.npmjs.com/package/vid3d-projection
