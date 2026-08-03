<template>
    <Teleport to="body">
        <div
            v-for="marker in sceneMarkers"
            v-show="marker.visible"
            :key="marker.id"
            class="calibration-scene-marker"
            :style="{ transform: `translate(${marker.screenX}px, ${marker.screenY}px)` }"
            :title="marker.title"
        >
            <span class="marker-crosshair"></span>
            <b>#{{ marker.id }} 3D point</b>
        </div>

        <section
            ref="panelRef"
            class="calibration-panel"
            :class="{ dragging: isPanelDragging }"
            :style="panelStyle"
        >
            <header
                class="panel-header"
                @pointerdown="startPanelDrag"
                @pointermove="movePanelDrag"
                @pointerup="endPanelDrag"
                @pointercancel="endPanelDrag"
            >
                <div>
                    <strong>Video spatial calibration</strong>
                    <span>Three.js 2D–3D correspondence solve</span>
                </div>
                <button class="icon-button" title="Close" @click="closePanel">×</button>
            </header>

            <div class="panel-body">
                <div class="instruction" :class="{ ready: pendingUv }">
                    <b>{{ pendingUv ? "Step 2" : "Step 1" }}</b>
                    {{ instructionText }}
                </div>

                <div
                    ref="frameWrapRef"
                    class="frame-wrap"
                    :class="{ zoomed: frameScale > 1, dragging: isFrameDragging }"
                    @wheel.prevent="zoomFrame"
                    @pointerdown="startFramePan"
                    @pointermove="moveFramePan"
                    @pointerup="endFramePan"
                    @pointercancel="cancelFramePan"
                    @click="selectVideoPoint"
                >
                    <div
                        ref="frameContentRef"
                        class="frame-content"
                        :style="frameContentStyle"
                    >
                        <canvas ref="frameCanvasRef" class="frame-canvas"></canvas>
                        <span
                            v-for="point in observations"
                            :key="point.id"
                            class="image-point saved"
                            :style="pointStyle(point.uv)"
                        >
                            {{ point.id }}
                        </span>
                        <span
                            v-if="pendingUv"
                            class="image-point pending"
                            :style="pointStyle(pendingUv)"
                        >
                            +
                        </span>
                    </div>

                    <button
                        class="fullscreen-button"
                        title="Fullscreen video picking"
                        @pointerdown.stop
                        @click.stop="openFrameFullscreen"
                    >
                        ⛶
                    </button>

                    <div class="zoom-indicator" @pointerdown.stop @click.stop>
                        <span>Scroll to zoom {{ Math.round(frameScale * 100) }}%</span>
                        <button v-if="frameScale > 1" @click="resetFrameView">Reset</button>
                    </div>
                </div>

                <div class="summary-row">
                    <span>Correspondences <b>{{ observations.length }}</b>/6+</span>
                    <span v-if="result">
                        RMSE
                        <b :class="qualityClass">{{ result.rmsePx.toFixed(2) }} px</b>
                    </span>
                    <span v-else>Aim for 10–20 points</span>
                </div>

                <div class="toolbar">
                    <button :disabled="!pendingUv && !observations.length" @click="undo">
                        Undo
                    </button>
                    <button :disabled="!observations.length" @click="clearPoints">
                        Clear
                    </button>
                    <button
                        class="primary"
                        :disabled="observations.length < 6 || solving"
                        @click="solve"
                    >
                        {{ solving ? "Solving…" : "Solve & preview" }}
                    </button>
                </div>

                <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

                <div v-if="result" class="result-card">
                    <div>
                        <span>Vertical FOV</span>
                        <b>{{ result.parameters.fovDeg.toFixed(3) }}°</b>
                    </div>
                    <div>
                        <span>Azimuth / Elevation / Roll</span>
                        <b>{{ angleSummary }}</b>
                    </div>
                    <div>
                        <span>Max error</span>
                        <b>{{ result.maxErrorPx.toFixed(2) }} px</b>
                    </div>
                    <div>
                        <span>Iterations</span>
                        <b>{{ result.iterations }}</b>
                    </div>
                </div>

                <div v-if="observations.length" class="point-list">
                    <div
                        v-for="(point, index) in observations"
                        :key="point.id"
                        class="point-row"
                    >
                        <span>#{{ point.id }}</span>
                        <span>
                            UV {{ point.uv[0].toFixed(3) }},
                            {{ point.uv[1].toFixed(3) }}
                        </span>
                        <span
                            v-if="result"
                            :class="{ outlier: result.errorsPx[index] > 12 }"
                        >
                            {{ result.errorsPx[index].toFixed(1) }} px
                        </span>
                    </div>
                </div>

                <div class="footer-actions">
                    <button :disabled="!result" @click="restoreInitial">Restore initial</button>
                </div>

                <p class="tip">
                    Do not change the projection parameters on the right while calibrating.
                    Video and model must share real correspondences; pick points across
                    image edges and different distances/heights.
                </p>
            </div>
        </section>
    </Teleport>
