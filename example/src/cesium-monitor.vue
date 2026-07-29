<template>
    <div id="cesium-viewer" ref="viewerDivRef"></div>
    <div class="model-credit">
        <span>Note: The video location does not match the model; for reference only.</span>
    </div>
    <a
        class="source"
        href="https://github.com/hh-hang/vid3d-projection/blob/main/example/src/cesium-monitor.vue"
        target="_blank"
        rel="noopener noreferrer"
    >
        <img src="/imgs/source.svg" alt="" />
    </a>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import * as Cesium from "cesium";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";
import "cesium/Build/CesiumUnminified/Widgets/widgets.css";
import {
    CesiumProjectorTool,
    createCesiumVideoProjector,
} from "../../src/cesium-video-projection";
import Hls from "hls.js";

const projectionConfig = {
    lon: 5.105393631024482,
    lat: 52.09300904272346,
    hei: 48,
    heading: 47,
    pitch: -22.6,
    roll: 0,
    far: 100,
    near: 0.1,
    fov: 36,
    aspect: 1,
    intensity: 1.0,
    edgeFeather: 0.05,
    projBias: 0.0001,
    showHelpers: false,
    isAutoOpacity: false,
    opacity: 1,
    cropX0: 0,
    cropY0: 0,
    cropX1: 1,
    cropY1: 1,
    quadBLx: 0,
    quadBLy: 0,
    quadBRx: 1,
    quadBRy: 0,
    quadTRx: 1,
    quadTRy: 1,
    quadTLx: 0,
    quadTLy: 1,
};

let viewer: Cesium.Viewer | null = null;
let CesiumProjectorTool: CesiumProjectorTool;
let gui: GUI | null = null;

