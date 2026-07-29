import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        three: "src/three-video-projection.ts",
        "three-calibration": "src/three-camera-calibration.ts",
        cesium: "src/cesium-video-projection.ts",
        "cesium-calibration": "src/cesium-camera-calibration.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    platform: "browser",
    external: ["three", "cesium"],
    loader: {
        ".glsl": "text",
    },
});
