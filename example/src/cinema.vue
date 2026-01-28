<template>
  <div class="container" id="container" ref="cont"></div>
  <div class="model-credit">
    影院模型：<a
      href="https://sketchfab.com/3d-models/cinemamovie-theater-interior-dcaf6cdebcad4f03879c24186da257ee"
      target="_blank"
      rel="noopener noreferrer"
    >
      Sketchfab
    </a>
    场景模型：<a
      href="https://sketchfab.com/3d-models/futuristic-city-b4c3c957fad245d580e7a7d1a01c526b"
      target="_blank"
      rel="noopener noreferrer"
    >
      Sketchfab
    </a>
    <br />
    人物控制器：<a
      href="https://github.com/hh-hang/three-player-controller"
      target="_blank"
      rel="noopener noreferrer"
    >
      three-player-controller
    </a>
  </div>

  <a
    class="source"
    href="https://github.com/hh-hang/three-video-projection/blob/main/example/src/cinema.vue"
    target="_blank"
    rel="noopener noreferrer"
  >
    <img src="/imgs/source.svg" alt="" />
  </a>

  <div class="hud" role="note" aria-label="操作提示">
    <div class="row hint-group">
      <span class="hint-text">控制移动：</span>
      <kbd>W</kbd>
      <kbd>A</kbd>
      <kbd>S</kbd>
      <kbd>D</kbd>
    </div>
    <div class="row hint-group">
      <span class="hint-text">加速：</span>
      <kbd>Shift</kbd>
    </div>
    <div class="row hint-group">
      <span class="hint-text">跳跃：</span>
      <kbd>Space</kbd>
    </div>
    <div class="row hint-group">
      <span class="hint-text">切换视角：</span>
      <kbd>V</kbd>
    </div>
    <div class="row hint-group">
      <span class="hint-text">切换飞行模式：</span>
      <kbd>F</kbd>
    </div>
  </div>

  <div class="play" v-if="isShowPlay">
    <button class="play-button" @click="start">开始（Start）</button>
  </div>
</template>

<script setup lang="ts">
import Hls from "hls.js";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  VideoTexture,
  WebGLRenderer,
} from "three";
import { playerController } from "three-player-controller";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  createVideoProjector,
  ProjectorTool,
} from "../../src/three-video-projection";

const cont = ref<HTMLDivElement>();
const player = playerController();
let projectorTool: ProjectorTool;
const isShowPlay = ref(false);

const gltfLoader = new GLTFLoader();
const scene = new Scene();
const stats = new Stats();

let camera: PerspectiveCamera;
let renderer: WebGLRenderer;
let controls: OrbitControls;
let video: HTMLVideoElement;

const pos = new Vector3(0.034, 3.5, -7.14);

let containerEl: HTMLDivElement | null = null;
let isUpdatePlayer: boolean = false;

// 挂载
onMounted(async () => {
  containerEl = cont.value!;

  // 渲染器
  renderer = new WebGLRenderer({
    antialias: true,
  });
  const initialDPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(initialDPR);
  renderer.setSize(containerEl.clientWidth, containerEl.clientHeight, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.display = "block";
  containerEl.appendChild(renderer.domElement);

  // 监视器
  const statsDom = stats.dom as HTMLElement;
  statsDom.style.position = "absolute";
  statsDom.style.top = "0";
  statsDom.style.right = "0";
  statsDom.style.left = "auto";
  containerEl.appendChild(statsDom);

  // 创建相机
  camera = new PerspectiveCamera(
    70,
    containerEl.clientWidth / containerEl.clientHeight,
    0.05,
    1000,
  );
  camera.rotation.order = "YXZ";
  camera.position.copy(pos);
  camera.lookAt(pos.x, pos.y, pos.z + 1);

  // 控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 1;
  controls.maxPolarAngle = Math.PI / 2;
  controls.target.set(pos.x, pos.y, pos.z + 1);

  // // 平行光
  const color = 0xffffff;
  const intensity = 0.6;
  const light = new DirectionalLight(color, intensity);
  light.position.set(-0.13, 2.51, 2.27);
  light.target.position.set(0, 1, 0);
  light.castShadow = true;
  light.shadow.camera.top = 10;
  light.shadow.camera.bottom = -10;
  light.shadow.camera.left = -10;
  light.shadow.camera.right = 10;
  light.shadow.mapSize.width = 1024;
  light.shadow.mapSize.height = 1024;
  light.shadow.camera.near = 0;
  light.shadow.camera.far = 10;
  light.shadow.bias = -0.0003;
  scene.add(light);

  // 环境光
  const ambient = new AmbientLight(0xffffff, 3.0);
  scene.add(ambient);

  // 背景 hdr
  new HDRLoader().load("/imgs/1.hdr", (texture) => {
    texture.mapping = EquirectangularReflectionMapping;
    scene.background = texture;
  });

  // 创建视频纹理
  video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;

  // hls视频流送
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.attachMedia(video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource("https://test-streams.mux.dev/tos_ismc/main.m3u8");
    });
  }
  try {
    await video.play();
    console.log("视频播放成功");
  } catch (error) {
    console.warn("视频自动播放失败", error);
  }

  const videoTexture = new VideoTexture(video);

  // 投影工具
  projectorTool = await createVideoProjector({
    scene,
    renderer,
    videoTexture,
    projCamPosition: [0.034, 3.5, -7.14],
    projCamParams: { fov: 13.2, aspect: 2.09, near: 0.01, far: 100 },
    orientationParams: { azimuthDeg: 91, elevationDeg: -6, rollDeg: 0 },
    projBias: 0.0001,
    isShowHelper: false,
  });

  // 模型加载器
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/",
  );
  gltfLoader.setDRACOLoader(dracoLoader);
  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath(
    "https://unpkg.com/three@0.180.0/examples/jsm/libs/basis/",
  );
  ktx2Loader.detectSupport(renderer);
  gltfLoader.setKTX2Loader(ktx2Loader);

  // 加载影院屏幕模型
  await gltfLoader
    .loadAsync("/gltf/cinemamovie_theater_interior.glb")
    .then((gltf) => {
      const model = gltf.scene;
      model.position.set(69.41, 0.6, 24.9);
      model.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          projectorTool.addTargetMesh(child);
        }
      });
      scene.add(model);
    });

  await gltfLoader.loadAsync("/gltf/futuristic_city.glb").then((gltf) => {
    const model = gltf.scene;
    model.scale.set(0.005, 0.005, 0.005);
    model.position.set(-140.9, -8.75, 212.95);
    model.rotation.y = Math.PI / 2;
    model.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    scene.add(model);
  });

  isShowPlay.value = true;

  const videoPosition = new Vector3(-0.13, 2.5, 2.33); // 仅作示例,具体位置需要计算
  const updateVolume = () => {
    const distance = player.getposition().distanceTo(videoPosition);
    video.volume = Math.max(0, 1 - distance / 10);
  };

  resize();
  window.addEventListener("resize", resize);

  // 渲染循环
  renderer.setAnimationLoop(animate);
  function animate() {
    if (isUpdatePlayer) {
      player.update();
      updateVolume();
    } else {
      controls.update();
    }
    renderer.render(scene, camera);
    if (projectorTool) projectorTool.update();

    stats?.update();
  }
});

