import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ShaderMacroProcessor } from "../../../packages/core/src/shader/ShaderMacroProcessor";

const terrain = JSON.parse(
  fs.readFileSync(
    new URL("../../../packages/terrain/src/data/seed-world/public/Shader/Terrain.shaderc", import.meta.url),
    "utf8"
  )
);
const forward = terrain.subShaders[0].passes.find((pass) => pass.name === "Forward");
const grass = JSON.parse(
  fs.readFileSync(
    new URL("../../../packages/terrain/src/data/seed-world/public/Shader/Grass.shaderc", import.meta.url),
    "utf8"
  )
);
const grassForward = grass.subShaders[0].passes.find((pass) => pass.name === "Forward");

describe("Terrain near/far production shader variants", () => {
  it("keeps per-pixel baked slopes on distant sand without sampling the micro normal", () => {
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["SCENE_FOG_MODE", "1"],
      ["MATERIAL_TERRAIN_LAYERS", ""],
      ["MATERIAL_TERRAIN_SAND_RIPPLE", ""],
      ["MATERIAL_TERRAIN_MICRO_NORMAL", ""],
      ["MATERIAL_TERRAIN_FAR", ""]
    ]);
    const farSand = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, macros);
    expect(farSand).toMatch(/bakedNormal\s*=\s*terrainProjectGeometryNormalAt\s*\(\s*worldXZ/);
    expect(farSand).not.toContain("material_TerrainMicroNormal");
    expect(farSand).not.toContain("material_TerrainSandRippleParams");
  });
  it("restricts sand glints to the near sunlit forward variant with sand micro detail", () => {
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"]
    ]);
    const source = () => ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, macros);
    expect(source()).not.toContain("material_TerrainSandGlintStrength");
    macros.set("MATERIAL_TERRAIN_MICRO_NORMAL", "");
    const microNormalSamples = /textureGrad\s*\(\s*material_TerrainMicroNormal\b/g;
    expect(source().match(microNormalSamples)).toHaveLength(1);
    macros.set("MATERIAL_TERRAIN_SAND_GLINTS", "");
    expect(source()).toContain("material_TerrainSandGlintStrength");
    expect(source()).toContain("material_TerrainSandGlintRoughness");
    expect(source().match(microNormalSamples)).toHaveLength(1);
    for (const pass of terrain.subShaders[0].passes.filter((pass) => pass.name !== "Forward")) {
      expect(ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros)).not.toContain(
        "material_TerrainSandGlintStrength"
      );
    }
    macros.delete("MATERIAL_TERRAIN_MICRO_NORMAL");
    expect(source()).not.toContain("material_TerrainSandGlintStrength");
    macros.set("MATERIAL_TERRAIN_MICRO_NORMAL", "");
    macros.set("MATERIAL_TERRAIN_FAR", "");
    expect(source()).not.toContain("material_TerrainSandGlintStrength");
  });

  it.each(["Forward", "SSRReceiver"])(
    "uses the same opt-in puddle edge in %s",
    (name) => {
      const pass = terrain.subShaders[0].passes.find((entry) => entry.name === name);
      const macros = new Map([["GRAPHICS_API_WEBGL2", ""], ["MATERIAL_TERRAIN_LAYERS", ""]]);
      const native = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
      macros.set("MATERIAL_TERRAIN_FEATHERED_PUDDLES", "");
      const feathered = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
      expect(native).toContain("return step ( 0.5 , standingWaterShare )");
      expect(feathered).toContain("float shorelineWidth = 0.09");
      expect(feathered).toContain("return clamp ( standingWaterShare , 0.0 , 1.0 )");
      expect(feathered).not.toContain("return step ( 0.5 , standingWaterShare )");
    }
  );

  it.each(["Forward", "SSRReceiver"])("binds the textured single alphamap in %s", (name) => {
    const pass = terrain.subShaders[0].passes.find((entry) => entry.name === name);
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""],
      ["MATERIAL_TERRAIN_SINGLE_ALPHAMAP", ""],
      ["MATERIAL_TERRAIN_LAYER_DIFFUSE_TEXTURES", ""],
      ["MATERIAL_TERRAIN_LAYER_NORMAL_TEXTURES", ""]
    ]);
    const source = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
    expect(source).toMatch(/uniform vec4 material_TerrainFirstLayerIndices\s*;/);
    expect(source).toMatch(/vec4 layerIndices\s*=\s*material_TerrainFirstLayerIndices\s*;/);
  });

  it("skips diffuse ground color and moisture evaluation in Terrain SSRReceiver", () => {
    const pass = terrain.subShaders[0].passes.find((entry) => entry.name === "SSRReceiver");
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""],
      ["MATERIAL_TERRAIN_GRASS_SHADING", ""]
    ]);
    const source = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
    expect(source).toContain("evaluateTerrainLayerWaterFilm");
    expect(source).toContain("evaluateTerrainFallbackWaterFilm");
    expect(source).not.toContain("evaluateTerrainLayerSurface");
    expect(source).not.toContain("terrainProjectGroundColor");
  });

  it("keeps far-terrain SSRReceiver discard conditional so ANGLE/Adreno retains the struct return", () => {
    const pass = terrain.subShaders[0].passes.find((entry) => entry.name === "SSRReceiver");
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""],
      ["MATERIAL_TERRAIN_FAR", ""]
    ]);
    const source = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
    const fnMatch = source.match(
      /TerrainProjectSSRReceiverOutput\s+TerrainSSRReceiverFragment\s*\([\s\S]*?\)\s*\{([\s\S]*)\}/
    );
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![1];
    expect(body).toMatch(/if\s*\(\s*!\s*\(\s*varyings\.terrainValid\s*>\s*2\.0\s*\)\s*\)\s*\{\s*discard\s*;\s*\}/);
    expect(body).toMatch(/return\s+output_\s*;/);
    expect(body).not.toContain("evaluateTerrainLayerWaterFilm");
  });

  it.each(["untextured", "soil", "multiple-regions"])(
    "preserves layer data and removes distant detail samplers (%s)",
    (layout) => {
      const macros = new Map([
        ["GRAPHICS_API_WEBGL2", ""],
        ["SCENE_FOG_MODE", "1"],
        ["MATERIAL_TERRAIN_LAYERS", ""],
        ["MATERIAL_TERRAIN_GRASS_SHADING", ""]
      ]);
      if (layout !== "multiple-regions") {
        macros.set("MATERIAL_TERRAIN_SINGLE_REGION", "");
        macros.set("MATERIAL_TERRAIN_SINGLE_ALPHAMAP", "");
        macros.set(
          layout === "soil" ? "MATERIAL_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP" : "MATERIAL_TERRAIN_UNTEXTURED_SINGLE_MAP",
          ""
        );
      }
      if (layout === "soil") {
        macros.set("MATERIAL_TERRAIN_LAYER_SINGLE_DIFFUSE", "");
        macros.set("MATERIAL_TERRAIN_LAYER_DIFFUSE_TEXTURES", "");
      }
      macros.set("MATERIAL_TERRAIN_DETAIL_TRANSITION", "");
      const near = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, macros);
      macros.delete("MATERIAL_TERRAIN_DETAIL_TRANSITION");
      macros.set("MATERIAL_TERRAIN_FAR", "");
      const far = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, macros);
      for (const sampler of [
        "material_TerrainPuddleAtlas",
        "scene_SurfaceRippleNormalAtlas",
        "scene_SurfaceWaterNormal",
        "camera_SurfaceReliefBakedNormal"
      ]) {
        expect(near).toContain(sampler);
        expect(far).not.toContain(sampler);
      }
      for (const shader of [near, far]) {
        expect(shader).toContain("terrainProjectResolveLayerGroups");
        expect(shader).toContain("terrainProjectEvaluateLayerGroup");
        expect(shader).toContain("terrainProjectGroundColor");
        expect(shader).toContain("layerBlend.snowResponse");
        expect(shader).toContain("scene_SurfaceSnowColor");
        expect(shader).not.toContain("terrainProjectEvaluateSeedFixedLayerBlend");
        if (layout === "soil") expect(shader).toContain("material_TerrainLayerSingleDiffuse");
      }
      expect(near).toContain("material_TerrainFarLod");
      expect(far).not.toContain("material_TerrainFarLod");
      // Distant wet sheen must reuse the substrate lighting, not restore a second water lobe.
      expect(far).toContain("terrainProjectApplyFarWetSheen");
      expect(far).not.toContain("terrainProjectApplyWaterFilmLighting");
      expect(far).not.toContain("terrainProjectEvaluateSurfaceWaterFilm");
      expect(near).toContain("1.0 - detailVisibility");
    }
  );

  it("keeps ground shadow PCF for near ground and skips far and pick variants", () => {
    const baseMacros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_SHADOW_TYPE", "3"],
      ["SCENE_SHADOW_CASCADED_COUNT", "2"],
      ["RENDERER_IS_RECEIVE_SHADOWS", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""]
    ]);
    const near = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, baseMacros);
    expect(near).toContain("sampleTerrainProjectGroundShadowMap");
    expect(near).toContain("terrainProjectGroundShadowGradient");

    const farMacros = new Map(baseMacros);
    farMacros.set("MATERIAL_TERRAIN_FAR", "");
    const far = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, farMacros);
    expect(far).not.toContain("sampleTerrainProjectGroundShadowMap");
    expect(far).not.toContain("terrainProjectGroundShadowGradient");
    expect(far).toContain("sampleTerrainProjectShadow");

    const pickMacros = new Map(baseMacros);
    pickMacros.set("RENDERER_WORLD_PICK", "");
    const pick = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, pickMacros);
    expect(pick).not.toContain("sampleTerrainProjectGroundShadowMap");
    expect(pick).not.toContain("terrainProjectGroundShadowGradient");

    const grassMacros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_SHADOW_TYPE", "3"],
      ["SCENE_SHADOW_CASCADED_COUNT", "2"],
      ["RENDERER_IS_RECEIVE_SHADOWS", ""]
    ]);
    const grassDefault = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, grassMacros);
    expect(grassDefault).not.toContain("sampleTerrainProjectGroundShadowMap");

    grassMacros.set("MATERIAL_FARM_GROUND_SURFACE", "");
    const grassGround = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, grassMacros);
    expect(grassGround).toContain("sampleTerrainProjectGroundShadowMap");
    expect(grassGround).toContain("terrainProjectGroundShadowGradient");

    grassMacros.set("RENDERER_WORLD_PICK", "");
    const grassGroundPick = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, grassMacros);
    expect(grassGroundPick).not.toContain("sampleTerrainProjectGroundShadowMap");
  });

  it("keeps the precompiled grass pick ID controlled by the draw's instancing flag", () => {
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["RENDERER_SEED_WORLD_DETAIL_COMPACT", ""],
      ["RENDERER_WORLD_PICK", ""]
    ]);
    const source = ShaderMacroProcessor.evaluate(grassForward.vertexShaderInstructions, macros);
    expect(source).toContain("uniform float renderer_WorldPickInstanced;");
    expect(source).toMatch(/gl_InstanceID\s*\)\s*\*\s*renderer_WorldPickInstanced/);
  });

  it("early-outs culled grass instances in vertex and preserves full climate wind normal for rain/snow", () => {
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["RENDERER_SEED_WORLD_DETAIL_COMPACT", ""],
      ["RENDERER_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP", ""]
    ]);
    const vs = ShaderMacroProcessor.evaluate(grassForward.vertexShaderInstructions, macros);
    expect(vs).toContain("grassCulledVaryings");
    expect(vs).toContain("terrainProjectGroundWindDirectionalNormal");
    expect(vs).toContain("terrainProjectGroundWindCarrierNormal");
    expect(vs).toContain("scene_SurfaceClimate");

    const fs = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, macros);
    expect(fs).toContain("terrainProjectApplySurfaceClimate");
    expect(fs).toContain("evaluateTerrainProjectLightingWithShadow");
  });
});
