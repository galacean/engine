import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceEngine } from "../../../packages/project/build/vite.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = path.resolve(root, "../engine-next/world/.materialized/engine");
const overlay = path.resolve(root, "../engine-next/world/engine/overlay/tests");
function walk(p) {
  return fs
    .readdirSync(p, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)]));
}
export default {
  optimizeDeps: { noDiscovery: true, entries: [] },
  root: path.join(root, "world/.acceptance/engine-tests"),
  plugins: [
    {
      name: "acceptance-native-paths",
      enforce: "pre",
      resolveId(specifier, importer) {
        if (!importer || !specifier.startsWith(".")) return;
        const candidate = path.resolve(path.dirname(importer), specifier);
        const prefix = path.join(root, "world/.acceptance/packages") + path.sep;
        if (!candidate.startsWith(prefix)) return;
        const canonical = path.join(root, "packages", candidate.slice(prefix.length));
        return [canonical, canonical + ".ts", canonical + ".js", path.join(canonical, "index.ts")].find(
          (f) => fs.existsSync(f) && fs.statSync(f).isFile()
        );
      }
    },
    workspaceEngine()
  ],
  server: { port: 51205, fs: { allow: [root, source] } },
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } } },
  test: {
    include: walk(path.join(overlay, "src"))
      .filter((f) => f.endsWith(".test.ts") && !f.includes("GaussianSplat"))
      .map((f) => path.relative(overlay, f))
      .concat([
        path.join(root, "world/tests/seed-world-browser/LegacyToolkit.test.ts"),
        path.join(root, "world/tests/seed-world-browser/MaterialLoaderCompatibility.test.ts")
      ]),
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium", launch: { args: ["--ignore-gpu-blocklist", "--use-angle=metal"] } }]
    },
    reporters: ["default", "json"],
    outputFile: path.join(root, "world/.acceptance/modified-engine-unit.json")
  }
};
