/** 一组视频像素点与三维场景点的对应观测 */
export interface CalibrationObservation {
    /** 归一化视频坐标 [u, v] */
    uv: [number, number];
    /** 与视频点对应的 Three.js 场景坐标 [x, y, z] */
    world: [number, number, number];
}

/** 相机标定的求解结果与重投影误差 */
export interface CalibrationSolveResult<P> {
    /** 求解后的完整相机参数 */
    parameters: P;
    /** 所有标定点重投影误差的均方根，单位为原始视频像素 */
    rmsePx: number;
    /** 单个标定点的最大重投影误差，单位为原始视频像素 */
    maxErrorPx: number;
    /** 各标定点的重投影误差，顺序与输入 observations 一致 */
    errorsPx: number[];
    /** 实际执行的 LM 迭代次数 */
    iterations: number;
}

/** 将一个三维观测点投影到归一化视频 UV；点位于相机后方或结果无效时返回 null */
export type CalibrationProjectFn<P> = (
    params: P,
    world: [number, number, number],
) => [number, number] | null;

/** 相机标定求解的输入选项 */
export interface CalibrationSolveOptions<P> {
    /** 视频 UV 与三维场景坐标的对应点，至少需要 6 组 */
    observations: CalibrationObservation[];
    /** 原始视频宽度，用于把归一化 U 误差换算为像素 */
    imageWidth: number;
    /** 原始视频高度，用于把归一化 V 误差换算为像素 */
    imageHeight: number;
    /** 优化变量个数 */
    parameterCount: number;
    /** 将无量纲增量还原为真实相机参数，并约束易退化参数的有效范围 */
    toParameters: (normalized: number[]) => P;
    /** 三维世界坐标到归一化视频 UV 的投影 */
    project: CalibrationProjectFn<P>;
    /** 最大迭代次数 */
    maxIterations?: number;
}

// Huber 损失的转折阈值；超过 12px 的点会被降权，减弱误点对结果的影响
const huberDeltaPx = 12;

export const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

/** 计算数值中位数，用于从标定点距离中获得不易受极端值影响的位置步长 */
export function median(values: number[]): number {
    if (!values.length) return 0;
    // 复制后排序，避免改变调用方传入的原数组
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    // 奇数个值取中间项，偶数个值取中间两项的平均值
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * 计算所有观测点的原始像素残差，排列为 [dx0, dy0, dx1, dy1, ...]
 * 无法投影的点记为较大的固定误差值，并限制误差范围以避免数值溢出
 */
function rawResiduals<P>(
    params: P,
    observations: CalibrationObservation[],
    imageWidth: number,
    imageHeight: number,
    project: CalibrationProjectFn<P>,
): number[] {
    const residuals: number[] = [];
    for (const observation of observations) {
        const projected = project(params, observation.world);
        if (!projected) {
            // 固定的较大误差会让优化器远离“标定点落到相机后方”的参数组合
            residuals.push(5000, 5000);
            continue;
        }
        // U、V 分别乘视频宽、高，将归一化坐标差换算为真实像素差
        residuals.push(
            clamp((projected[0] - observation.uv[0]) * imageWidth, -5000, 5000),
            clamp((projected[1] - observation.uv[1]) * imageHeight, -5000, 5000),
        );
    }
    return residuals;
}

/** 以每个点的二维像素距离计算 Huber 鲁棒代价 */
function robustCost(residuals: number[]): number {
    let cost = 0;
    for (let i = 0; i < residuals.length; i += 2) {
        // 将同一标定点的水平、垂直误差合成为二维像素距离
        const error = Math.hypot(residuals[i], residuals[i + 1]);
        // 小误差使用平方代价保证精确收敛，大误差改用线性增长以降低误点影响
        cost += error <= huberDeltaPx
            ? 0.5 * error * error
            : huberDeltaPx * (error - 0.5 * huberDeltaPx);
    }
    return cost;
}

/**
 * 计算迭代重加权最小二乘所需的残差权重
 * 同一点的 X/Y 残差使用相同权重，避免改变其误差方向
 */
function observationWeights(residuals: number[]): number[] {
    const weights: number[] = [];
    for (let i = 0; i < residuals.length; i += 2) {
        const error = Math.max(1e-9, Math.hypot(residuals[i], residuals[i + 1]));
        // 权重会同时乘到残差和雅可比矩阵，所以这里取平方根以得到正确的加权代价
        const weight = Math.sqrt(Math.min(1, huberDeltaPx / error));
        weights.push(weight, weight);
    }
    return weights;
}

/**
 * 使用带部分选主元的 Gauss-Jordan 消元求解线性方程组
 * 矩阵接近奇异时返回 null，通常意味着标定点的空间分布不足以约束全部参数
 */
function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
    const n = vector.length;
    // 把系数矩阵和右侧向量拼成增广矩阵 [A | b]
    const augmented = matrix.map((row, i) => [...row, vector[i]]);

    for (let column = 0; column < n; column++) {
        // 选择当前列绝对值最大的元素作为主元，降低浮点误差并判断矩阵是否奇异
        let pivot = column;
        for (let row = column + 1; row < n; row++) {
            if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
        }
        if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
        [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];

        // 将主元行归一化，使当前主元变为 1
        const divisor = augmented[column][column];
        for (let j = column; j <= n; j++) augmented[column][j] /= divisor;

        // 消去其他行在当前列的系数，最终把左侧矩阵化为单位矩阵
        for (let row = 0; row < n; row++) {
            if (row === column) continue;
            const factor = augmented[row][column];
            for (let j = column; j <= n; j++) augmented[row][j] -= factor * augmented[column][j];
        }
    }
    // 左侧已是单位矩阵，增广矩阵最后一列就是方程解
    return augmented.map((row) => row[n]);
}

