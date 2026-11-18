import { expect, it } from "vitest";
import {
  Shader,
  ShaderLanguage,
  ScreenSpaceReflection,
  ShaderData,
  ShaderDataGroup,
  type Material
} from "@galacean/engine";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import plant from "../../../packages/farming/src/farming/procedural/runtime/PlantOrganTint.shader?raw";
import { SOIL_MOISTURE_SHADER } from "../../../packages/farming/src/farming/presentation/soil/SoilMoistureShader";
import { FARM_ITEM_HIGHLIGHT_SHADER } from "../../../packages/farming/src/farming/presentation/FarmItemHighlightShader";
import { PLANT_HARVEST_SHADER } from "../../../packages/farming/src/farming/presentation/PlantHarvestShader";

const compiler = new ShaderPrecompiler();
const includes: Record<string, string> = {};
const library = fileURLToPath(new URL("../../../packages/modify/.cache/shader-src/ShaderLibrary/", import.meta.url));
function readIncludes(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) readIncludes(file);
    else if (entry.name.endsWith(".glsl"))
      includes[`ShaderLibrary/${path.relative(library, file)}`] = readFileSync(file, "utf8");
  }
}
readIncludes(library);
compiler.setIncludeMap(includes);

for (const [name, source] of Object.entries({
  PlantOrganTint: plant,
  SoilMoisture: SOIL_MOISTURE_SHADER,
  ItemRimLight: FARM_ITEM_HIGHLIGHT_SHADER,
  HarvestDissolve: PLANT_HARVEST_SHADER
})) {
  it(`${name} compiles without advertising a generic SSR surface contract`, () => {
    const data = compiler.precompile(
      source.replace(`Farming/${name}`, `Test3156/${name}`),
      ShaderLanguage.GLSLES100,
      "shaders://root/"
    );
    const shader = Shader._createFromPrecompiled(data);
    if (!shader) throw new Error(`${name}: shader creation failed`);
    const stages = shader.subShaders[0].passes.map((pass) => pass.getTagValue("pipelineStage"));
    expect(stages).toEqual(expect.arrayContaining(["Forward", "DepthOnly", "ShadowCaster"]));
    expect(stages).not.toContain("ScreenSpaceReflectionSurface");
    // Capability query requires only these real shader/material data objects; no Engine or GPU is simulated.
    const material = { shader, shaderData: new ShaderData(ShaderDataGroup.Material) } as Material;
    expect(ScreenSpaceReflection.getMaterialReceiverCapability(material)).toMatchObject({
      supported: false,
      unsupportedReason: "missing-screen-space-reflection-surface-pass"
    });
  });
}

it("keeps ordinary PBR reception available as a positive control", () => {
  const material = { shader: Shader.find("PBR"), shaderData: new ShaderData(ShaderDataGroup.Material) } as Material;
  expect(ScreenSpaceReflection.getMaterialReceiverCapability(material).supported).toBe(true);
});
