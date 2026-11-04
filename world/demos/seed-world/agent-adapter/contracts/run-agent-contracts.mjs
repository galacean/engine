import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Contract inputs share the Gallery's ESM modules, including import.meta asset URLs.
// Use Vite's existing loader rather than interpreting those modules as CommonJS.
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
process.env.WORLD_GALLERY_SOURCE_ROOT ??= root;
const server = await createServer({ root, configFile: false, logLevel: "error",
  server: { middlewareMode: true }, appType: "custom" });
try {
  await server.ssrLoadModule("/world/demos/seed-world/agent-adapter/contracts/generate-agent-contracts.ts");
} finally {
  await server.close();
}