</template>

<script setup lang="ts">
/**
 * 视频空间标定面板：在冻结视频帧与三维模型上采集 2D–3D 对应点，
 * 调用 solveCameraCalibration 求解投影相机参数并预览结果。
 */
import * as THREE from "three";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { ThreeProjectorTool } from "../../src/three-video-projection";
import {
    solveCameraCalibration,
    type CameraCalibrationObservation,
    type CameraCalibrationParameters,
    type CameraCalibrationResult,
} from "../../src/three-camera-calibration";

const props = defineProps<{
    /** 用于抓取当前视频帧的 video 元素 */
    videoEl: HTMLVideoElement;
    /** 场景渲染器，用于在画布上拾取三维点 */
    renderer: THREE.WebGLRenderer;
    /** 用户观察用的透视相机，驱动场景标点屏幕投影 */
    viewCamera: THREE.PerspectiveCamera;
    /** 视频投影工具，读取/写回投影相机参数 */
    projector: ThreeProjectorTool;
}>();

const emit = defineEmits<{
    /** 面板关闭时触发 */
    close: [];
    /** 投影相机参数已变更，供父组件同步 GUI 等 */
    parametersChange: [];
}>();

/** 三维场景中已确认标定点的屏幕覆盖物 */
interface SceneMarker {
    /** 与观测点 id 一致，用于关联列表与覆盖物 */
    id: number;
    /** Three.js 场景坐标 [x, y, z] */
    world: [number, number, number];
    /** 相对视口的屏幕像素 X */
    screenX: number;
    /** 相对视口的屏幕像素 Y */
    screenY: number;
    /** 是否在视锥内且位于相机前方 */
    visible: boolean;
    /** 悬停提示，展示世界坐标 */
    title: string;
}

// DOM 引用
const panelRef = ref<HTMLElement | null>(null);
const frameCanvasRef = ref<HTMLCanvasElement | null>(null);
const frameWrapRef = ref<HTMLElement | null>(null);
const frameContentRef = ref<HTMLElement | null>(null);

// 标定状态
const observations = ref<CameraCalibrationObservation[]>([]);
/** 已在视频帧选中、等待对应三维点的归一化 UV；null 表示处于第 1 步 */
const pendingUv = ref<[number, number] | null>(null);
const sceneMarkers = ref<SceneMarker[]>([]);
const result = ref<CameraCalibrationResult | null>(null);
const solving = ref(false);
const errorMessage = ref("");
/** 冻结帧的原始像素宽高，求解时换算重投影误差用 */
const imageSize = ref<[number, number]>([0, 0]);

// 面板拖拽位置；null 表示沿用 CSS 默认定位
const panelLeft = ref<number | null>(null);
const panelTop = ref<number | null>(null);
const isPanelDragging = ref(false);

// 视频帧缩放与平移
const frameScale = ref(1);
const frameOffsetX = ref(0);
const frameOffsetY = ref(0);
const isFrameDragging = ref(false);

// 复用计算对象，避免每帧分配
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const markerWorldPoint = new THREE.Vector3();
const markerCameraPoint = new THREE.Vector3();
const FRAME_ZOOM_MIN = 1;
const FRAME_ZOOM_MAX = 12;

/** 打开面板时的投影参数快照，用于取消或清空后回滚 */
let initialParameters: CameraCalibrationParameters;
let nextPointId = 1;
/** 打开面板前视频是否已暂停；关闭时据此决定是否恢复播放 */
let wasPaused = false;
let disposed = false;
let markerAnimationFrame = 0;

// 帧画面拖拽平移的指针状态
let framePanPointerId: number | null = null;
let framePanStartX = 0;
let framePanStartY = 0;
let framePanOriginX = 0;
let framePanOriginY = 0;
let framePanMoved = false;
/** 拖拽结束后抑制一次 click，避免误选视频点 */
let suppressFrameClick = false;

