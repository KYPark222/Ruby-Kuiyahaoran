import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL("./app/assets/builds", import.meta.url)),
    emptyOutDir: false,
    target: "es2022",
    minify: false,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL("./src/integration/browserAdapter.ts", import.meta.url)),
      name: "PachinkoGameCoreBundle",
      formats: ["iife"],
      fileName: () => "game_core.js",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  root: projectRoot,
});
