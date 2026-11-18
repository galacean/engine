import path from "node:path";
import { engineProbe } from "./engine-probe.mjs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const repo = path.resolve(import.meta.dirname, "../../..");
const baseline = process.argv[2] === "baseline";
const root = baseline ? path.resolve(repo, "../engine-next/world/.materialized/engine/world-gallery") : repo;
const require = createRequire(path.join(root, baseline ? "package.json" : "world/package.json"));
const { createServer } = await import(
  pathToFileURL(path.join(path.dirname(require.resolve("vite/package.json")), "dist/node/index.js"))
);
const server = await createServer({
  root,
  plugins: [engineProbe()],
  optimizeDeps: { exclude: ["@galacean/engine-rhi-webgl"] },
  configFile: path.join(root, baseline ? "vite.config.js" : "world/vite.config.mjs"),
  server: { port: baseline ? 5191 : 5192, host: "127.0.0.1", open: false, strictPort: true }
});
await server.listen();
server.printUrls();
