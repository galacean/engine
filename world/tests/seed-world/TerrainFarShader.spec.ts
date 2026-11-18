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
  it.each(["Forward", "ScreenSpaceReflectionSurface"])(
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

  it.each(["Forward", "ScreenSpaceReflectionSurface"])("binds the textured single alphamap in %s", (name) => {
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
});
