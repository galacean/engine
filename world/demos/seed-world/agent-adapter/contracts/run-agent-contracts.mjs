import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Contract inputs share the Gallery's ESM modules, including import.meta asset URLs.
// Use Vite's existing loader rather than interpreting those modules as CommonJS.
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
process.env.WORLD_GALLERY_SOURCE_ROOT ??= root;
// SSR declaration generation must not replace the running preview's dependency optimizer cache.
const server = await createServer({ root, cacheDir: fileURLToPath(new URL("node_modules/.vite-agent-contracts/", new URL("../../../../../", import.meta.url))), configFile: false, logLevel: "error",
  server: { middlewareMode: true }, appType: "custom" });
try {
  await server.ssrLoadModule("/world/demos/seed-world/agent-adapter/contracts/generate-agent-contracts.ts");
} finally {
  await server.close();
}
