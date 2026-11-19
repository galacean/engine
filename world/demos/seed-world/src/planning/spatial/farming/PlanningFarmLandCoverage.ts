import type { FarmSnapshot, FarmingStorageDefinitions, GroundBounds } from "@galacean/engine-farming/farming/api/index";
import { DEFAULT_SOIL_VISUAL_CONFIG } from "@galacean/engine-farming/farming/presentation/soil/SoilVisualConfig";
import { cellBounds, containerBounds } from "@galacean/engine-farming/farming/storage/StoragePlacement";
import { surfaceTransitionWeight } from "@galacean/engine-world-planning/geometry/surfaceTransitionWeight";

export const FARM_LAND_MARGIN_M = 2;
export const FARM_LAND_MASK_SPACING_M = 0.1;
export const FARM_LAND_CONTAINER_EDGE_M = 0.35;
/** Exceeds one 65x65 soil coverage texel (~0.02 m on 1.25 m plots) so bilinear filtering stays strictly opaque. */
export const FARM_LAND_SOIL_CUTOUT_SAFETY_M = 0.025;

/** Only worked plots create dirt. Containers explicitly reserve grass, even inside a neighbour's transition. */
export function planningFarmLandFootprint(snapshot: FarmSnapshot, definitions: FarmingStorageDefinitions) {
  return {
    plots: snapshot.plots.map((plot) => cellBounds(snapshot.grid, plot)),
    opaquePlots: snapshot.plots
      .filter((plot) => plot.ground.availability === "available" && plot.soil.preparation === "leveled")
      .map((plot) => cellBounds(snapshot.grid, plot)),
    grass: snapshot.storage.containers.map((container) => {
      const type = definitions.containers.find((type) => type.id === container.typeId);
      if (!type) throw new Error(`Unknown occupied container type ${container.typeId}`);
      return containerBounds(container, type);
    })
  };
}

/** Only plots and the operation lane clear the grass carpet; storage containers retain surrounding grass. */
export function planningFarmVegetationBounds(snapshot: FarmSnapshot, operationBounds?: GroundBounds): GroundBounds[] {
  return [
    ...(operationBounds ? [operationBounds] : []),
    ...snapshot.plots.map((plot) => cellBounds(snapshot.grid, plot))
  ];
}

export function planningFarmLandBounds(occupied: readonly GroundBounds[]): GroundBounds[] {
  return occupied.map((bounds) => ({
    minimumX: bounds.minimumX - FARM_LAND_MARGIN_M,
    minimumZ: bounds.minimumZ - FARM_LAND_MARGIN_M,
    maximumX: bounds.maximumX + FARM_LAND_MARGIN_M,
    maximumZ: bounds.maximumZ + FARM_LAND_MARGIN_M
  }));
}

/** Exterior Euclidean distance to the union: shared/internal edges cannot create seams, convex corners are round. */
export function farmLandDistance(bounds: readonly GroundBounds[], x: number, z: number): number {
  let distance = Infinity;
  for (const b of bounds) {
    const dx = Math.max(b.minimumX - x, 0, x - b.maximumX);
    const dz = Math.max(b.minimumZ - z, 0, z - b.maximumZ);
    distance = Math.min(distance, Math.hypot(dx, dz));
    if (distance === 0) return 0;
  }
  return distance;
}

/** The same quintic distance response as river sand, across the configured outer band. */
export function farmLandCoverage(
  bounds: readonly GroundBounds[],
  x: number,
  z: number,
  grass: readonly GroundBounds[] = []
): number {
  return (
    surfaceTransitionWeight(farmLandDistance(bounds, x, z), 0, FARM_LAND_MARGIN_M) *
    // One texel of zero coverage protects the exact footprint even after bilinear sampling.
    (1 - surfaceTransitionWeight(farmLandDistance(grass, x, z), FARM_LAND_MASK_SPACING_M, FARM_LAND_CONTAINER_EDGE_M))
  );
}

