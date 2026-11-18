import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const repo = path.resolve(import.meta.dirname, "../../.."),
  variant = process.argv[2] || "migrated";
const baseline = variant === "baseline" || variant === "baseline-integrated";
const baselineDemo = variant === "baseline-integrated" ? "demos/terrain" : "demos/terrain/seed-world-planner";
const gallery = path.resolve(repo, "../engine-next/world/.materialized/engine/world-gallery");
const require = createRequire(path.join(baseline ? gallery : path.join(repo, "world"), "package.json"));
const { preview } = await import(
  pathToFileURL(path.join(path.dirname(require.resolve("vite/package.json")), "dist/node/index.js"))
);
process.env.WORLD_DEMO = "all";
const server = await preview({
  root: baseline ? path.join(gallery, baselineDemo) : repo,
  configFile: baseline ? path.join(gallery, "vite.config.js") : path.join(repo, "world/vite.config.mjs"),
  build: { outDir: path.join(repo, "world/.acceptance/production", variant) },
  preview: {
    port: variant === "baseline-integrated" ? 5197 : baseline ? 5195 : 5196,
    host: "127.0.0.1",
    strictPort: true,
    open: false
  }
});
server.printUrls();
