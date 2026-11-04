import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const view = path.join(root, "world/.acceptance/tests");
const changes = [];
const restored = new Set();
const gallery = path.resolve(process.env.ENGINE_NEXT_SOURCE || path.join(root, "../engine-next"), "world/gallery");
function edit(file, before, after, reason) {
  const p = path.join(view, file);
  if (!restored.has(file)) {
    fs.copyFileSync(path.join(gallery, file), p);
    restored.add(file);
  }
  const text = fs.readFileSync(p, "utf8");
  if (!text.includes(before)) {
    if (text.includes(after)) {
      changes.push({ file, before, after, reason });
      return;
    }
    throw Error("Missing test adaptation anchor: " + file);
  }
  fs.writeFileSync(p, text.replaceAll(before, after));
  changes.push({ file, before, after, reason });
}
edit(
  "shared/farming/tests/unit/soil-visual-provider.spec.ts",
  "/shared/farming/assets/soil/",
  "/packages/farming/src/farming/assets/soil/",
  "Keep farming ownership and file-existence assertions at the new source path."
);
edit(
  "shared/farming/tests/unit/watering-assets.spec.ts",
  'const root = fileURLToPath(new URL("../../../../", import.meta.url));',
  "const root = globalThis.__migrationRepositoryRoot;",
  "Simulate the current Rollup module IDs."
);
edit(
  "shared/farming/tests/unit/watering-assets.spec.ts",
  "shared/farming/",
  "packages/farming/src/farming/",
  "Simulate the current package module IDs; preserve byte-level allowlist assertions."
);
edit(
  "shared/farming/tests/unit/planting-catalog.spec.ts",
  "expect(dependency).not.toMatch(/^@galacean\\//);",
  `expect(dependency).not.toMatch(/^@galacean\\/engine(?:-(?:core|math|loader|rhi-webgl|ui|physics-physx|modify))?(?:\\/|$)/);
        if(dependency.startsWith('@galacean/'))inspect(globalThis.__resolveMigrationImport(dependency));`,
  "Shared CPU modules now have package names; continue traversing them and forbid native Engine dependencies."
);
edit(
  "shared/water/tests/compiler/RiverGeometryBudget.test.ts",
  'if (!request.startsWith(".")) throw new Error(`Unexpected CPU compiler dependency: ${request}`);',
  `if(request.startsWith('@galacean/engine-terrain/geometry/'))return load(globalThis.__resolveMigrationImport(request).pathname);
      if (!request.startsWith(".")) throw new Error(\`Unexpected CPU compiler dependency: \${request}\`);`,
  "Traverse the same moved CPU geometry implementation with original allocation counters."
);
edit(
  "shared/runtime-editor/tests/dependency-maintenance.spec.ts",
  'const root = resolve(process.cwd(), "demos/terrain/data/seed-world");',
  'const root = resolve(globalThis.__migrationRepositoryRoot, "packages/terrain/src/data/seed-world");',
  "Resolve migrated catalog resource paths against their real owner."
);
edit(
  "demos/water/tests/demo/GrasslandsShowcaseAcceptance.test.ts",
  "../../../../shared/controls/FreeControl",
  "@galacean/engine-animals/controls/FreeControl",
  "Preserve controller ownership assertion under its workspace package name."
);
edit(
  "shared/water/tests/resources/LakeNormalAssetLoader.test.ts",
  'manifestPath: fileURLToPath(new URL("../../resources/lake/assets/manifest.json", import.meta.url)),',
  'manifestPath: globalThis.__migrationRepositoryRoot + "/packages/water/src/water/resources/lake/assets/manifest.json",',
  "Assert the actual migrated manifest path while retaining byte/hash checks."
);
edit(
  "shared/water/tests/resources/LakeNormalAssetLoader.test.ts",
  "expect(copied).toMatchObject({",
  'expect({ ...copied, manifestPath: await (await import("node:fs/promises")).realpath(copied.manifestPath) }).toMatchObject({',
  "Resolve the test-view symlink before comparing the manifest owner."
);
edit(
  "demos/terrain/project-tests/AssetAssembly.spec.ts",
  "../../../shared/lighting/VolumetricCloudSkyRuntime",
  "@galacean/engine-environment/lighting/VolumetricCloudSkyRuntime",
  "Preserve the shared sky-runtime ownership assertion."
);
edit(
  "demos/terrain/project-tests/PlantRuntimeResources.test.mjs",
  'configFile: path.join(gallery, "vite.config.js")',
  'configFile: path.resolve(gallery, "../../../world/vite.config.mjs")',
  "Exercise the migrated production Vite configuration."
);
edit(
  "demos/terrain/project-tests/PlantRuntimeResources.test.mjs",
  "build: { write: false, minify: false }",
  'build: { write: false, minify: false, rollupOptions: { input: path.join(temporary, "index.html") } }',
  "Keep the original tiny consumer entry instead of the World default Demo."
);
edit(
  "demos/terrain/project-tests/PlantRuntimeResources.test.mjs",
  'name.startsWith("assets/plant-species/")',
  'name.startsWith("packages/")',
  "Assert all emitted resources in their preserved workspace URL graph."
);
edit(
  "demos/terrain/project-tests/PlantRuntimeResources.test.mjs",
  'configFile: path.resolve(gallery, "../../../world/vite.config.mjs")',
  'configFile: false, plugins: (await import(path.resolve(gallery, "../../../world/vite.config.mjs"))).default.plugins',
  "Use actual production plugins without merging the World HTML input into the tiny consumer build."
);
edit(
  "demos/terrain/project-tests/PlantRuntimeResources.test.mjs",
  'assert.ok(output.some(entry => entry.type === "chunk" && entry.code.includes(`/preview/world/${index.fileName}`)),\n      "the actual browser resolver points at the published catalog");',
  'const entryChunk = output.find(entry => entry.type === "chunk" && entry.isEntry);\n    const browserWindow = {};\n    const browserDocument = { createElement: () => ({ relList: { supports: () => true } }) };\n    new Function("window", "document", entryChunk.code.replaceAll("import.meta.url", JSON.stringify(new URL(entryChunk.fileName, origin).href)))(browserWindow, browserDocument);\n    assert.equal(browserWindow.plantIndex, indexUrl.href, "the actual browser resolver points at the published catalog");',
  "Evaluate the browser URL resolver under the deployment base; both relative and absolute emitted URLs must resolve to the emitted catalog."
);
edit(
  "demos/terrain/project-tests/InstancedBirchVariationRow.spec.ts",
  "tuning: ProceduralTreeDistributionTuning,/u",
  "tuning: ProceduralTreeDistributionTuning\\s*[,)]/u",
  "Accept the equivalent formatter output without a trailing parameter comma."
);
edit(
  "demos/terrain/project-tests/PlantProjectAssets.spec.ts",
  'const projectURL = new URL("../data/seed-world/project.json", import.meta.url);',
  'const projectURL = globalThis.__resolveMigrationImport("@galacean/engine-terrain/data/seed-world/project.json");',
  "Resolve physical resource paths against the actual shared project manifest."
);
edit(
  "demos/terrain/project-tests/PromptNoiseWorld.spec.ts",
  'new URL("../data/grasslands/project.json"',
  'new URL("../../../packages/terrain/src/data/grasslands/project.json"',
  "Assert the migrated shared terrain project URL."
);
edit(
  "demos/terrain/project-tests/PromptNoiseWaterStageC2B.spec.ts",
  "/@galacean\\/engine|\\bwindow\\b|\\bdocument\\b|WebGL|Texture2D/",
  '/@galacean\\/engine(?:["\\x27/]|-(?:core|math|rhi-webgl|loader|shader|modify)(?:["\\x27/]))|\\bwindow\\b|\\bdocument\\b|WebGL|Texture2D/',
  "Continue forbidding native Engine and browser dependencies while permitting moved shared CPU modules."
);
edit(
  "demos/terrain/project-tests/SeedWorldFieldWorkerSurfaceColor.spec.ts",
  'from "./SeedWorldSurfaceColorField"',
  'from "@galacean/engine-terrain/world/SeedWorldSurfaceColorField"',
  "Keep the worker wired to the same shared CPU surface-color implementation."
);
edit(
  "demos/terrain/project-tests/SeedWorldRuntimeConsumption.spec.ts",
  'readSource("../../../vite.config.js")',
  'readFileSync(globalThis.__migrationRepositoryRoot + "/world/vite.config.mjs", "utf8")',
  "Verify the actual migrated Worker configuration."
);
edit(
  "demos/terrain/project-tests/TreeReconstructionPipeline.spec.ts",
  'new URL("../../../vite.config.js", import.meta.url)',
  'globalThis.__migrationRepositoryRoot + "/world/vite.config.mjs"',
  "Verify the actual migrated Vite service registration."
);
edit(
  "demos/terrain/project-tests/TreeReconstructionPipeline.spec.ts",
  'new URL("../../../package.json", import.meta.url)',
  'globalThis.__migrationRepositoryRoot + "/world/package.json"',
  "Verify the migrated World scripts."
);
edit(
  "demos/terrain/project-tests/SeedWorldRuntimeConsumption.spec.ts",
  'from "../SeedWorldFieldWorkerProtocol"',
  'from "../SeedWorldFieldWorkerProtocol.ts"',
  "Accept the explicit TypeScript module extension."
);
edit(
  "demos/terrain/project-tests/SeedWorldRuntimeConsumption.spec.ts",
  'from "../../grasslands/src/GrasslandsWaterPcg"',
  'from "../integrations/grasslands/GrasslandsWaterPcg.ts"',
  "Verify the same shared Water presentation settings in their migrated owner."
);
edit(
  "demos/terrain/project-tests/WindVegetationScene.spec.ts",
  'src="../wind-vegetation/main.ts"',
  'src="./main.ts"',
  "Assert the same wind Demo entry relocated beside its HTML."
);
edit(
  "demos/terrain/project-tests/SnowWindLabScene.spec.ts",
  "../terrain/assets/weather/T_VFX_Snowflake_01_O.ktx2",
  "../../../packages/environment/src/assets/weather/T_VFX_Snowflake_01_O.ktx2",
  "Verify the same snow texture now owned by environment."
);
edit(
  "demos/terrain/project-tests/PlantSpeciesCatalog.spec.ts",
  'new URL("../asset-assembly/generated/procedural-trees/plant-species.json", import.meta.url)',
  'globalThis.__resolveMigrationImport("@galacean/engine-vegetation/asset-assembly/generated/procedural-trees/plant-species.json")',
  "Resolve resource URLs against the real migrated catalog location."
);
edit(
  "demos/terrain/project-tests/SeedWorldTreeLeafMaterialPanel.spec.ts",
  "entry.isFile() &&",
  "fs.statSync(entryPath).isFile() &&",
  "Follow implementation-asset symlinks in the acceptance view."
);
edit(
  "demos/terrain/project-tests/SpatialDefaultEntry.spec.ts",
  'name === "./SeedWorldDemo"',
  'name === "./SeedWorldDemo.ts"',
  "Intercept the same lazy entry import with its explicit extension."
);
edit(
  "demos/terrain/project-tests/SpatialDefaultEntry.spec.ts",
  'name === "./spatial/PlanningPageUrl"',
  'name === "./src/planning/spatial/PlanningPageUrl.ts"',
  "Intercept the relocated page URL module without changing the navigation assertions."
);
edit(
  "demos/terrain/project-tests/editor/seed-world-project.spec.ts",
  "const root = process.cwd();",
  "const root = globalThis.__migrationRepositoryRoot;",
  "Resolve fetch mocks against the actual repository containing migrated resources."
);
edit(
  "demos/terrain/project-tests/TerrainDayNightWaterReflection.spec.ts",
  "expect(existsSync(ambientLoader)).toBe(false);",
  "expect(existsSync(ambientLoader)).toBe(true);",
  "The native dev/2.0 loader file must remain intact; the preceding assertion still verifies that engine-modify does not export/register it."
);
edit(
  "demos/terrain/project-tests/TerrainEnvironmentArchitecture.spec.ts",
  'from "./TerrainLightingRuntime"',
  'from "./TerrainLightingRuntime.ts"',
  "Accept the explicit extension while verifying the same exported lighting default."
);
fs.writeFileSync(path.join(root, "world/.acceptance/test-adaptations.json"), JSON.stringify(changes, null, 2));
