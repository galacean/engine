import { builtinWaterTextureDescriptor } from "./WaterBuiltinTextureIdentity";
import type { WaterMaterialProfile } from "./WaterMaterialFile";

/** Frozen from the native preset .mat texture slots before removing author texture support. */
export const WATER_BUILTIN_MATERIAL_TEXTURE_PATHS = {
  lake: {
    material_Water_appearance_appearance_detailLayers_0_texture: "Water/Textures/grasslands-water-normal-1024.ktx2",
    material_Water_appearance_appearance_detailLayers_1_texture: "Water/Textures/grasslands-water-normal-1024.ktx2"
  },
  river: {
    material_Water_appearance_appearance_detailLayers_0_texture: "Water/Textures/farmlands-wave-large-normal.ktx2",
    material_Water_appearance_appearance_detailLayers_1_texture: "Water/Textures/farmlands-wave-large-normal.ktx2",
    material_Water_appearance_appearance_caustics_texture: "Water/Textures/farmlands-caustics-color.ktx2"
  },
  ocean: {
    material_Ocean_smoothWaves: "Water/Textures/ocean-smoothWaves.ktx2",
    material_Ocean_roughWaves: "Water/Textures/ocean-roughWaves.ktx2",
    material_Ocean_caustics: "Water/Textures/ocean-caustics.ktx2",
    material_Ocean_foam: "Water/Textures/ocean-foam.ktx2",
    material_Ocean_intersectionNoise: "Water/Textures/ocean-intersectionNoise.ktx2"
  },
  "river-drops": {
    material_Water_look_riverDrops_textures_directional: "Water/Textures/farmlands-drop-directional.ktx2",
    material_Water_look_riverDrops_textures_cloud: "Water/Textures/farmlands-drop-cloud.ktx2",
    material_Water_look_riverDrops_textures_lines: "Water/Textures/farmlands-drop-lines.ktx2",
    material_Water_look_riverDrops_textures_edge: "Water/Textures/farmlands-drop-edge.ktx2",
    material_Water_look_riverDrops_textures_voronoi: "Water/Textures/farmlands-drop-voronoi.ktx2",
    material_Water_look_riverDrops_textures_foam: "Water/Textures/farmlands-drop-foam.ktx2",
    material_Water_look_riverDrops_textures_mist: "Water/Textures/farmlands-drop-mist.ktx2",
    material_Water_look_riverDrops_textures_splash: "Water/Textures/farmlands-drop-splash.ktx2",
    material_Water_appearance_appearance_detailLayers_0_texture: "Water/Textures/farmlands-wave-large-normal.ktx2",
    material_Water_appearance_appearance_detailLayers_1_texture: "Water/Textures/farmlands-wave-large-normal.ktx2",
    material_Water_appearance_appearance_caustics_texture: "Water/Textures/farmlands-caustics-color.ktx2"
  }
} as const;

export function waterBuiltinMaterialTextures(profile: WaterMaterialProfile, drops = false) {
  const paths = WATER_BUILTIN_MATERIAL_TEXTURE_PATHS[drops && profile === "river" ? "river-drops" : profile];
  return Object.entries(paths).map(([slot, path]) => ({ slot, path, descriptor: builtinWaterTextureDescriptor(path) }));
}
