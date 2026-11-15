import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = path.join(root, ".cache/engine/packages");
if (!fs.existsSync(packages)) {
  throw new Error("SSR tests require a local Engine build. Run: node packages/modify/build/local-engine.mjs");
}
const alias = fs.readdirSync(packages).flatMap((name) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packages, name, "package.json")));
  const subpaths = Object.entries(pkg.exports ?? {})
    .filter(([key, entry]) => key.startsWith("./") && typeof entry?.import === "string")
    .sort(([a], [b]) => b.length - a.length)
    .map(([key, entry]) => ({ find: pkg.name + key.slice(1), replacement: path.join(packages, name, entry.import) }));
  return [...subpaths, ...(pkg.module ? [{ find: pkg.name, replacement: path.join(packages, name, pkg.module) }] : [])];
});
export default defineConfig({
  resolve: { alias },
  optimizeDeps: { exclude: [...alias.map((entry) => entry.find), "@galacean/engine-toolkit-controls"] },
  test: {
    include: ["packages/modify/tests/*.test.ts"],
    browser: { enabled: true, headless: true, provider: "playwright", instances: [{ browser: "chromium" }] }
  }
});
