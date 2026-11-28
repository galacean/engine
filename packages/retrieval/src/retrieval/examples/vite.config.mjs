import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  optimizeDeps: { include: ["zod"] },
  worker: { format: "es" },
  server: { host: "127.0.0.1", port: 4176, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../../../../", import.meta.url))] } },
  build: { target: "esnext", outDir: "../dist-preview", emptyOutDir: true },
});
