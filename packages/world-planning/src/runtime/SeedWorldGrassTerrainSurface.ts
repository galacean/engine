import { type Material, type MeshRenderer, type ShaderData } from "@galacean/engine";
import { bindTerrainGroundSurface } from "@galacean/engine-terrain/terrain/clipmap/TerrainGroundBinding";
import type { TerrainLayerAlphamapSource } from "@galacean/engine-terrain/terrain/clipmap/TerrainLayerResidency";
import { seedWorldGrassCoverageScale } from "./SeedWorldGrassAppearance.ts";

/** Continuous coverage, optionally accompanied by a conservative region query. */
export interface SeedWorldGrassCoverageSampler {
  (worldX: number, worldZ: number): number;
  /** Samples remain stable until a new surface is published. */
  stableWorldSamples?: boolean;
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
  const count = width * height;
  // Retain only channel 0 (grass) so the temporary 4-channel RGBA projection can be collected after GPU upload.
  const grass = new Uint8Array(count);
  const occupiedBits = new Uint32Array((count + 31) >>> 5);
  for (let i = 0; i < count; i++) {
    const value = source.weights[i * 4]!;
    grass[i] = value;
    if (seedWorldGrassCoverageScale(value / 255) > 0) occupiedBits[i >>> 5] |= 1 << (i & 31);
  }
  const at = (x: number, z: number) => grass[z * width + x]!;
  // Coarse 8x8 block prefix sum for O(1) accept/reject paired with the exact 1-bit occupancy mask (~193 KiB at 1024²).
  const coarseW = (width + 7) >> 3;
  const coarseH = (height + 7) >> 3;
  const coarseStride = coarseW + 1;
  const coarseOccupied = new Uint32Array(coarseStride * (coarseH + 1));
  for (let bz = 0; bz < coarseH; bz++) {
    const zStart = bz << 3;
    const zEnd = Math.min(height, zStart + 8);
    let rowSum = 0;
    for (let bx = 0; bx < coarseW; bx++) {
      const xStart = bx << 3;
      const xEnd = Math.min(width, xStart + 8);
      if (hasAnyOccupiedBit(occupiedBits, width, xStart, zStart, xEnd, zEnd)) rowSum++;
      coarseOccupied[(bz + 1) * coarseStride + bx + 1] = coarseOccupied[bz * coarseStride + bx + 1]! + rowSum;
    }
  }
  const coarseSum = (bx0: number, bz0: number, bx1: number, bz1: number) =>
    coarseOccupied[bz1 * coarseStride + bx1]! -
    coarseOccupied[bz0 * coarseStride + bx1]! -
    coarseOccupied[bz1 * coarseStride + bx0]! +
    coarseOccupied[bz0 * coarseStride + bx0]!;
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
  sample.stableWorldSamples = true;
  sample.hasGrassInArea = (minimumX, minimumZ, maximumX, maximumZ) => {
    // Include all four contributors to bilinear interpolation, not just pixel centres inside the area.
    const x0 = Math.floor(Math.max(0, Math.min(width - 1, ((minimumX - originX) / sizeX) * (width - 1))));
    const z0 = Math.floor(Math.max(0, Math.min(height - 1, ((minimumZ - originZ) / sizeZ) * (height - 1))));
    const x1 = Math.ceil(Math.max(0, Math.min(width - 1, ((maximumX - originX) / sizeX) * (width - 1)))) + 1;
    const z1 = Math.ceil(Math.max(0, Math.min(height - 1, ((maximumZ - originZ) / sizeZ) * (height - 1)))) + 1;
    if (x0 >= x1 || z0 >= z1) return false;
    const obx0 = x0 >> 3;
    const obz0 = z0 >> 3;
    const obx1 = ((x1 - 1) >> 3) + 1;
    const obz1 = ((z1 - 1) >> 3) + 1;
    if (coarseSum(obx0, obz0, obx1, obz1) === 0) return false;
    const ibx0 = (x0 + 7) >> 3;
    const ibz0 = (z0 + 7) >> 3;
    const ibx1 = x1 >> 3;
    const ibz1 = z1 >> 3;
    if (ibx0 < ibx1 && ibz0 < ibz1 && coarseSum(ibx0, ibz0, ibx1, ibz1) > 0) return true;
    return hasAnyOccupiedBit(occupiedBits, width, x0, z0, x1, z1);
  };
  return sample;
}

function hasAnyOccupiedBit(bits: Uint32Array, stride: number, x0: number, z0: number, x1: number, z1: number): boolean {
  for (let z = z0; z < z1; z++) {
    const rowBase = z * stride;
    const startBit = rowBase + x0;
    const endBit = rowBase + x1;
    let word = startBit >>> 5;
    const lastWord = (endBit - 1) >>> 5;
    const loMask = -1 << (startBit & 31);
    const hiRem = endBit & 31;
    const hiMask = hiRem === 0 ? -1 : -1 >>> (32 - hiRem);
    if (word === lastWord) {
      if ((bits[word]! & loMask & hiMask) !== 0) return true;
    } else {
      if ((bits[word]! & loMask) !== 0) return true;
      for (word++; word < lastWord; word++) {
        if (bits[word]! !== 0) return true;
      }
      if ((bits[lastWord]! & hiMask) !== 0) return true;
    }
  }
  return false;
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