// 面板拖拽的指针状态
let panelDragPointerId: number | null = null;
let panelDragStartX = 0;
let panelDragStartY = 0;
let panelDragOriginLeft = 0;
let panelDragOriginTop = 0;

// 场景拖拽后抑制 click，避免松手误选
let scenePickStartX = 0;
let scenePickStartY = 0;
let suppressSceneClick = false;

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

// 计算属性
const instructionText = computed(() =>
    pendingUv.value
        ? "Click the matching feature on the 3D model"
        : "Click a feature point on the frozen video frame",
);

/** 按 RMSE 像素误差划分结果质量样式 */
const qualityClass = computed(() => {
    if (!result.value) return "";
    if (result.value.rmsePx <= 3) return "quality-good";
    if (result.value.rmsePx <= 8) return "quality-medium";
    return "quality-bad";
});

/** 帧内容 CSS 变量：宽高比、标点尺寸随缩放反比，保证视觉大小稳定 */
const frameContentStyle = computed(() => ({
    "--frame-aspect":
        imageSize.value[0] && imageSize.value[1]
            ? String(imageSize.value[0] / imageSize.value[1])
            : String(16 / 9),
    "--frame-point-size": `${20 / frameScale.value}px`,
    "--frame-point-font-size": `${10 / frameScale.value}px`,
    "--frame-point-border-size": `${2 / frameScale.value}px`,
    transform: `translate3d(${frameOffsetX.value}px, ${frameOffsetY.value}px, 0) scale(${frameScale.value})`,
}));

/** 拖拽后用 left/top 覆盖定位 */
const panelStyle = computed(() => {
    if (panelLeft.value === null || panelTop.value === null) return undefined;
    return {
        left: `${panelLeft.value}px`,
        top: `${panelTop.value}px`,
        right: "auto",
    };
});

const angleSummary = computed(() => {
    if (!result.value) return "";
    const parameters = result.value.parameters;
    return `${parameters.azimuthDeg.toFixed(2)}° / ${parameters.elevationDeg.toFixed(2)}° / ${parameters.rollDeg.toFixed(2)}°`;
});

/** 将归一化 UV 转为相对帧内容的 CSS 定位*/
const pointStyle = (uv: [number, number]) => ({
    left: `${uv[0] * 100}%`,
    top: `${(1 - uv[1]) * 100}%`,
});

/** 从投影工具读取当前相机参数，作为求解初值或恢复基准 */
const getCurrentParameters = (): CameraCalibrationParameters => {
    const camera = props.projector.projCam;
    return {
        position: [camera.position.x, camera.position.y, camera.position.z],
        azimuthDeg: props.projector.azimuthDeg,
        elevationDeg: props.projector.elevationDeg,
        rollDeg: props.projector.rollDeg,
        fovDeg: camera.fov,
        aspect: camera.aspect,
        near: camera.near,
        far: camera.far,
    };
};

/** 将标定参数写回投影相机，并通知父组件刷新控制面板 */
const applyParameters = (parameters: CameraCalibrationParameters) => {
    const camera = props.projector.projCam;
    camera.position.fromArray(parameters.position);
    camera.fov = parameters.fovDeg;
    camera.aspect = parameters.aspect;
    camera.near = parameters.near;
    camera.far = parameters.far;
    camera.updateProjectionMatrix();
    props.projector.azimuthDeg = parameters.azimuthDeg;
    props.projector.elevationDeg = parameters.elevationDeg;
    props.projector.rollDeg = parameters.rollDeg;
    props.projector.camHelper?.update();
    emit("parametersChange");
};

/** 抓取当前视频帧到画布并暂停播放，保证选点时画面冻结 */
const captureFrame = () => {
    const canvas = frameCanvasRef.value;
    const video = props.videoEl;
    if (!canvas || !video.videoWidth || !video.videoHeight) {
        errorMessage.value = "Video frame is not ready. Close the panel and try again.";
        return false;
    }

    imageSize.value = [video.videoWidth, video.videoHeight];
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    try {
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (error) {
        errorMessage.value =
            error instanceof Error ? error.message : "Unable to read the current video frame";
        return false;
    }
    wasPaused = video.paused;
    video.pause();
    return true;
};

/** 1：在冻结帧上选取视频特征点，得到归一化 UV */
const selectVideoPoint = (event: MouseEvent) => {
    if (suppressFrameClick) return;
    const canvas = frameCanvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // 翻转
    pendingUv.value = [
        THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 1),
        THREE.MathUtils.clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1),
    ];
    errorMessage.value = "";
    // 全屏选点完成后自动退出全屏，回到场景选三维点
    if (document.fullscreenElement === frameWrapRef.value) {
        document.exitFullscreen().catch(() => undefined);
    }
};

