import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(path.join(root, "world/package.json"));
const { build } = require("esbuild");

test("CPU Water Material file entry bundles and executes as CJS without runtime asset initialization", async () => {
  assert.ok(process.env.WATER_TEST_ENGINE_ROOT, "Set WATER_TEST_ENGINE_ROOT to a built Engine workspace.");
  const packages = path.resolve(process.env.WATER_TEST_ENGINE_ROOT, "packages");
  const alias = Object.fromEntries(
    ["core", "math", "design", "loader", "rhi-webgl", "shader", "shader-compiler"].map((name) => [
      `@galacean/engine-${name}`,
      path.join(packages, name, "dist/module.js")
    ])
  );
  alias["@galacean/engine"] = path.join(packages, "galacean/dist/module.js");
  const output = await mkdtemp(path.join(tmpdir(), "water-material-file-cjs-"));
  try {
    const outfile = path.join(output, "authoring.cjs");
    const result = await build({
      stdin: {
        contents: `export { resolveWaterMaterialFileLook, createWaterMaterialDefaults } from ${JSON.stringify(path.join(root, "packages/water/src/water/native/WaterMaterialFile.ts"))}; export { resolveWaterSurfaceAppearanceForQuality } from ${JSON.stringify(path.join(root, "packages/water/src/water/authoring/quality/WaterSurfaceAppearanceQuality.ts"))};`,
        resolveDir: root,
        loader: "ts"
      },
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile,
      alias,
      metafile: true,
      loader: { ".glsl": "text" }
    });
    assert.ok(!Object.keys(result.metafile.inputs).some((input) => input.endsWith("/WaterBuiltinAssets.ts")));
    const {
      resolveWaterMaterialFileLook,
      createWaterMaterialDefaults,
      resolveWaterSurfaceAppearanceForQuality
    } = require(outfile);
    for (const profile of ["lake", "river", "ocean"])
      assert.ok(resolveWaterMaterialFileLook(createWaterMaterialDefaults(profile)).appearance.appearance);
    const appearance = resolveWaterMaterialFileLook(createWaterMaterialDefaults("lake")).appearance.appearance;
    for (const surfaceShading of ["low", "medium", "high"]) {
      const derived = resolveWaterSurfaceAppearanceForQuality(appearance, { surfaceShading });
      assert.equal(derived.detailLayers.length, surfaceShading === "low" ? 1 : 2);
    }
    const prefix = "material_Water_appearance_appearance_boundaryEffects_1_pattern_octaves_";
    for (const count of [1, 2, 3]) {
      const file = createWaterMaterialDefaults("lake");
      file.shaderData[prefix + "count"].value = count;
      assert.equal(
        resolveWaterMaterialFileLook(file).appearance.appearance.boundaryEffects[1].pattern.octaves.weights.length,
        count
      );
      file.shaderData[prefix + "weights"].value = { x: -1, y: 0, z: 0 };
      assert.throws(() => resolveWaterMaterialFileLook(file));
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
