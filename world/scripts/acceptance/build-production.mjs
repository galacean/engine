import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { engineProbe } from "./engine-probe.mjs";
const repo = path.resolve(import.meta.dirname, "../../..");
const variant = process.argv[2] || "migrated";
const gallery = path.resolve(repo, "../engine-next/world/.materialized/engine/world-gallery");
const baseline = variant === "baseline" || variant === "baseline-integrated";
const baselineDemo = variant === "baseline-integrated" ? "demos/terrain" : "demos/terrain/seed-world-planner";
process.env.WORLD_DEMO = "all";
const require = createRequire(path.join(baseline ? gallery : path.join(repo, "world"), "package.json"));
const vite = await import(
  pathToFileURL(path.join(path.dirname(require.resolve("vite/package.json")), "dist/node/index.js"))
);
const root = baseline ? path.join(gallery, baselineDemo) : repo;
const configFile = baseline ? path.join(gallery, "vite.config.js") : path.join(repo, "world/vite.config.mjs");
const outDir = path.join(repo, "world/.acceptance/production", variant);
await vite.build({
  root,
  configFile,
  // The original terrain HTML has <base href="./data/">. Its default root
  // deployment needs absolute entry scripts; a relative override breaks it.
  base: variant === "baseline-integrated" ? "/" : "./",
  plugins: [engineProbe()],
  build: { target: "esnext", outDir, emptyOutDir: true }
});
fs.writeFileSync(
  path.join(outDir, "acceptance-build.json"),
  JSON.stringify({
    variant,
    root,
    configFile,
    date: new Date().toISOString(),
    purpose: baseline
      ? "Original supported " + baselineDemo + " production build"
      : "All migrated static demos, observation only"
  })
);
