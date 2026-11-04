import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = path.join(root, ".cache/engine/packages");
const alias = fs.readdirSync(packages).map((name) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packages, name, "package.json")));
  return { find: pkg.name, replacement: path.join(packages, name, "dist/module.js") };
});
export default defineConfig({
  resolve: { alias },
  optimizeDeps: { exclude: [...alias.map((entry) => entry.find), "@galacean/engine-toolkit-controls"] },
  test: {
    include: ["packages/modify/tests/*.test.ts"],
    browser: { enabled: true, headless: true, provider: "playwright", instances: [{ browser: "chromium" }] }
  }
});