/**
 * 将射线命中点回投到屏幕，与点击 NDC 比较像素偏差；
 * 过大说明命中不稳定（例如掠射面），提示用户重试。
 */
const getPickScreenError = (
    worldPoint: THREE.Vector3,
    ndcX: number,
    ndcY: number,
    rect: DOMRect,
) => {
    const projected = worldPoint.clone().project(props.viewCamera);
    return Math.hypot(
        (projected.x - ndcX) * rect.width * 0.5,
        (projected.y - ndcY) * rect.height * 0.5,
    );
};

/** 在场景中叠加一个与观测点对应的屏幕标记 */
const addSceneMarker = (id: number, world: [number, number, number]) => {
    sceneMarkers.value.push({
        id,
        world: [...world],
        screenX: 0,
        screenY: 0,
        visible: false,
        title: `Three.js XYZ: ${world.map((value) => value.toFixed(3)).join(", ")}`,
    });
};

const removeSceneMarker = (id: number) => {
    sceneMarkers.value = sceneMarkers.value.filter((marker) => marker.id !== id);
};

/** 观测集变更后作废已有求解结果，并回滚到打开面板时的参数 */
const invalidateResult = () => {
    if (result.value) applyParameters(initialParameters);
    result.value = null;
    errorMessage.value = "";
};

/** 记录场景指针按下位置，用于区分点击与拖拽 */
const onScenePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    scenePickStartX = event.clientX;
    scenePickStartY = event.clientY;
    suppressSceneClick = false;
};

/** 左键拖动超过阈值时标记为拖拽，后续 click 不拾取 */
const onScenePointerMove = (event: PointerEvent) => {
    if ((event.buttons & 1) === 0 || suppressSceneClick) return;
    if (
        Math.hypot(
            event.clientX - scenePickStartX,
            event.clientY - scenePickStartY,
        ) >= 3
    ) {
        suppressSceneClick = true;
    }
};

/** 2：在三维模型上拾取与 pendingUv 对应的世界坐标点 */
const pickWorldPoint = (event: MouseEvent) => {
    if (!pendingUv.value || suppressSceneClick) return;

    const canvas = props.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointer.set(ndcX, ndcY);
    props.viewCamera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, props.viewCamera);
    const [hit] = raycaster.intersectObjects(props.projector.targetMeshes, true);
    if (!hit) {
        errorMessage.value = "No model hit. Please pick the 3D point again.";
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    // 回投偏差超过 5px 时认为拾取不可靠
    const screenErrorPx = getPickScreenError(hit.point, ndcX, ndcY, rect);
    if (!Number.isFinite(screenErrorPx) || screenErrorPx > 5) {
        errorMessage.value = `Ray hit reprojects with ${screenErrorPx.toFixed(1)} px error. Please retry.`;
        return;
    }

    invalidateResult();
    const id = nextPointId++;
    const world: [number, number, number] = [hit.point.x, hit.point.y, hit.point.z];
    observations.value.push({
        id,
        uv: [...pendingUv.value],
        world,
    });
    addSceneMarker(id, world);
    pendingUv.value = null;
};

/** 每帧将世界坐标标点投影到屏幕，供 Teleport 覆盖层定位 */
const updateSceneMarkerPositions = () => {
    if (disposed) return;
    const camera = props.viewCamera;
    const rect = props.renderer.domElement.getBoundingClientRect();
    camera.updateMatrixWorld(true);
    for (const marker of sceneMarkers.value) {
        markerWorldPoint.fromArray(marker.world);
        // Three.js 相机朝向本地 -Z，相机空间 z < 0 表示位于前方
        markerCameraPoint.copy(markerWorldPoint).applyMatrix4(camera.matrixWorldInverse);
        markerWorldPoint.project(camera);
        marker.visible =
            markerCameraPoint.z < 0 &&
            markerWorldPoint.z >= -1 &&
            markerWorldPoint.z <= 1 &&
            markerWorldPoint.x >= -1 &&
            markerWorldPoint.x <= 1 &&
            markerWorldPoint.y >= -1 &&
            markerWorldPoint.y <= 1;
        marker.screenX = rect.left + (markerWorldPoint.x + 1) * 0.5 * rect.width;
        marker.screenY = rect.top + (1 - markerWorldPoint.y) * 0.5 * rect.height;
    }
    markerAnimationFrame = requestAnimationFrame(updateSceneMarkerPositions);
};