/** True iff every point of [x0, x1] x [z0, z1] lies inside the union of axis-aligned rectangles. */
function isRectCoveredByUnion(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  rects: readonly GroundBounds[]
): boolean {
  let overlapCount = 0;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.minimumX <= x0 && r.maximumX >= x1 && r.minimumZ <= z0 && r.maximumZ >= z1) return true;
    if (r.maximumX > x0 && r.minimumX < x1 && r.maximumZ > z0 && r.minimumZ < z1) overlapCount++;
  }
  if (overlapCount <= 1) return false;
  const xs = [x0, x1];
  const zs = [z0, z1];
  const overlaps: GroundBounds[] = [];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.maximumX <= x0 || r.minimumX >= x1 || r.maximumZ <= z0 || r.minimumZ >= z1) continue;
    overlaps.push(r);
    if (r.minimumX > x0 && r.minimumX < x1) xs.push(r.minimumX);
    if (r.maximumX > x0 && r.maximumX < x1) xs.push(r.maximumX);
    if (r.minimumZ > z0 && r.minimumZ < z1) zs.push(r.minimumZ);
    if (r.maximumZ > z0 && r.maximumZ < z1) zs.push(r.maximumZ);
  }
  xs.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);
  for (let iz = 0; iz < zs.length - 1; iz++) {
    if (zs[iz + 1] - zs[iz] <= 1e-9) continue;
    const mz = (zs[iz] + zs[iz + 1]) * 0.5;
    for (let ix = 0; ix < xs.length - 1; ix++) {
      if (xs[ix + 1] - xs[ix] <= 1e-9) continue;
      const mx = (xs[ix] + xs[ix + 1]) * 0.5;
      let covered = false;
      for (let k = 0; k < overlaps.length; k++) {
        const r = overlaps[k];
        if (mx >= r.minimumX && mx <= r.maximumX && mz >= r.minimumZ && mz <= r.maximumZ) {
          covered = true;
          break;
        }
      }
      if (!covered) return false;
    }
  }
  return true;
}

