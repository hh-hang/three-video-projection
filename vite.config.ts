import { cpSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import vue from "@vitejs/plugin-vue";
import glsl from "vite-plugin-glsl";
import { defineConfig, type Plugin } from "vite";

const cesiumSource = path.resolve(__dirname, "node_modules/cesium/Build/Cesium");
const cesiumPublic = path.resolve(__dirname, "example/public/cesium");

function copyDir(src: string, dest: string) {
    if (process.platform === "win32") {
        const result = spawnSync(
            "robocopy",
            [src, dest, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"],
            { windowsHide: true },
        );
        if (result.status != null && result.status >= 8) {
            throw new Error(`robocopy failed with exit code ${result.status}`);
        }
        return;
    }
    cpSync(src, dest, { recursive: true });
}

function copyCesium(): Plugin {
    return {
        name: "copy-cesium",
        buildStart() {
            copyDir(cesiumSource, cesiumPublic);
        },
    };
}

export default defineConfig({
    base: "/vid3d-projection/",
    root: "example",
    define: {
        CESIUM_BASE_URL: JSON.stringify("/vid3d-projection/cesium/"),
    },
    plugins: [copyCesium(), vue(), glsl()],
    resolve: {
        alias: {
            "vid3d-projection": path.resolve(__dirname, "src/index.ts"),
        },
    },
    build: {
        outDir: path.resolve(__dirname, "docs"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: path.resolve(__dirname, "example/index.html"),
                "three-cinema": path.resolve(__dirname, "example/three-cinema.html"),
                "three-monitor": path.resolve(__dirname, "example/three-monitor.html"),
                "cesium-monitor": path.resolve(__dirname, "example/cesium-monitor.html"),
            },
        },
    },
});