/** 撤销：优先取消待确认的视频点，否则删除最后一组对应点 */
const undo = () => {
    invalidateResult();
    if (pendingUv.value) {
        pendingUv.value = null;
        return;
    }
    const removed = observations.value.pop();
    if (removed) removeSceneMarker(removed.id);
};

const clearPoints = () => {
    invalidateResult();
    observations.value = [];
    sceneMarkers.value = [];
    pendingUv.value = null;
    nextPointId = 1;
};

/** 用当前观测求解相机参数，并立即写回投影相机做预览 */
const solve = async () => {
    solving.value = true;
    errorMessage.value = "";
    // 让出一帧，便于按钮先进入「求解中」状态
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (disposed) return;
    try {
        const solved = solveCameraCalibration(
            observations.value,
            initialParameters,
            imageSize.value[0],
            imageSize.value[1],
        );
        if (disposed) return;
        result.value = solved;
        applyParameters(solved.parameters);
    } catch (error) {
        errorMessage.value =
            error instanceof Error ? error.message : "Camera calibration failed";
    } finally {
        solving.value = false;
    }
};

/** 丢弃预览结果，恢复打开面板时的投影参数 */
const restoreInitial = () => {
    applyParameters(initialParameters);
    result.value = null;
};

const resetFrameView = () => {
    frameScale.value = 1;
    frameOffsetX.value = 0;
    frameOffsetY.value = 0;
};

/**
 * 将帧平移限制在视口内：内容小于视口时居中，
 * 大于视口时不允许拖出留白。
 */
const constrainFrameOffset = (
    x: number,
    y: number,
    scale: number,
): [number, number] => {
    const wrap = frameWrapRef.value;
    const content = frameContentRef.value;
    if (!wrap || !content) return [x, y];

    const wrapRect = wrap.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    // 去掉当前 offset 后得到未平移时的基准位置
    const baseLeft = contentRect.left - frameOffsetX.value;
    const baseTop = contentRect.top - frameOffsetY.value;
    const viewportLeft = wrapRect.left + wrap.clientLeft;
    const viewportTop = wrapRect.top + wrap.clientTop;
    const scaledWidth = content.offsetWidth * scale;
    const scaledHeight = content.offsetHeight * scale;

    const constrainAxis = (
        offset: number,
        baseStart: number,
        viewportStart: number,
        viewportSize: number,
        contentSize: number,
    ) => {
        if (contentSize <= viewportSize) {
            return viewportStart + (viewportSize - contentSize) / 2 - baseStart;
        }
        const min = viewportStart + viewportSize - baseStart - contentSize;
        const max = viewportStart - baseStart;
        return Math.min(max, Math.max(min, offset));
    };

    return [
        constrainAxis(
            x,
            baseLeft,
            viewportLeft,
            wrap.clientWidth,
            scaledWidth,
        ),
        constrainAxis(
            y,
            baseTop,
            viewportTop,
            wrap.clientHeight,
            scaledHeight,
        ),
    ];
};

/** 滚轮缩放帧画面，并以光标位置为锚点调整平移 */
const zoomFrame = (event: WheelEvent) => {
    const content = frameContentRef.value;
    if (!content) return;
    const oldScale = frameScale.value;
    const nextScale = THREE.MathUtils.clamp(
        oldScale * Math.exp(-event.deltaY * 0.002),
        FRAME_ZOOM_MIN,
        FRAME_ZOOM_MAX,
    );
    if (Math.abs(nextScale - oldScale) < 1e-4) return;

    const rect = content.getBoundingClientRect();
    // 光标在未缩放内容坐标系中的局部位置
    const localX = THREE.MathUtils.clamp(
        (event.clientX - rect.left) / oldScale,
        0,
        content.offsetWidth,
    );
    const localY = THREE.MathUtils.clamp(
        (event.clientY - rect.top) / oldScale,
        0,
        content.offsetHeight,
    );
    const baseLeft = rect.left - frameOffsetX.value;
    const baseTop = rect.top - frameOffsetY.value;
    const [x, y] = constrainFrameOffset(
        event.clientX - baseLeft - localX * nextScale,
        event.clientY - baseTop - localY * nextScale,
        nextScale,
    );
    frameScale.value = nextScale;
    frameOffsetX.value = x;
    frameOffsetY.value = y;
};

