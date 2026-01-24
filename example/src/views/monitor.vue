<template>
  <div
    ref="cont"
    style="width: 100vw; height: 100vh; overflow: hidden; position: absolute"
  ></div>
  <div class="model-credit">
    模型来源：
    <a
      href="https://sketchfab.com/3d-models/s5-wtrzebnica-112017-75914beaf05941e1a24b6bca530dc1a6"
      target="_blank"
      rel="noopener noreferrer"
    >
      Sketchfab
    </a>
    <br />
    <span>注：视频中实际位置与模型位置不一致，仅作参考</span>
  </div>

  <a class="source" href="" target="_blank" rel="noopener noreferrer">
    <img src="/imgs/source.svg" alt="" />
  </a>
</template>

<script setup lang="ts">
import Stats from "stats.js";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  createVideoProjector,
  ProjectorTool,
} from "../../../src/three-video-projection";

const cont = ref<HTMLDivElement | null>(null);
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let stats: any;
let projectorTool: ProjectorTool;
let projCam: THREE.PerspectiveCamera;
let camHelper: THREE.CameraHelper | null = null;
let gui: any = null;
let video: HTMLVideoElement;
let isAutoOpacity = true;

const position: [number, number, number] = [-65.39, 119, 254.18];

onMounted(async () => {
  const container = cont.value!;
  scene = new THREE.Scene();

  // 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  // 监视器
  stats = new Stats();
  container.appendChild(stats.dom);

  // 相机
  camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000,
  );
  camera.position.set(position[0], position[1], position[2]);

  // 控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.maxDistance = 2000;
  controls.maxPolarAngle = Math.PI / 2;
  controls.target.set(position[0] - 1, position[1] + 1, position[2] + 1);

  //  环境光
  const ambient = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambient);

  video = document.createElement("video");
  video.src = "/video/monitorTest.mp4";
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  const videoTexture = new THREE.VideoTexture(video);
  video.play();

  // 投影工具
  projectorTool = await createVideoProjector({
    scene,
    renderer,
    projCamPosition: position,
    projCamParams: { fov: 36.6, aspect: 1, near: 0.1, far: 400 },
    orientationParams: { azimuthDeg: 90, elevationDeg: -18.2, rollDeg: 0 },
    videoTexture,
    isShowHelper: false,
  });

  projCam = projectorTool.projCam;
  camHelper = projectorTool.camHelper;

  camera.quaternion.copy(projCam.quaternion);
  camera.updateMatrixWorld();

  const dir = new THREE.Vector3();
  projCam.getWorldDirection(dir);
  const targetPoint = projCam
    .getWorldPosition(new THREE.Vector3())
    .add(dir.multiplyScalar(50));
  controls.target.copy(targetPoint);
  controls.update();

  // 调试
  gui = new GUI({ title: "投影相机控制" });
  const cfg: any = {
    showHelpers: projectorTool.camHelper?.visible,
    intensity: projectorTool.uniforms.intensity.value,
    projFov: projCam.fov,
    proFar: projCam.far,
    proNear: projCam.near,
    azimuthDeg: projectorTool.orientationParams.azimuthDeg,
    elevationDeg: projectorTool.orientationParams.elevationDeg,
    rollDeg: projectorTool.orientationParams.rollDeg,
    projBias: projectorTool.uniforms.projBias.value,
    projPosX: projCam.position.x,
    projPosY: projCam.position.y,
    projPosZ: projCam.position.z,
    edgeFeather: projectorTool.uniforms.edgeFeather.value,
    videoAspect: projCam.aspect,
    isAutoOpacity: isAutoOpacity,
  };

  function updatePositionFromGUI() {
    projCam.position.set(cfg.projPosX, cfg.projPosY, cfg.projPosZ);
    if (camHelper) camHelper.update();
  }

  const projFolder = gui.addFolder("投影参数");
  projFolder
    .add(cfg, "intensity", 0, 3, 0.01)
    .name("投影强度(intensity)")
    .onChange((v: number) => {
      projectorTool.uniforms.intensity.value = v;
    });
  projFolder
    .add(cfg, "proFar", 1, 500, 10)
    .name("(远裁剪)far")
    .onChange((v: number) => {
      projCam.far = v;
      projCam.updateProjectionMatrix();
      if (camHelper) camHelper.update();
    });
  projFolder
    .add(cfg, "proNear", 1, 10, 0.1)
    .name("(近裁剪)near")
    .onChange((v: number) => {
      projCam.near = v;
      projCam.updateProjectionMatrix();
      if (camHelper) camHelper.update();
    });
  projFolder
    .add(cfg, "projFov", 1, 120, 0.1)
    .name("投影视场角(FOV)")
    .onChange((v: number) => {
      projCam.fov = v;
      projCam.updateProjectionMatrix();
      if (camHelper) camHelper.update();
    });
  projFolder
    .add(cfg, "edgeFeather", 0, 0.5, 0.001)
    .name("边缘羽化(edgeFeather)")
    .onChange((v: number) => {
      projectorTool.uniforms.edgeFeather.value = v;
    });
  projFolder
    .add(cfg, "videoAspect", 0.1, 10, 0.01)
    .name("视频宽高比(aspect)")
    .onChange((v: number) => {
      projCam.aspect = v;
      projCam.updateProjectionMatrix();
      if (camHelper) camHelper.update();
    });
  projFolder
    .add(cfg, "azimuthDeg", -180, 180, 0.1)
    .name("方位角(azimuth)")
    .onChange((v: number) => {
      projectorTool.updateAzimuthDeg(v);
    });
  projFolder
    .add(cfg, "elevationDeg", -89, 89, 0.1)
    .name("俯仰角(elevation)")
    .onChange((v: number) => {
      projectorTool.updateElevationDeg(v);
    });
  projFolder
    .add(cfg, "rollDeg", -180, 180, 0.1)
    .name("横滚(roll)")
    .onChange((v: number) => {
      projectorTool.updateRollDeg(v);
    });
  projFolder
    .add(cfg, "projBias", 0.0, 0.001, 0.00001)
    .name("深度偏移(bias)")
    .onChange((v: number) => {
      projectorTool.uniforms.projBias.value = v;
    });
  projFolder
    .add(cfg, "showHelpers")
    .name("相机辅助器(helpers)")
    .onChange((v: boolean) => {
      if (camHelper) camHelper.visible = v;
    });
  projFolder
    .add(cfg, "isAutoOpacity")
    .name("自动调节透明度(isAutoOpacity)")
    .onChange((v: boolean) => {
      isAutoOpacity = v;
      if (!isAutoOpacity) projectorTool.updateOpacity(1);
    });

  const posFolder = gui.addFolder("相机坐标(position)");
  posFolder
    .add(cfg, "projPosX", -500, 500, 0.01)
    .name("X")
    .onChange(updatePositionFromGUI);
  posFolder
    .add(cfg, "projPosY", -500, 500, 0.01)
    .name("Y")
    .onChange(updatePositionFromGUI);
  posFolder
    .add(cfg, "projPosZ", -500, 500, 0.01)
    .name("Z")
    .onChange(updatePositionFromGUI);

  projFolder.open();
  posFolder.open();

  renderer.setAnimationLoop(() => {
    if (projectorTool) projectorTool.update();
    renderer.render(scene, camera);
    stats.update();
    setOpacityByDistance();
  });

  window.addEventListener("resize", resize);
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
  }

  // 加载模型
  const gltfLoader = new GLTFLoader();
  gltfLoader.loadAsync("/model/s5_w.trzebnica_11.2017.glb").then((gltf) => {
    const model = gltf.scene;
    model.traverse((child: any) => {
      if (child.isMesh) {
        if (projectorTool) projectorTool.addTargetMesh(child);
      }
    });
    scene.add(model);
  });

  // 根据距离设置透明度
  function setOpacityByDistance() {
    if (!isAutoOpacity) return;
    const distance = camera.position.distanceTo(projCam.position);
    const opacity = (50 - distance) / 50;
    projectorTool.updateOpacity(opacity);
    return distance;
  }
});

onBeforeUnmount(() => {
  try {
    renderer.setAnimationLoop(null);
    window.removeEventListener("resize", () => {});
    if (projectorTool) projectorTool.dispose();
    if (gui)
      try {
        gui.destroy();
      } catch (e) {}
    scene.traverse((child: any) => {
      if (child.material) {
        if (Array.isArray(child.material))
          child.material.forEach((m: any) => m.dispose());
        else child.material.dispose();
      }
      if (child.geometry) child.geometry.dispose();
    });
    renderer.dispose();
  } catch (e) {}
});
</script>

<style scoped>
canvas {
  display: block;
}
.model-credit {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  font-size: 16px;
  color: #e6eef6;
  background: rgba(0, 0, 0, 0.35);
  padding: 6px 12px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    Arial;
}

.model-credit a {
  color: #6ecbff;
  text-decoration: none;
}

.model-credit a:hover {
  text-decoration: underline;
}

.source {
  position: fixed;
  bottom: 16px;
  right: 16px;
  padding: 12px;
  border-radius: 50%;
  margin-bottom: 0px;
  background-color: #fff;
  opacity: 0.9;
  z-index: 999;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.15);

  img {
    display: block;
    width: 24px;
  }
}
</style>
