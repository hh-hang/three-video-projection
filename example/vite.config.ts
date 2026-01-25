import vue from "@vitejs/plugin-vue";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue(),
    {
      name: "create-nojekyll",
      closeBundle() {
        const nojekyllPath = resolve(__dirname, "../docs/.nojekyll");
        writeFileSync(nojekyllPath, "");
      },
    },
  ],
  base: "/three-video-projection/",
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, "../docs"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        cinema: resolve(__dirname, "cinema.html"),
      },
    },
  },
});