/** 放大后左键拖拽平移帧画面 */
const startFramePan = (event: PointerEvent) => {
    if (frameScale.value <= 1 || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    framePanPointerId = event.pointerId;
    framePanStartX = event.clientX;
    framePanStartY = event.clientY;
    framePanOriginX = frameOffsetX.value;
    framePanOriginY = frameOffsetY.value;
    framePanMoved = false;
    isFrameDragging.value = true;
    frameWrapRef.value?.setPointerCapture(event.pointerId);
};

const moveFramePan = (event: PointerEvent) => {
    if (event.pointerId !== framePanPointerId) return;
    const deltaX = event.clientX - framePanStartX;
    const deltaY = event.clientY - framePanStartY;
    // 小于 3px 视为点击抖动，不进入拖拽
    if (!framePanMoved && Math.hypot(deltaX, deltaY) < 3) return;
    framePanMoved = true;
    const [x, y] = constrainFrameOffset(
        framePanOriginX + deltaX,
        framePanOriginY + deltaY,
        frameScale.value,
    );
    frameOffsetX.value = x;
    frameOffsetY.value = y;
};

const finishFramePan = (event: PointerEvent, cancelled: boolean) => {
    if (event.pointerId !== framePanPointerId) return;
    // 发生过拖拽时抑制随后的 click，避免当成选点
    if (!cancelled && framePanMoved) {
        suppressFrameClick = true;
        window.setTimeout(() => {
            suppressFrameClick = false;
        }, 0);
    }
    if (frameWrapRef.value?.hasPointerCapture(event.pointerId)) {
        frameWrapRef.value.releasePointerCapture(event.pointerId);
    }
    framePanPointerId = null;
    framePanMoved = false;
    isFrameDragging.value = false;
};

const endFramePan = (event: PointerEvent) => finishFramePan(event, false);
const cancelFramePan = (event: PointerEvent) => finishFramePan(event, true);

/** 退出全屏时重置缩放平移，避免回到小窗后偏移异常 */
const handleFullscreenChange = () => {
    if (document.fullscreenElement !== frameWrapRef.value) resetFrameView();
};

const openFrameFullscreen = async () => {
    if (!frameWrapRef.value?.requestFullscreen) {
        errorMessage.value = "Fullscreen API is not supported in this browser";
        return;
    }
    try {
        resetFrameView();
        await frameWrapRef.value.requestFullscreen();
    } catch {
        errorMessage.value = "Unable to enter fullscreen mode";
    }
};

/** 若打开面板前视频在播放，关闭时恢复播放 */
const resumeVideo = () => {
    if (!wasPaused) props.videoEl.play().catch(() => undefined);
};

/** 将面板位置限制在视口内，避免拖出屏幕 */
const constrainPanelPosition = (left: number, top: number): [number, number] => {
    const panel = panelRef.value;
    const margin = 8;
    const width = panel?.offsetWidth ?? 390;
    const height = panel?.offsetHeight ?? 200;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    return [clamp(left, margin, maxLeft), clamp(top, margin, maxTop)];
};

/** 从标题栏拖拽移动面板 */
const startPanelDrag = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const panel = panelRef.value;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    panelDragPointerId = event.pointerId;
    panelDragStartX = event.clientX;
    panelDragStartY = event.clientY;
    panelDragOriginLeft = rect.left;
    panelDragOriginTop = rect.top;
    panelLeft.value = rect.left;
    panelTop.value = rect.top;
    isPanelDragging.value = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};

const movePanelDrag = (event: PointerEvent) => {
    if (event.pointerId !== panelDragPointerId) return;
    const [left, top] = constrainPanelPosition(
        panelDragOriginLeft + (event.clientX - panelDragStartX),
        panelDragOriginTop + (event.clientY - panelDragStartY),
    );
    panelLeft.value = left;
    panelTop.value = top;
};

