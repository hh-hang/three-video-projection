import * as THREE from "three";
import {
    clamp,
    median,
    solveCalibration,
    type CalibrationObservation,
    type CalibrationSolveResult,
} from "./calibration/core";

/** 相机标定参数角度单位均为度，位置使用 Three.js 场景的渲染坐标 */
export interface CameraCalibrationParameters {
    /** 投影相机在 Three.js 场景中的 [x, y, z] */
    position: [number, number, number];
    /** 水平方位角：0° 指向 +X，90° 指向 +Z */
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
    /** 远裁剪面距离；当前仅参与投影，不作为优化变量 */
    far: number;
}

/** 一组视频像素点与三维场景点的对应观测 */
export interface CameraCalibrationObservation extends CalibrationObservation {
    /** 标定点编号，用于关联界面中的点位 */
    id: number;
}

/** 相机标定的求解结果与重投影误差 */
export type CameraCalibrationResult = CalibrationSolveResult<CameraCalibrationParameters>;

// 当前优化 7 个变量：位置 XYZ、方位/俯仰/横滚和垂直 FOV
const parameterCount = 7;
// 复用计算对象
const camera = new THREE.PerspectiveCamera();
const point = new THREE.Vector3();
const zAxis = new THREE.Vector3(0, 0, 1);
const lookTarget = new THREE.Vector3();
const direction = new THREE.Vector3();

/**
 * 根据参数构建求解用的透视相机
 */
function buildCamera(params: CameraCalibrationParameters): THREE.PerspectiveCamera {
    // 更新内参矩阵：FOV 和宽高比决定画面范围，near/far 决定有效深度范围
    camera.fov = params.fovDeg;
    camera.aspect = params.aspect;
    camera.near = params.near;
    camera.far = params.far;
    camera.updateProjectionMatrix();
    camera.position.fromArray(params.position);

    // 由方位角和俯仰角计算相机前向单位向量
    const azimuth = THREE.MathUtils.degToRad(params.azimuthDeg);
    const elevation = THREE.MathUtils.degToRad(params.elevationDeg);
    direction
        .set(
            Math.cos(elevation) * Math.cos(azimuth),
            Math.sin(elevation),
            Math.cos(elevation) * Math.sin(azimuth),
        )
        .normalize();

    // 先用前向向量确定基础姿态，再绕相机本地 Z 轴叠加横滚角
    camera.up.set(0, 1, 0);
    lookTarget.copy(camera.position).add(direction);
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld(true);
    camera.rotateOnAxis(zAxis, THREE.MathUtils.degToRad(params.rollDeg));
    camera.updateMatrixWorld(true);
    return camera;
}

/** 将一个三维观测点投影到归一化视频 UV；点位于相机后方或结果无效时返回 null */
function projectWorld(
    params: CameraCalibrationParameters,
    world: [number, number, number],
): [number, number] | null {
    // 构建透视相机
    const cam = buildCamera(params);
    // Three.js 相机朝向本地 -Z，z >= 0 表示该点不在相机前方
    point.fromArray(world).applyMatrix4(cam.matrixWorldInverse);
    if (point.z >= -1e-6) return null;
    // Vector3.project() 返回 NDC 坐标，范围 [-1, 1]；再转换为视频 UV 的 [0, 1]
    point.fromArray(world).project(cam);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return [(point.x + 1) / 2, (point.y + 1) / 2];
}

/**
 * 使用当前投影参数作为初值，通过鲁棒 Levenberg-Marquardt 最小化像素重投影误差
 * 优化变量为位置 XYZ、方位/俯仰/横滚和垂直 FOV；aspect/near/far 保持固定
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
    const initialPosition = new THREE.Vector3().fromArray(initial.position);
    const distances = observations.map((item) =>
        initialPosition.distanceTo(new THREE.Vector3().fromArray(item.world)),
    );
    const positionScale = clamp(median(distances) * 0.05, 1, 50);
    // 依次对应 XYZ、方位角、俯仰角、横滚角、FOV 的实际变化尺度
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
            position: [
                initial.position[0] + values[0] * scales[0],
                initial.position[1] + values[1] * scales[1],
                initial.position[2] + values[2] * scales[2],
            ],
            azimuthDeg: initial.azimuthDeg + values[3] * scales[3],
            elevationDeg: clamp(initial.elevationDeg + values[4] * scales[4], -89, 89),
            rollDeg: initial.rollDeg + values[5] * scales[5],
            fovDeg: clamp(initial.fovDeg + values[6] * scales[6], 5, 120),
        }),
    });
}
