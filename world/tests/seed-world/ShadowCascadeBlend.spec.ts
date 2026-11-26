import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ShaderMacroProcessor } from "../../../packages/core/src/shader/ShaderMacroProcessor";

const pbr = JSON.parse(
  fs.readFileSync(new URL("../../../packages/shader/compiledShaders/PBR.shaderc", import.meta.url), "utf8")
);
const terrain = JSON.parse(
  fs.readFileSync(
    new URL("../../../packages/terrain/src/data/seed-world/public/Shader/Terrain.shaderc", import.meta.url),
    "utf8"
  )
);
const vegetation = JSON.parse(
  fs.readFileSync(
    new URL("../../../packages/terrain/src/data/seed-world/public/Shader/Vegetation.shaderc", import.meta.url),
    "utf8"
  )
);

const pbrForward = pbr.subShaders[0].passes.find(
  (pass: { tags?: { pipelineStage?: string } }) => pass.tags?.pipelineStage === "Forward"
);
const terrainForward = terrain.subShaders[0].passes.find((pass: { name: string }) => pass.name === "Forward");
const vegetationForward = vegetation.subShaders[0].passes.find((pass: { name: string }) => pass.name === "Forward");

describe("CSM cascade blend shader override", () => {
  it.each([
    { cascades: "2", webgl2: true },
    { cascades: "2", webgl2: false },
    { cascades: "4", webgl2: true },
    { cascades: "4", webgl2: false }
  ])("enables 15% outer-shell cascade blend in PBR for $cascades cascades (webgl2=$webgl2)", ({ cascades, webgl2 }) => {
    const macros = new Map<string, string>([
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_SHADOW_TYPE", "3"],
      ["SCENE_SHADOW_CASCADED_COUNT", cascades],
      ["RENDERER_IS_RECEIVE_SHADOWS", ""]
    ]);
    if (webgl2) macros.set("GRAPHICS_API_WEBGL2", "");
    const source = ShaderMacroProcessor.evaluate(pbrForward.fragmentShaderInstructions, macros);
    expect(source).toContain("getShadowCascadeBlend");
    expect(source).toContain("0.7225");
    expect(source).toMatch(/smoothstep\s*\(\s*0\.85\s*,\s*1\.0\s*,\s*radiusRatio\s*\)/);
    if (!webgl2) {
      expect(source).not.toContain("scene_ShadowMatrices[min(");
      expect(source).not.toContain("scene_ShadowSplitSpheres[min(");
    }
  });

  it("omits cascade blend completely when SCENE_SHADOW_CASCADED_COUNT is 1", () => {
    const macros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_SHADOW_TYPE", "3"],
      ["SCENE_SHADOW_CASCADED_COUNT", "1"],
      ["RENDERER_IS_RECEIVE_SHADOWS", ""]
    ]);
    expect(ShaderMacroProcessor.evaluate(pbrForward.fragmentShaderInstructions, macros)).not.toContain(
      "getShadowCascadeBlend"
    );
    macros.set("MATERIAL_TERRAIN_LAYERS", "");
    expect(ShaderMacroProcessor.evaluate(terrainForward.fragmentShaderInstructions, macros)).not.toContain(
      "getShadowCascadeBlend"
    );
  });

  it("applies the shared cascade blend in Terrain ground PCF and Vegetation forward passes", () => {
    const terrainMacros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_SHADOW_TYPE", "3"],
      ["SCENE_SHADOW_CASCADED_COUNT", "2"],
      ["RENDERER_IS_RECEIVE_SHADOWS", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""]
    ]);
    const terrainSource = ShaderMacroProcessor.evaluate(terrainForward.fragmentShaderInstructions, terrainMacros);
    expect(terrainSource).toContain("sampleTerrainProjectGroundShadowMap");
    expect(terrainSource).toContain("sampleTerrainProjectGroundShadowCascade");
    expect(terrainSource).toContain("getShadowCascadeBlend");

    const vegetationMacros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_SHADOW_TYPE", "3"],
      ["SCENE_SHADOW_CASCADED_COUNT", "2"],
      ["RENDERER_IS_RECEIVE_SHADOWS", ""]
    ]);
    const vegetationSource = ShaderMacroProcessor.evaluate(
      vegetationForward.fragmentShaderInstructions,
      vegetationMacros
    );
    expect(vegetationSource).toContain("getShadowCascadeBlend");
  });
});
