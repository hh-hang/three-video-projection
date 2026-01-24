import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  plugins: [vue()],
  base: "/three-video-projection/",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        cinema: resolve(__dirname, "cinema.html"),
      },
    },
  },
});
