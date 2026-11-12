import type { ShaderData } from "@galacean/engine";

/** Borrow the complete terrain appearance binding; textures retain their terrain owner.
 * Rebind on residency or palette publication. No first-region or fixed-channel assumptions.
 */
export function bindTerrainGroundSurface(
  target: ShaderData,
  prefix: "renderer" | "material",
  source: ShaderData
): void {
  for (const name of [
    "LayerSingleDiffuse",
    "AlphamapAtlas",
    "AlphamapMetadata",
    "LayerMetadata",
    "LayerDiffuseTextures",
    "LayerNormalTextures",
    "LayerMaskTextures",
    "MacroVariationTexture"
  ]) {
    const value = source.getTexture(`material_Terrain${name}`);
    target.setTexture(`${prefix}_Terrain${name}`, value ?? null!);
  }
  for (const name of ["AlphamapCount", "LayerCount", "DetilingLayerMask", "RegionCount", "MacroVariationEnabled"]) {
    const value = source.getInt(`material_Terrain${name}`);
    if (value !== undefined) target.setInt(`${prefix}_Terrain${name}`, value);
  }
  for (const name of ["RegionWorldBounds", "RegionAlphamapRanges", "SimpleColors", "SimpleSurfaces"]) {
    const value = source.getFloatArray(`material_Terrain${name}`);
    if (value !== undefined) target.setFloatArray(`${prefix}_Terrain${name}`, value);
  }
  for (const name of ["AlphamapAtlasInvSize", "MacroOffset"]) {
    const value = source.getVector2(`material_Terrain${name}`);
    if (value !== undefined) target.setVector2(`${prefix}_Terrain${name}`, value);
  }
  for (const name of ["MacroColorA", "MacroColorB"]) {
    const value = source.getVector3(`material_Terrain${name}`);
    if (value !== undefined) target.setVector3(`${prefix}_Terrain${name}`, value);
  }
  for (const name of [
    "FirstAlphamapRect",
    "FirstLayerIndices",
    "SimpleTextureChannels",
    "SimpleTextureTransform",
    "SimpleTextureMin",
    "SimpleTextureMax"
  ]) {
    const value = source.getVector4(`material_Terrain${name}`);
    if (value !== undefined) target.setVector4(`${prefix}_Terrain${name}`, value);
  }
  for (const name of ["RoadColor"]) {
    const value = source.getColor(`material_Terrain${name}`);
    if (value !== undefined) target.setColor(`${prefix}_Terrain${name}`, value);
  }
  for (const name of ["MacroAngle", "MacroScaleA", "MacroScaleB"]) {
    const value = source.getFloat(`material_Terrain${name}`);
    if (value !== undefined) target.setFloat(`${prefix}_Terrain${name}`, value);
  }
  const enabled = new Set(source.getMacros().map((macro) => macro.name));
  for (const name of [
    "LAYER_SINGLE_DIFFUSE",
    "SINGLE_DIFFUSE_SINGLE_MAP",
    "LAYERS",
    "SINGLE_REGION",
    "SINGLE_ALPHAMAP",
    "UNTEXTURED_SINGLE_MAP",
    "LAYER_DIFFUSE_TEXTURES",
    "LAYER_NORMAL_TEXTURES",
    "LAYER_MASK_TEXTURES",
    "ROAD_PALETTE",
    "LAYER_PALETTE",
    "GRASS_SHADING"
  ]) {
    const macro = `${prefix.toUpperCase()}_TERRAIN_${name}`;
    if (enabled.has(`MATERIAL_TERRAIN_${name}`)) target.enableMacro(macro);
    else target.disableMacro(macro);
  }
}
