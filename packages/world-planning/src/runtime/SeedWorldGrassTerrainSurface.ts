import { type Material, type MeshRenderer, type ShaderData } from "@galacean/engine";
import { bindTerrainGroundSurface } from "@galacean/engine-terrain/terrain/clipmap/TerrainGroundBinding";
import type { TerrainLayerAlphamapSource } from "@galacean/engine-terrain/terrain/clipmap/TerrainLayerResidency";
import { seedWorldGrassCoverageScale } from "./SeedWorldGrassAppearance.ts";

/** Continuous coverage, optionally accompanied by a conservative region query. */
export interface SeedWorldGrassCoverageSampler {
  (worldX: number, worldZ: number): number;
  /** False guarantees every clump in the rectangle has zero size, including interpolated edges. */
  hasGrassInArea?(minimumX: number, minimumZ: number, maximumX: number, maximumZ: number): boolean;
}

/** Sample an immutable published alphamap, including river-bed attenuation. Recreate after surface edits. */
export function createSeedWorldGrassCoverageSampler(
  source: TerrainLayerAlphamapSource,
  bounds: readonly [number, number, number, number]
): SeedWorldGrassCoverageSampler {
  const [width, height] = source.sampleSize,
    [originX, originZ, sizeX, sizeZ] = bounds;
  if (
    width < 2 ||
    height < 2 ||
    source.weights.length !== width * height * 4 ||
    !bounds.every(Number.isFinite) ||
    sizeX <= 0 ||
    sizeZ <= 0
  )
    throw new RangeError("Grass coverage requires a complete native alphamap and finite world bounds");
  const at = (x: number, z: number) => source.weights[(z * width + x) * 4];
  // One scan per published surface, rather than a scan of dense candidates on every Cell admission.
  // The summed-area table answers empty-region queries in constant time (4 MiB at 1024²).
  const stride = width + 1,
    occupied = new Uint32Array(stride * (height + 1));
  for (let z = 0; z < height; z++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += Number(seedWorldGrassCoverageScale(at(x, z) / 255) > 0);
      occupied[(z + 1) * stride + x + 1] = occupied[z * stride + x + 1] + row;
    }
  }
  const sample: SeedWorldGrassCoverageSampler = (worldX, worldZ) => {
    const x = Math.max(0, Math.min(width - 1, ((worldX - originX) / sizeX) * (width - 1)));
    const z = Math.max(0, Math.min(height - 1, ((worldZ - originZ) / sizeZ) * (height - 1)));
    const x0 = Math.floor(x),
      z0 = Math.floor(z);
    const x1 = Math.min(width - 1, x0 + 1),
      z1 = Math.min(height - 1, z0 + 1);
    const tx = x - x0,
      tz = z - z0;
    return (
      ((at(x0, z0) * (1 - tx) + at(x1, z0) * tx) * (1 - tz) + (at(x0, z1) * (1 - tx) + at(x1, z1) * tx) * tz) / 255
    );
  };
  sample.hasGrassInArea = (minimumX, minimumZ, maximumX, maximumZ) => {
    // Include all four contributors to bilinear interpolation, not just pixel centres inside the area.
    const x0 = Math.floor(Math.max(0, Math.min(width - 1, ((minimumX - originX) / sizeX) * (width - 1))));
    const z0 = Math.floor(Math.max(0, Math.min(height - 1, ((minimumZ - originZ) / sizeZ) * (height - 1))));
    const x1 = Math.ceil(Math.max(0, Math.min(width - 1, ((maximumX - originX) / sizeX) * (width - 1)))) + 1;
    const z1 = Math.ceil(Math.max(0, Math.min(height - 1, ((maximumZ - originZ) / sizeZ) * (height - 1)))) + 1;
    return (
      occupied[z1 * stride + x1] -
        occupied[z0 * stride + x1] -
        occupied[z1 * stride + x0] +
        occupied[z0 * stride + x0] >
      0
    );
  };
  return sample;
}

/**
 * Binds the current Terrain's final alphamap and palette to terrestrial grass.
 * Textures remain Terrain-owned; palette changes rebind both resident and future batches.
 * @param renderer Ground grass renderer, excluding grass attached to rock surfaces.
 * @param terrainMaterial Authoritative near Terrain material of the same world.
 */
export function bindSeedWorldGrassTerrainSurface(renderer: MeshRenderer, terrainMaterial: Material): void {
  bindGrassTerrainSurface(renderer.shaderData, "renderer", terrainMaterial);
}

/** Borrows the same Terrain surface for shared alpha-card grass materials. Terrain retains texture ownership. */
export function bindSeedWorldGrassTerrainMaterial(material: Material, terrainMaterial: Material): void {
  bindGrassTerrainSurface(material.shaderData, "material", terrainMaterial);
  const source = terrainMaterial.shaderData,
    target = material.shaderData;
  // Contact shading borrows the authoritative height/normal field; no extra texture allocation.
  const height = source.getTexture("material_TerrainHeightAtlas");
  if (height) {
    target.enableMacro("MATERIAL_TERRAIN_HEIGHT_FIELD");
    target.setTexture("material_TerrainHeightAtlas", height);
    target.setTexture("material_TerrainNormalAtlas", source.getTexture("material_TerrainNormalAtlas"));
    target.setVector2("material_TerrainHeightAtlasInvSize", source.getVector2("material_TerrainHeightAtlasInvSize"));
    target.setFloatArray("material_TerrainRegionAtlasRects", source.getFloatArray("material_TerrainRegionAtlasRects"));
    target.setFloatArray(
      "material_TerrainRegionHeightDecode",
      source.getFloatArray("material_TerrainRegionHeightDecode")
    );
  } else target.disableMacro("MATERIAL_TERRAIN_HEIGHT_FIELD");
  target.setTexture("material_GrassTerrainNormalAtlas", source.getTexture("material_TerrainNormalAtlas"));
  target.setVector2("material_GrassTerrainNormalAtlasInvSize", source.getVector2("material_TerrainHeightAtlasInvSize"));
  target.setFloatArray("material_GrassTerrainNormalRects", source.getFloatArray("material_TerrainRegionAtlasRects"));
}

function bindGrassTerrainSurface(target: ShaderData, prefix: "material" | "renderer", terrainMaterial: Material): void {
  bindTerrainGroundSurface(target, prefix, terrainMaterial.shaderData);
}
