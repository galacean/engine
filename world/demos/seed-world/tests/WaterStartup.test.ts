import { beforeAll, expect, it } from "vitest";
import { Shader, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { WaterBodyComponent, createWaterCreationPreset } from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { registerSeedWorldWaterStartupShaders } from "@galacean/engine-water/world/SeedWorldWaterStartupShaders";
import { SEED_WORLD_WATER_SHADER_AOT_CONTRACT } from "@galacean/engine-water/world/SeedWorldWaterShaderAotContract";
import { writeWaterTerrainAssets } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";
import { openWaterEditorFixture } from "../../../../packages/world-planning/tests/WaterEditorFixture";

beforeAll(async () => {
  // The application initializes its Engine compiler before registering startup profiles.
  const engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    shaderCompiler: new ShaderCompiler()
  });
  try {
    registerSeedWorldWaterStartupShaders();
  } finally {
    engine.destroy();
  }
});

it("loads the authored Ocean Shader after SeedWorld registers its near-only startup profile", async () => {
  registerSeedWorldWaterStartupShaders();
  const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
  const current = await openWaterEditorFixture(
    "seed-water-startup:" + crypto.randomUUID(),
    manifest,
    BUILTIN_WATER_PROJECT_URL
  );
  try {
    const legacyNear = Shader.find("AIWorld/Ocean")!;
    const legacyFar = Shader.find("AIWorld/OceanFar")!;
    expect(legacyNear.subShaders.map((sub) => sub.name)).toEqual(["Default"]);
    expect(legacyFar).toBeDefined();
    const original = current.editor.projection.queryComponents({ type: "WaterBodyComponent" })[0];
    await current.water.change({ operation: "remove", id: original.id });
    const preset = createWaterCreationPreset("ocean");
    await current.water.execute((edit) =>
      writeWaterTerrainAssets(edit, "Water/Terrain/manual-bed.json", preset.terrain)
    );
    const created = await current.water.change({
      operation: "create",
      name: "Ocean after SeedWorld startup",
      input: {
        shape: preset.shape,
        terrain: {
          mode: "asset",
          description: { $ref: "Water/Terrain/manual-bed.json" },
          heights: { $ref: "Water/Terrain/manual-bed.bin" }
        },
        material: { $ref: "Water/Materials/ocean.mat" }
      }
    });
    expect(created.runtimeError).toBeUndefined();
    const body = current.editor.projection.component(created.value!) as WaterBodyComponent;
    expect(body.authoring!.material.shader.subShaders.map((sub) => sub.name)).toContain("WaterFar");
    expect(current.system.sample(0, 0).water).toBe(true);
    expect(body.authoring!.material.shader).not.toBe(legacyNear);
    expect(Shader.find("AIWorld/Ocean")).toBe(legacyNear);
    expect(legacyNear.subShaders.map((sub) => sub.name)).toEqual(["Default"]);
    expect(Shader.find("AIWorld/OceanFar")).toBe(legacyFar);
  } finally {
    await current.close();
  }
});

it("loads the authored Lake Shader without replacing SeedWorld's startup AOT profile", async () => {
  registerSeedWorldWaterStartupShaders();
  const lakeProfile = SEED_WORLD_WATER_SHADER_AOT_CONTRACT.find(
    (profile) => profile.id === "lake-heightfield-high-hybrid-v2"
  )!;
  const legacyLake = Shader.find(lakeProfile.shaderName)!;
  expect(legacyLake).toBeDefined();
  const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
  const current = await openWaterEditorFixture(
    "seed-lake-startup:" + crypto.randomUUID(),
    manifest,
    BUILTIN_WATER_PROJECT_URL
  );
  try {
    expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
    const identity = current.editor.projection.queryComponents({ type: "WaterBodyComponent" })[0];
    const body = current.editor.projection.component(identity.id) as WaterBodyComponent;
    expect(body.authoring!.material.shader).not.toBe(legacyLake);
    expect(Shader.find(lakeProfile.shaderName)).toBe(legacyLake);
    expect(current.system.sample(4, 4)).toMatchObject({ water: true, surfaceElevationMetres: 0.5 });
  } finally {
    await current.close();
  }
});
