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

describe("Terrain near/far production shader variants", () => {
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
});
