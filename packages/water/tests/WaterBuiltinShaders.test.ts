import { expect, it, vi } from "vitest";
import { AssetType, Material, Shader, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { WATER_BUILTIN_SHADER_NAMES, registerWaterBuiltinShaders } from "../src/water/native/WaterBuiltinShaders";
import { WATER_BUILTIN_SHADER_SOURCES } from "../src/water/native/WaterBuiltinShaderSources";
import { createWaterMaterialDefaults } from "../src/water/native/WaterMaterial";
import { resolveWaterShaderModule } from "../src/water/runtime/material/WaterShaderModule";
import lakeSource from "../src/water/native/assets/Water/Shaders/lake.shader?raw";
import riverSource from "../src/water/native/assets/Water/Shaders/river.shader?raw";
import sourceHashes from "../src/water/native/assets/Water/Shaders/builtin/sources.json";
import { digestSha256Hex } from "../src/water/resources/sha256";

it("registers all three authoring contracts without a runtime compiler and loads name-only materials", async () => {
  const originalCompiler = Shader._shaderCompiler;
  Shader._shaderCompiler = undefined;
  const create = vi.spyOn(Shader, "create");
  let engine: WebGLEngine | undefined;
  try {
    registerWaterBuiltinShaders();
    const originals = Object.values(WATER_BUILTIN_SHADER_NAMES).map((name) => Shader.find(name));
    registerWaterBuiltinShaders();
    expect(Object.values(WATER_BUILTIN_SHADER_NAMES).map((name) => Shader.find(name))).toEqual(originals);
    expect(create).not.toHaveBeenCalled();
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    for (const profile of ["lake", "river", "ocean"] as const) {
      const file = createWaterMaterialDefaults(profile);
      expect(file).not.toHaveProperty("shaderRef");
      expect(Object.values(file.shaderData).every((entry) => entry.type !== "Texture")).toBe(true);
      const material = await engine.resourceManager.load<Material>({
        type: AssetType.Material,
        url: "data:application/json," + encodeURIComponent(JSON.stringify(file))
      });
      expect(material.shader).toBe(Shader.find(WATER_BUILTIN_SHADER_NAMES[profile]));
      if (profile === "ocean") expect(material.shader.subShaders.map((sub) => sub.name)).toContain("WaterFar");
      material.destroy();
    }
  } finally {
    create.mockRestore();
    engine?.destroy();
    Shader._shaderCompiler = originalCompiler;
  }
});

it("rejects foreign names before registration and rejects a later shadow of an owned instance", () => {
  registerWaterBuiltinShaders();
  const name = WATER_BUILTIN_SHADER_NAMES.lake;
  const owned = Shader.find(name)!;
  // Destroying an owned shader also exercises restoration after teardown.
  owned.destroy();
  const foreign = Shader.create(name, [...Shader.find("Unlit")!.subShaders]);
  try {
    expect(() => registerWaterBuiltinShaders()).toThrow("another owner");
  } finally {
    foreign.destroy();
  }
  registerWaterBuiltinShaders();
  const replacement = Shader.find(name)!;
  expect(replacement).not.toBe(owned);
  const shadow = Shader.create(name, [...replacement.subShaders]);
  try {
    expect(() => registerWaterBuiltinShaders()).toThrow("another owner");
  } finally {
    shadow.destroy();
  }
  expect(Shader.find(name)).toBe(replacement);
  registerWaterBuiltinShaders();
});

it.each(["lake", "river", "ocean"] as const)(
  "parses and GPU-links the %s source with texture UI removed and sampler declarations retained",
  async (profile) => {
    const source = WATER_BUILTIN_SHADER_SOURCES[profile];
    expect(await digestSha256Hex(new TextEncoder().encode(source))).toBe(sourceHashes[profile]);
    expect(source).not.toMatch(/,\s*Texture2D\)/);
    expect(source).toMatch(/sampler2D\s+/);
    expect(source).toContain(`Shader "${WATER_BUILTIN_SHADER_NAMES[profile]}"`);
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    const isolated = Shader.create(source.replace(WATER_BUILTIN_SHADER_NAMES[profile], `WaterSourceTest/${profile}`));
    try {
      expect(isolated.compileVariant(engine, [])).toBe(true);
      registerWaterBuiltinShaders();
      expect(Shader.find(WATER_BUILTIN_SHADER_NAMES[profile])!.compileVariant(engine, [])).toBe(true);
    } finally {
      isolated.destroy();
      engine.destroy();
    }
  }
);

it("keeps authoring registrations out of the existing lake/river runtime lookup names", () => {
  registerWaterBuiltinShaders();
  for (const source of [lakeSource, riverSource]) {
    const name = source.match(/Shader\s+"([^"]+)"/)![1];
    expect(Object.values(WATER_BUILTIN_SHADER_NAMES)).not.toContain(name);
    const moduleFactory = vi.fn(() => {
      throw new Error("runtime cache miss");
    });
    expect(() => resolveWaterShaderModule(name, moduleFactory)).toThrow("runtime cache miss");
    expect(moduleFactory).toHaveBeenCalledOnce();
    // The old registration name really would short-circuit the variant factory.
    const namesake = Shader.create(name, [...Shader.find("Unlit")!.subShaders]);
    try {
      expect(resolveWaterShaderModule(name, moduleFactory)).toBe(namesake);
    } finally {
      namesake.destroy();
    }
  }
});