export function solveCalibration<P>(
    options: CalibrationSolveOptions<P>,
): CalibrationSolveResult<P> {
    const {
        observations,
        imageWidth,
        imageHeight,
        parameterCount,
        toParameters,
        project,
        maxIterations = 80,
    } = options;

    if (observations.length < 6) throw new Error("至少需要 6 组有效的 2D-3D 对应点");
    if (imageWidth <= 0 || imageHeight <= 0) throw new Error("视频尺寸无效");
    if (parameterCount <= 0) throw new Error("优化变量个数无效");

    // 全零表示从 initial 开始，后续迭代只求相对初值的增量
    let normalized = new Array(parameterCount).fill(0);

    // 从当前投影参数开始计算初始残差和鲁棒代价
    let params = toParameters(normalized);
    let residuals = rawResiduals(params, observations, imageWidth, imageHeight, project);
    let cost = robustCost(residuals);
    // λ 是 LM 阻尼系数：越大更新越保守，越小越接近高斯牛顿法
    let lambda = 1e-3;
    let completedIterations = 0;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
        completedIterations = iteration + 1;
        // Huber 权重在每轮迭代中更新，使大误差点对本轮求解的影响降低
        const weights = observationWeights(residuals);
        const weightedResiduals = residuals.map((value, i) => value * weights[i]);
        const jacobian = Array.from({ length: residuals.length }, () => new Array(parameterCount).fill(0));
        const step = 1e-4;

        // 使用中心差分计算残差对 7 个优化变量的数值雅可比矩阵
        for (let parameter = 0; parameter < parameterCount; parameter++) {
            const plus = [...normalized];
            const minus = [...normalized];
            plus[parameter] += step;
            minus[parameter] -= step;
            const plusResiduals = rawResiduals(
                toParameters(plus),
                observations,
                imageWidth,
                imageHeight,
                project,
            );
            const minusResiduals = rawResiduals(
                toParameters(minus),
                observations,
                imageWidth,
                imageHeight,
                project,
            );
            for (let row = 0; row < residuals.length; row++) {
                jacobian[row][parameter] =
                    ((plusResiduals[row] - minusResiduals[row]) / (2 * step)) * weights[row];
            }
        }

        // 构造 LM 方程：(JᵀJ + λD)δ = -Jᵀr
        // J: jacobian，r: weightedResiduals，λ: lambda，δ: delta，D: 由 normalMatrix 对角线形成的阻尼
        const normalMatrix = Array.from({ length: parameterCount }, () => new Array(parameterCount).fill(0));
        const gradient = new Array(parameterCount).fill(0);
        for (let row = 0; row < jacobian.length; row++) {
            for (let i = 0; i < parameterCount; i++) {
                gradient[i] += jacobian[row][i] * weightedResiduals[row];
                for (let j = 0; j < parameterCount; j++) {
                    normalMatrix[i][j] += jacobian[row][i] * jacobian[row][j];
                }
            }
        }
        for (let i = 0; i < parameterCount; i++) {
            // 按各参数方向的敏感程度加入阻尼，避免参数尺度不同导致更新失衡
            normalMatrix[i][i] += lambda * Math.max(1, normalMatrix[i][i]);
        }

        // delta 是本轮 7 个归一化参数的更新量
        const delta = solveLinearSystem(normalMatrix, gradient.map((value) => -value));
        if (!delta) throw new Error("标定点分布退化，请选择距离和高度分布更分散的点");
        const candidate = normalized.map((value, i) => value + delta[i]);
        const candidateParams = toParameters(candidate);
        const candidateResiduals = rawResiduals(
            candidateParams,
            observations,
            imageWidth,
            imageHeight,
            project,
        );
        const candidateCost = robustCost(candidateResiduals);

        // 代价下降则接受本次更新并减小阻尼；否则拒绝更新并增大阻尼，缩小下一步
        if (candidateCost < cost) {
            normalized = candidate;
            params = candidateParams;
            residuals = candidateResiduals;
            // 代价变化或参数步长足够小时，认为结果已经收敛
            if (Math.abs(cost - candidateCost) < 1e-6 || Math.hypot(...delta) < 1e-7) {
                cost = candidateCost;
                break;
            }
            cost = candidateCost;
            lambda = Math.max(1e-9, lambda * 0.3);
        } else {
            lambda = Math.min(1e12, lambda * 10);
        }
    }

    // 输出每个点的二维欧氏像素误差，并据此计算 RMSE 和最大误差
    const errorsPx = observations.map((_, i) => Math.hypot(residuals[i * 2], residuals[i * 2 + 1]));
    const rmsePx = Math.sqrt(errorsPx.reduce((sum, error) => sum + error * error, 0) / errorsPx.length);
    return {
        parameters: params,
        rmsePx,
        maxErrorPx: Math.max(...errorsPx),
        errorsPx,
        iterations: completedIterations,
    };
}
