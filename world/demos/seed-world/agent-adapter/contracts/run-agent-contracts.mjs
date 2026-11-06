import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { engineModify } from "../../../../../packages/modify/build/vite.mjs";

// Contract inputs share the Gallery's ESM modules, including import.meta asset URLs.
// Use Vite's existing loader rather than interpreting those modules as CommonJS.
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
process.env.WORLD_GALLERY_SOURCE_ROOT ??= root;
// Keep declaration generation separate from the running preview cache.
const server = await createServer({ root, cacheDir: path.join(root, "node_modules/.vite-agent-contracts"), configFile: false, logLevel: "error",
  plugins: [{ name: "contract-source-paths", enforce: "pre", resolveId(source) {
    if (source.startsWith("/packages/")) return path.join(root, source);
  } }, engineModify()],
  server: { middlewareMode: true }, appType: "custom" });
try {
  await server.ssrLoadModule("/world/demos/seed-world/agent-adapter/contracts/generate-agent-contracts.ts");
} finally {
  await server.close();
}