onMounted(async () => {
    viewer = new Cesium.Viewer("cesium-viewer", {
        infoBox: false,
        timeline: false,
        animation: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
    });

    viewer.scene.debugShowFramesPerSecond = true;
    viewer.scene.globe.depthTestAgainstTerrain = true;

    // 加载3DTILES
    const tileset = await Cesium.Cesium3DTileset.fromUrl(
        "https://tiles.arcgis.com/tiles/V6ZHFr6zdgNZuVG0/arcgis/rest/services/Utrecht_3D_Tiles_Integrated_Mesh/3DTilesServer/tileset.json"
    );
    viewer.scene.primitives.add(tileset);

    // 相机定位
    const position = Cesium.Cartesian3.fromDegrees(
        projectionConfig.lon,
        projectionConfig.lat,
        projectionConfig.hei
    );
    viewer.camera.flyTo({
        destination: position,
        orientation: {
            heading: Cesium.Math.toRadians(projectionConfig.heading),
            pitch: Cesium.Math.toRadians(projectionConfig.pitch),
            roll: Cesium.Math.toRadians(projectionConfig.roll),
        },
        duration: 0,
    });

    // 创建视频元素
    const video = document.createElement("video");
    video.src = "video/monitorTest2.mp4";
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.crossOrigin = "anonymous";
    await video.play();

    /** 视频流 */
    // 创建视频纹理
    // const video = document.createElement("video");
    // video.muted = true;
    // video.playsInline = true;
    // video.autoplay = true;
    // // hls视频流送
    // if (Hls.isSupported()) {
    //     const hls = new Hls();
    //     hls.attachMedia(video);
    //     hls.on(Hls.Events.MEDIA_ATTACHED, () => {
    //     hls.loadSource("https://test-streams.mux.dev/tos_ismc/main.m3u8");
    //     });
    // }
    // try {
    //     await video.play();
    //     console.log("视频播放成功");
    // } catch (error) {
    //     console.warn("视频自动播放失败", error);
    // }

    // 投影工具
    CesiumProjectorTool = createCesiumVideoProjector(viewer as Cesium.Viewer, {
        projCamPosition: [
            projectionConfig.lon,
            projectionConfig.lat,
            projectionConfig.hei,
        ],
        projCamParams: {
            fov: projectionConfig.fov,
            aspect: projectionConfig.aspect,
            near: projectionConfig.near,
            far: projectionConfig.far,
        },
        orientationParams: {
            azimuthDeg: projectionConfig.heading,
            elevationDeg: projectionConfig.pitch,
            rollDeg: projectionConfig.roll,
        },
        source: video,
        intensity: projectionConfig.intensity,
        projBias: projectionConfig.projBias,
        edgeFeather: projectionConfig.edgeFeather,
        isShowHelper: projectionConfig.showHelpers,
        opacity: projectionConfig.opacity,
    });

    // 初始化 GUI 控制面板
    gui = new GUI({ title: "Projector Controls" });
 

    let isAutoOpacity = projectionConfig.isAutoOpacity;

    // 根据距离设置透明度
    function setOpacityByDistance() {
        if (!isAutoOpacity || !viewer) return;
        const camPos = CesiumProjectorTool.cameraPosition;
        const distance = Cesium.Cartesian3.distance(
            viewer.camera.position,
            Cesium.Cartesian3.fromDegrees(camPos[0], camPos[1], camPos[2])
        );
        const opacity = Math.max(0, (50 - distance) / 50);
        CesiumProjectorTool.opacity = opacity;
    }
    viewer.scene.preRender.addEventListener(setOpacityByDistance);

    const projFolder = gui.addFolder("Projection");
    projFolder
        .add(projectionConfig, "intensity", 0, 3, 0.01)
        .name("Intensity")
        .onChange((v: number) => {
            CesiumProjectorTool.intensity = v;
        });
    projFolder
        .add(projectionConfig, "far", 1, 500, 10)
        .name("Far")
        .onChange((v: number) => {
            CesiumProjectorTool.far = v;
        });
    projFolder
        .add(projectionConfig, "near", 0.01, 10, 0.1)
        .name("Near")
        .onChange((v: number) => {
            CesiumProjectorTool.near = v;
        });
    projFolder
        .add(projectionConfig, "fov", 1, 120, 0.1)
        .name("FOV")
        .onChange((v: number) => {
            CesiumProjectorTool.fov = v;
        });
    projFolder
        .add(projectionConfig, "edgeFeather", 0, 0.5, 0.001)
        .name("Edge feather")
        .onChange((v: number) => {
            CesiumProjectorTool.edgeFeather = v;
        });
    projFolder
        .add(projectionConfig, "aspect", 0.1, 10, 0.01)
        .name("Aspect")
        .onChange((v: number) => {
            CesiumProjectorTool.aspect = v;
        });
    projFolder
        .add(projectionConfig, "heading", -180, 180, 0.1)
        .name("Azimuth")
        .onChange((v: number) => {
            CesiumProjectorTool.azimuthDeg = v;
        });
    projFolder
        .add(projectionConfig, "pitch", -89, 89, 0.1)
        .name("Elevation")
        .onChange((v: number) => {
            CesiumProjectorTool.elevationDeg = v;
        });
    projFolder
        .add(projectionConfig, "roll", -180, 180, 0.1)
        .name("Roll")
        .onChange((v: number) => {
            CesiumProjectorTool.rollDeg = v;
        });
    projFolder
        .add(projectionConfig, "projBias", 0, 0.01, 0.0001)
        .name("Depth bias")
        .onChange((v: number) => {
            CesiumProjectorTool.projBias = v;
        });
    projFolder
        .add(projectionConfig, "opacity", 0, 1, 0.01)
        .name("Opacity")
        .onChange((v: number) => {
            CesiumProjectorTool.opacity = v;
        });
    projFolder
        .add(projectionConfig, "showHelpers")
        .name("Camera helper")
        .onChange((v: boolean) => {
            CesiumProjectorTool.isShowHelper = v;
        });
    projFolder
        .add(projectionConfig, "isAutoOpacity")
        .name("Auto opacity")
        .onChange((v: boolean) => {
            isAutoOpacity = v;
            if (!isAutoOpacity) CesiumProjectorTool.opacity = 1;
        });

    const posFolder = gui.addFolder("Camera position");
    const updatePosition = () => {
        CesiumProjectorTool.cameraPosition = [
            projectionConfig.lon,
            projectionConfig.lat,
            projectionConfig.hei,
        ];
    };
    posFolder
        .add(projectionConfig, "lon", 5.0987, 5.1187, 0.00001)
        .name("Longitude")
        .onChange(updatePosition);
    posFolder
        .add(projectionConfig, "lat", 52.0857, 52.1057, 0.00001)
        .name("Latitude")
        .onChange(updatePosition);
    posFolder
        .add(projectionConfig, "hei", 0, 100, 0.1)
        .name("Height")
        .onChange(updatePosition);
        
    // 裁剪区域
    function updateCropFromGUI() {
        CesiumProjectorTool.cropRect = [
            projectionConfig.cropX0,
            projectionConfig.cropY0,
            projectionConfig.cropX1,
            projectionConfig.cropY1,
        ];
    }

    const cropFolder = gui.addFolder("Crop rect");
    cropFolder
        .add(projectionConfig, "cropX0", 0, 1, 0.01)
        .name("Left (x0)")
        .onChange(updateCropFromGUI);
    cropFolder
        .add(projectionConfig, "cropY0", 0, 1, 0.01)
        .name("Bottom (y0)")
        .onChange(updateCropFromGUI);
    cropFolder
        .add(projectionConfig, "cropX1", 0, 1, 0.01)
        .name("Right (x1)")
        .onChange(updateCropFromGUI);
    cropFolder
        .add(projectionConfig, "cropY1", 0, 1, 0.01)
        .name("Top (y1)")
        .onChange(updateCropFromGUI);

    // 四角点变换
    function updateQuadFromGUI() {
        CesiumProjectorTool.quadCorners = [
            [projectionConfig.quadBLx, projectionConfig.quadBLy],
            [projectionConfig.quadBRx, projectionConfig.quadBRy],
            [projectionConfig.quadTRx, projectionConfig.quadTRy],
            [projectionConfig.quadTLx, projectionConfig.quadTLy],
        ];
    }

    const quadFolder = gui.addFolder("Quad corners");
    quadFolder
        .add(projectionConfig, "quadBLx", -0.5, 1.5, 0.001)
        .name("BL.x")
        .onChange(updateQuadFromGUI);
    quadFolder
        .add(projectionConfig, "quadBLy", -0.5, 1.5, 0.001)
        .name("BL.y")
        .onChange(updateQuadFromGUI);
    quadFolder
        .add(projectionConfig, "quadBRx", -0.5, 1.5, 0.001)
        .name("BR.x")
        .onChange(updateQuadFromGUI);
    quadFolder
        .add(projectionConfig, "quadBRy", -0.5, 1.5, 0.001)
        .name("BR.y")
        .onChange(updateQuadFromGUI);
    quadFolder
        .add(projectionConfig, "quadTRx", -0.5, 1.5, 0.001)
        .name("TR.x")
        .onChange(updateQuadFromGUI);
    quadFolder
        .add(projectionConfig, "quadTRy", -0.5, 1.5, 0.001)
        .name("TR.y")
        .onChange(updateQuadFromGUI);
    quadFolder
        .add(projectionConfig, "quadTLx", -0.5, 1.5, 0.001)
        .name("TL.x")
        .onChange(updateQuadFromGUI);
    quadFolder
        .add(projectionConfig, "quadTLy", -0.5, 1.5, 0.001)
        .name("TL.y")
        .onChange(updateQuadFromGUI);
});

onBeforeUnmount(() => {
    // 销毁 GUI
    if (gui) {
        gui.destroy();
        gui = null;
    }

    // 销毁viewer
    if (viewer) {
        viewer.destroy();
        viewer = null;
    }
});
</script>

<style scoped>
#cesium-viewer {
    width: 100%;
    height: 100%;
}

:deep(.cesium-performanceDisplay-defaultContainer) {
    top: 0;
    left: 0;
    right: auto;
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
@media (hover: none) and (pointer: coarse), (max-width: 768px) {
    .source {
        display: none !important;
    }
}
</style>