/** Vertex-centred local R8 field plus conservative committed-soil interior cutout. Both neighbours sample identical world coordinates at a chunk seam. */
export function bakeFarmLandCoverage(
  chunk: FarmLandChunk,
  size: number,
  grass: readonly GroundBounds[],
  opaquePlots: readonly GroundBounds[] = []
) {
  const resolution = Math.ceil(size / FARM_LAND_MASK_SPACING_M) + 1;
  const pixels = new Uint8Array(resolution * resolution);
  const dirtDistances = rasterDistances(chunk.bounds, FARM_LAND_MARGIN_M);
  const grassDistances = grass.length ? rasterDistances(grass, FARM_LAND_CONTAINER_EDGE_M) : undefined;
  for (let i = 0; i < pixels.length; i++) {
    const dirt = surfaceTransitionWeight(Math.sqrt(dirtDistances[i]), 0, FARM_LAND_MARGIN_M);
    const hole = grassDistances
      ? surfaceTransitionWeight(Math.sqrt(grassDistances[i]), FARM_LAND_MASK_SPACING_M, FARM_LAND_CONTAINER_EDGE_M)
      : 0;
    pixels[i] = Math.round(255 * dirt * (1 - hole));
  }
  let cutoutPixels: Uint8Array | undefined;
  if (opaquePlots.length) {
    cutoutPixels = new Uint8Array(resolution * resolution);
    const edge = DEFAULT_SOIL_VISUAL_CONFIG.soil.edge;
    let maxPlotSize = 0;
    let minPlotX = Infinity,
      minPlotZ = Infinity,
      maxPlotX = -Infinity,
      maxPlotZ = -Infinity;
    for (let i = 0; i < opaquePlots.length; i++) {
      const b = opaquePlots[i];
      const plotSize = Math.min(b.maximumX - b.minimumX, b.maximumZ - b.minimumZ);
      if (plotSize > maxPlotSize) maxPlotSize = plotSize;
      if (b.minimumX < minPlotX) minPlotX = b.minimumX;
      if (b.minimumZ < minPlotZ) minPlotZ = b.minimumZ;
      if (b.maximumX > maxPlotX) maxPlotX = b.maximumX;
      if (b.maximumZ > maxPlotZ) maxPlotZ = b.maximumZ;
    }
    const safety = Math.max(FARM_LAND_SOIL_CUTOUT_SAFETY_M, maxPlotSize / 64);
    const inset = Math.max(edge.blendWidth, maxPlotSize * edge.cornerRadiusFraction) + safety;
    const scale = (resolution - 1) / size;
    const minX = Math.max(0, Math.floor((minPlotX + inset - chunk.x) * scale));
    const maxX = Math.min(resolution - 1, Math.ceil((maxPlotX - inset - chunk.x) * scale));
    const minZ = Math.max(0, Math.floor((minPlotZ + inset - chunk.z) * scale));
    const maxZ = Math.min(resolution - 1, Math.ceil((maxPlotZ - inset - chunk.z) * scale));
    const grassCutoffSquared = FARM_LAND_CONTAINER_EDGE_M * FARM_LAND_CONTAINER_EDGE_M;
    for (let z = minZ; z <= maxZ; z++) {
      const worldZ = chunk.z + (z * size) / (resolution - 1);
      const row = z * resolution;
      for (let x = minX; x <= maxX; x++) {
        const index = row + x;
        if (pixels[index] !== 255) continue;
        if (grassDistances && grassDistances[index] < grassCutoffSquared) continue;
        const worldX = chunk.x + (x * size) / (resolution - 1);
        if (isRectCoveredByUnion(worldX - inset, worldZ - inset, worldX + inset, worldZ + inset, opaquePlots)) {
          cutoutPixels[index] = 255;
        }
      }
    }
  }
  return { resolution, pixels, cutoutPixels };

  // Visit each rectangle's influence region once, rather than testing every plot at every pixel.
  // Squared distances preserve the same Euclidean union and defer sqrt until the final R8 pass.
  function rasterDistances(bounds: readonly GroundBounds[], margin: number): Float64Array {
    const distances = new Float64Array(pixels.length).fill(margin * margin);
    const scale = (resolution - 1) / size;
    const dxSquared = new Float64Array(resolution);
    for (const b of bounds) {
      const minX = Math.max(0, Math.floor((b.minimumX - margin - chunk.x) * scale));
      const maxX = Math.min(resolution - 1, Math.ceil((b.maximumX + margin - chunk.x) * scale));
      const minZ = Math.max(0, Math.floor((b.minimumZ - margin - chunk.z) * scale));
      const maxZ = Math.min(resolution - 1, Math.ceil((b.maximumZ + margin - chunk.z) * scale));
      for (let x = minX; x <= maxX; x++) {
        const worldX = chunk.x + (x * size) / (resolution - 1);
        const dx = Math.max(b.minimumX - worldX, 0, worldX - b.maximumX);
        dxSquared[x] = dx * dx;
      }
      for (let z = minZ; z <= maxZ; z++) {
        const worldZ = chunk.z + (z * size) / (resolution - 1);
        const dz = Math.max(b.minimumZ - worldZ, 0, worldZ - b.maximumZ),
          dzSquared = dz * dz;
        const row = z * resolution;
        for (let x = minX; x <= maxX; x++) {
          const index = row + x;
          distances[index] = Math.min(distances[index], dxSquared[x] + dzSquared);
        }
      }
    }
    return distances;
  }
}

export interface FarmLandChunk {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly bounds: readonly GroundBounds[];
  readonly signature: string;
}

/** Sparse chunks bound mesh size and limit edits to nearby geometry, including shrink/removal. */
export function farmLandChunks(
  bounds: readonly GroundBounds[],
  size: number,
  originX = 0,
  originZ = 0,
  margin = 0
): FarmLandChunk[] {
  const chunks = new Map<string, { x: number; z: number; bounds: GroundBounds[] }>();
  for (const b of bounds) {
    const minX = Math.floor((b.minimumX - margin - originX) / size),
      maxX = Math.ceil((b.maximumX + margin - originX) / size) - 1;
    const minZ = Math.floor((b.minimumZ - margin - originZ) / size),
      maxZ = Math.ceil((b.maximumZ + margin - originZ) / size) - 1;
    for (let iz = minZ; iz <= maxZ; iz++)
      for (let ix = minX; ix <= maxX; ix++) {
        const key = `${ix},${iz}`;
        let chunk = chunks.get(key);
        if (!chunk) chunks.set(key, (chunk = { x: originX + ix * size, z: originZ + iz * size, bounds: [] }));
        chunk.bounds.push(b);
      }
  }
  return [...chunks].map(([key, chunk]) => {
    chunk.bounds.sort(
      (a, b) => a.minimumX - b.minimumX || a.minimumZ - b.minimumZ || a.maximumX - b.maximumX || a.maximumZ - b.maximumZ
    );
    return { key, ...chunk, signature: JSON.stringify(chunk.bounds) };
  });
}
