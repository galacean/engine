import type { SeedWorldSurfaceMaterialIntent } from "./SeedWorldSurfaceIntent";

/** A texture layer authored in world metres; normal detail remains owned by the shared terrain surface. */
export interface SeedWorldSurfaceLayer {
  readonly id: string;
  readonly textureUrl: string;
  readonly tileSize: readonly [number, number];
  readonly tileOffset?: readonly [number, number];
}
/** A POI-owned material influence, with a signed-distance feather outside its core radius. */
export interface SeedWorldSurfacePatch {
  readonly ownerId: string;
  readonly layerId: string;
  readonly center: readonly [number, number];
  readonly radius: number;
  readonly feather: number;
}
/** Whole-map surface composition. Four layers share one global RGBA weight map. */
export interface SeedWorldSurfacePalette {
  readonly layers: readonly SeedWorldSurfaceLayer[];
  readonly seed: number;
  readonly patchSizeMetres: number;
  readonly patches?: readonly SeedWorldSurfacePatch[];
}

/** Compiles continuous world-space mixture weights once; road/soil ownership remains in the original map.
 * @returns Base and palette weights whose combined integer sum is 255 at every sample.
 */
export function compileSeedWorldSurfacePalette(
  palette: SeedWorldSurfacePalette,
  intent: SeedWorldSurfaceMaterialIntent,
  baseWeights: Uint8Array,
  sizeMetres: number,
  origin: readonly [number, number]
): { base: Uint8Array; palette: Uint8Array } {
  if (
    palette.layers.length !== 4 ||
    new Set(palette.layers.map((l) => l.id)).size !== 4 ||
    !Number.isFinite(palette.patchSizeMetres) ||
    palette.patchSizeMetres <= 0
  )
    throw new RangeError("Surface palette requires four distinct layers and a positive patch size");
  const resolution = intent.resolution,
    count = resolution * resolution;
  if (
    !Number.isInteger(resolution) ||
    resolution <= 0 ||
    baseWeights.length !== count * 4 ||
    intent.materialWeights.length !== count * 4 ||
    !Number.isFinite(sizeMetres) ||
    sizeMetres <= 0 ||
    !origin.every(Number.isFinite)
  )
    throw new RangeError("Surface palette requires a complete world-space raster");
  if (
    palette.layers.some(
      (layer) =>
        !layer.textureUrl ||
        layer.tileSize.some((v) => !Number.isFinite(v) || v <= 0) ||
        layer.tileOffset?.some((v) => !Number.isFinite(v))
    )
  )
    throw new RangeError("Surface layers require textures and finite positive tile sizes");
  const base = new Uint8Array(baseWeights),
    weights = new Uint8Array(count * 4);
  const patches = (palette.patches ?? []).map((p) => ({
    ...p,
    index: palette.layers.findIndex((l) => l.id === p.layerId)
  }));
  if (
    patches.some(
      (p) =>
        p.index < 0 ||
        !p.center.every(Number.isFinite) ||
        !Number.isFinite(p.radius) ||
        !Number.isFinite(p.feather) ||
        !(p.radius >= 0) ||
        !(p.feather > 0)
    )
  )
    throw new RangeError("Invalid POI surface material influence");
  const smooth = (x: number) => {
    x = Math.max(0, Math.min(1, x));
    return x * x * (3 - 2 * x);
  };
  const choice = (x: number, z: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ palette.seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 30;
  };
  const mixture = new Float64Array(4);
  for (let z = 0; z < resolution; z++)
    for (let x = 0; x < resolution; x++) {
      const offset = (z * resolution + x) * 4;
      const wx = origin[0] + ((x + 0.5) / resolution) * sizeMetres,
        wz = origin[1] + ((z + 0.5) / resolution) * sizeMetres;
      const gx = wx / palette.patchSizeMetres,
        gz = wz / palette.patchSizeMetres,
        ix = Math.floor(gx),
        iz = Math.floor(gz);
      const tx = smooth(gx - ix),
        tz = smooth(gz - iz);
      mixture.fill(0);
      mixture[choice(ix, iz)] += (1 - tx) * (1 - tz);
      mixture[choice(ix + 1, iz)] += tx * (1 - tz);
      mixture[choice(ix, iz + 1)] += (1 - tx) * tz;
      mixture[choice(ix + 1, iz + 1)] += tx * tz;
      for (const p of patches) {
        const reach = p.radius + p.feather;
        if (Math.abs(wx - p.center[0]) >= reach || Math.abs(wz - p.center[1]) >= reach) continue;
        const distance = Math.hypot(wx - p.center[0], wz - p.center[1]) - p.radius;
        const influence = 1 - smooth(distance / p.feather);
        if (influence <= 0) continue;
        for (let c = 0; c < 4; c++) mixture[c] *= 1 - influence;
        mixture[p.index] += influence;
      }
      // Preserve the original road channel, river bed and independently authored soil.
      const protectedWeight = Math.max(
        intent.materialWeights[offset + 3],
        intent.riverBedCoverage?.[z * resolution + x] ?? 0
      );
      const remaining = 255 - protectedWeight - Math.min(base[offset + 3], 255 - protectedWeight);
      base[offset] = 0;
      base[offset + 1] = 0;
      base[offset + 2] = protectedWeight;
      base[offset + 3] = 255 - protectedWeight - remaining;
      let cumulative = 0,
        previous = 0;
      for (let c = 0; c < 4; c++) {
        cumulative += mixture[c] * remaining;
        const next = c === 3 ? remaining : Math.round(cumulative);
        weights[offset + c] = next - previous;
        previous = next;
      }
    }
  return { base, palette: weights };
}
