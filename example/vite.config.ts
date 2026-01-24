import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  base: "/",
  build: {
    outDir: "../docs", // 输出到仓库根目录的 docs
    emptyOutDir: true,
  },
});