const endPanelDrag = (event: PointerEvent) => {
    if (event.pointerId !== panelDragPointerId) return;
    const header = event.currentTarget as HTMLElement;
    if (header.hasPointerCapture(event.pointerId)) {
        header.releasePointerCapture(event.pointerId);
    }
    panelDragPointerId = null;
    isPanelDragging.value = false;
};

/** 窗口尺寸变化时，把已拖拽的面板重新钳制进视口 */
const handleWindowResize = () => {
    if (panelLeft.value === null || panelTop.value === null) return;
    const [left, top] = constrainPanelPosition(panelLeft.value, panelTop.value);
    panelLeft.value = left;
    panelTop.value = top;
};

const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(markerAnimationFrame);
    const canvas = props.renderer.domElement;
    canvas.removeEventListener("pointerdown", onScenePointerDown, true);
    canvas.removeEventListener("pointermove", onScenePointerMove, true);
    canvas.removeEventListener("click", pickWorldPoint, true);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    window.removeEventListener("resize", handleWindowResize);
    sceneMarkers.value = [];
    resumeVideo();
};

/** 关闭面板，保留当前投影参数 */
const closePanel = () => {
    cleanup();
    emit("close");
};

// 挂载：冻结视频帧，监听场景点击与全屏变化，开始更新场景标点
onMounted(() => {
    initialParameters = getCurrentParameters();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("resize", handleWindowResize);
    if (!captureFrame()) return;
    const canvas = props.renderer.domElement;
    // 捕获阶段监听，便于在其他控件之前完成三维点拾取，并过滤 OrbitControls 拖拽松手
    canvas.addEventListener("pointerdown", onScenePointerDown, true);
    canvas.addEventListener("pointermove", onScenePointerMove, true);
    canvas.addEventListener("click", pickWorldPoint, true);
    markerAnimationFrame = requestAnimationFrame(updateSceneMarkerPositions);
});

onBeforeUnmount(cleanup);
</script>

<style scoped lang="scss">
.calibration-scene-marker {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 10015;
    width: 0;
    height: 0;
    color: #22c55e;
    pointer-events: none;

    .marker-crosshair {
        position: absolute;
        left: 0;
        top: 0;
        width: 18px;
        height: 18px;
        transform: translate(-50%, -50%);
        border: 2px solid currentColor;
        border-radius: 50%;
        box-shadow:
            0 0 0 2px rgba(2, 6, 23, 0.8),
            0 0 12px currentColor;

        &::before,
        &::after {
            content: "";
            position: absolute;
            left: 50%;
            top: 50%;
            background: currentColor;
            transform: translate(-50%, -50%);
        }

        &::before {
            width: 24px;
            height: 1px;
        }

        &::after {
            width: 1px;
            height: 24px;
        }
    }

    b {
        position: absolute;
        left: 14px;
        top: -12px;
        padding: 3px 7px;
        border: 1px solid currentColor;
        border-radius: 4px;
        color: inherit;
        background: rgba(2, 6, 23, 0.88);
        font-size: 11px;
        line-height: 16px;
        white-space: nowrap;
    }
}

