import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
  optimizeDeps: {
    exclude: [
      "@galacean/engine",
      "@galacean/engine-core",
      "@galacean/engine-toolkit-controls"
    ]
  },
  build: { outDir: "../dist/screen-space-reflection", emptyOutDir: true }
});