const start = () => {
  isShowPlay.value = false;
  video.muted = false;
  // 创建玩家控制器
  renderer.render(scene, camera);
  isUpdatePlayer = true; // 更新玩家
  player.init({
    scene,
    camera,
    controls,
    playerModel: {
      url: "/gltf/person16.glb",
      scale: 0.005,
      idleAnim: "idle",
      walkAnim: "walk",
      runAnim: "run",
      jumpAnim: "jump",
      flyAnim: "flying",
      flyIdleAnim: "flyidle",
    },
    initPos: new Vector3(
      -0.11310870589738897,
      2.614062115741385,
      1.2878521164121084,
    ),
    minCamDistance: 50,
    maxCamDistance: 300,
    thirdMouseMode: 1,
  });
};

const resize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  console.log("resize");
};

// 卸载清理
onBeforeUnmount(() => {
  try {
    player.destroy?.();

    if (renderer) {
      renderer.setAnimationLoop(null);
      if (containerEl) {
        if (
          renderer.domElement &&
          renderer.domElement.parentElement === containerEl
        ) {
          containerEl.removeChild(renderer.domElement);
        }
        if (stats?.dom && stats.dom.parentElement === containerEl) {
          containerEl.removeChild(stats.dom);
        }
      }
      renderer.dispose();
    }

    controls?.dispose();

    scene.traverse((child: Object3D | any) => {
      if (!child) return;
      if (child.material) {
        try {
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m && m.dispose && m.dispose());
          } else {
            child.material.dispose();
          }
        } catch (e) {}
      }
      if (child.geometry) {
        try {
          child.geometry.dispose();
        } catch (e) {}
      }
    });

    try {
      video.pause();
      video.src = "";
    } catch (e) {}

    window.removeEventListener("resize", resize);
    console.log("销毁完成");
  } catch (e) {
    console.error("销毁失败", e);
  }
});
</script>

<style scoped lang="scss">
.container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
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

.hud {
  position: fixed;
  left: 12px;
  top: 12px;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  padding: 10px 12px;
  border-radius: 8px;
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    "Helvetica Neue",
    Arial;
  font-size: 16px;
  line-height: 1.3;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.hud .row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.hud .row:last-child {
  margin-bottom: 0;
}

kbd {
  display: inline-block;
  padding: 4px 7px;
  min-width: 20px;
  text-align: center;
  font-family:
    ui-monospace, "SFMono-Regular", Menlo, Monaco, "Roboto Mono",
    "Segoe UI Mono", monospace;
  font-size: 12px;
  line-height: 1;
  color: #111;
  background: linear-gradient(#f6f6f6, #e3e3e3);
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-bottom-width: 2px;
  border-radius: 6px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.6) inset,
    0 2px 4px rgba(0, 0, 0, 0.25);
}

@media (hover: none) and (pointer: coarse), (max-width: 768px) {
  .hud,
  .source {
    display: none !important;
  }
}

.play {
  position: fixed;
  height: 100%;
  width: 100%;
  top: 0;
  left: 0;
  z-index: 9999;
  background-color: rgba(0, 0, 0, 0.4);

  .play-button {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9999;
    background-color: #fff;
    color: #000;
    padding: 12px 16px;
    border-radius: 999px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    cursor: pointer;
  }
}
</style>