.calibration-panel {
    position: fixed;
    top: 10px;
    right: 270px;
    z-index: 10020;
    width: 390px;
    max-height: calc(100vh - 20px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(71, 136, 251, 0.38);
    border-radius: 8px;
    color: #dbeafe;
    background: rgba(2, 8, 23, 0.96);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
    font-family:
        system-ui,
        -apple-system,
        "Segoe UI",
        sans-serif;
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(71, 136, 251, 0.18);
    background: rgba(30, 64, 175, 0.13);
    cursor: grab;
    touch-action: none;
    user-select: none;

    div {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    strong {
        font-size: 14px;
        letter-spacing: 1px;
    }

    span {
        color: #64748b;
        font-size: 10px;
    }
}

.calibration-panel.dragging .panel-header {
    cursor: grabbing;
}

.panel-body {
    padding: 12px;
    overflow-y: auto;
}

.instruction {
    margin-bottom: 8px;
    padding: 8px 10px;
    border-radius: 5px;
    color: #93c5fd;
    background: rgba(37, 99, 235, 0.12);
    font-size: 12px;

    &.ready {
        color: #fcd34d;
        background: rgba(217, 119, 6, 0.12);
    }

    b {
        margin-right: 5px;
    }
}

.frame-wrap {
    position: relative;
    width: 100%;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 5px;
    background: #000;
}

.frame-content {
    position: relative;
    width: 100%;
    aspect-ratio: var(--frame-aspect);
    transform-origin: 0 0;
    will-change: transform;
    line-height: 0;
}

.frame-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
}

.frame-wrap.dragging .frame-canvas {
    cursor: grabbing;
}

.fullscreen-button {
    position: absolute;
    top: 7px;
    right: 7px;
    z-index: 3;
    width: 30px;
    height: 30px;
    padding: 0;
    color: #fff;
    background: rgba(2, 6, 23, 0.72);
    font-size: 18px;
}

.zoom-indicator {
    position: absolute;
    left: 7px;
    bottom: 7px;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 26px;
    padding: 3px 7px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 4px;
    color: #cbd5e1;
    background: rgba(2, 6, 23, 0.76);
    font-size: 10px;
    line-height: 1;

    button {
        padding: 2px 5px;
        font-size: 10px;
        line-height: 14px;
    }
}

.frame-wrap:fullscreen {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 0;
    background: #000;

    .frame-content {
        width: min(100vw, calc(100vh * var(--frame-aspect)));
        max-width: 100vw;
        max-height: 100vh;
    }

    .fullscreen-button {
        display: none;
    }
}

.image-point {
    position: absolute;
    width: var(--frame-point-size);
    height: var(--frame-point-size);
    display: flex;
    align-items: center;
    justify-content: center;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    color: #fff;
    font: 700 var(--frame-point-font-size) / 1 sans-serif;
    pointer-events: none;

    &.saved {
        border: var(--frame-point-border-size) solid #bfdbfe;
        background: #2563eb;
    }

    &.pending {
        border: var(--frame-point-border-size) solid #fde68a;
        background: #d97706;
    }
}

.summary-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 2px;
    color: #64748b;
    font-size: 11px;

    b {
        color: #bfdbfe;
    }

    .quality-good {
        color: #34d399;
    }

    .quality-medium {
        color: #fbbf24;
    }

    .quality-bad {
        color: #fb7185;
    }
}

.toolbar,
.footer-actions {
    display: flex;
    gap: 7px;

    button {
        flex: 1;
    }
}

.calibration-panel button {
    padding: 7px 8px;
    border: 1px solid rgba(71, 136, 251, 0.25);
    border-radius: 4px;
    color: #a5b4fc;
    background: rgba(30, 64, 175, 0.1);
    cursor: pointer;

    &:hover:not(:disabled) {
        background: rgba(37, 99, 235, 0.22);
    }

    &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }

    &.primary {
        color: #fff;
        background: #2563eb;
    }

    &.save {
        color: #fff;
        border-color: #10b981;
        background: #059669;
    }
}

.calibration-panel .icon-button {
    border: 0;
    color: #94a3b8;
    background: transparent;
    font-size: 24px;
    cursor: pointer;
}

.error-message {
    margin-top: 8px;
    padding: 7px 9px;
    border-radius: 4px;
    color: #fecdd3;
    background: rgba(190, 18, 60, 0.16);
    font-size: 11px;
}

.result-card {
    margin-top: 10px;
    padding: 8px 10px;
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 5px;
    background: rgba(5, 150, 105, 0.08);

    div {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 3px 0;
        font-size: 11px;
    }

    span {
        color: #64748b;
    }

    b {
        color: #a7f3d0;
        text-align: right;
    }
}

.point-list {
    max-height: 116px;
    margin-top: 8px;
    overflow-y: auto;
    border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.point-row {
    display: grid;
    grid-template-columns: 34px 1fr 58px;
    gap: 6px;
    padding: 4px 2px;
    color: #64748b;
    font-size: 10px;

    span:last-child {
        color: #86efac;
        text-align: right;
    }

    span.outlier {
        color: #fb7185;
    }
}

.footer-actions {
    margin-top: 10px;
}

.tip {
    margin: 9px 2px 0;
    color: #64748b;
    font-size: 10px;
    line-height: 1.5;
}

@media (max-width: 760px) {
    .calibration-panel {
        top: 56px;
        right: 8px;
        width: min(390px, calc(100vw - 16px));
        max-height: calc(100vh - 64px);
    }
}
</style>
