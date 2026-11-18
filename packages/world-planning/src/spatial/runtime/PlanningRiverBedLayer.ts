import type {
  TerrainLayerResidencyRegionSource,
  TerrainLayerResolvedSource
} from "@galacean/engine-terrain/terrain/clipmap/TerrainLayerResidency";

/** Terrain-owned appearance only. Never changes the accepted bed height or Water queries. */
export const PLANNING_RIVER_BED_LAYER_ID = "planning-river-sand";
export const PLANNING_RIVER_BED_BANK_EXTENSION_METRES = 0.75;

/** The reference Farmlands_RiverStone TerrainLayer uses this sand/pebble albedo at 6 m. */
export function planningRiverBedLayer<T>(diffuse: T): TerrainLayerResolvedSource<T> {
  return {
    id: PLANNING_RIVER_BED_LAYER_ID,
    textureContentId: "sha256:63bef1adb845c239b4fd615a908523b95c9391415ec03c6151efaf5f8568b41b",
    diffuse,
    tileSize: [6, 6],
    tileOffset: [0, 0],
    normalScale: 0,
    diffuseRemapMin: [0, 0, 0, 0],
    diffuseRemapMax: [1, 1, 1, 1],
    maskRemapMin: [0, 0, 0, 0],
    maskRemapMax: [1, 1, 1, 1],
    metallic: 0,
    smoothness: 0,
    specular: [0, 0, 0, 0],
    snowResponse: 0
  };
}

/** Add an independent bed channel without repurposing lake/ocean or road channels. */
export function appendPlanningRiverBed<T>(
  source: TerrainLayerResidencyRegionSource<T>,
  coverage: Uint8Array,
  layer: TerrainLayerResolvedSource<T>
): TerrainLayerResidencyRegionSource<T> {
  const size = source.alphamaps[0].sampleSize;
  if (coverage.length !== size[0] * size[1] || source.alphamaps.length !== 1)
    throw new RangeError("River bed coverage must match the published Terrain alphamap.");
  const before = source.alphamaps[0],
    weights = new Uint8Array(before.weights.length);
  const bed = new Uint8Array(before.weights.length);
  for (let i = 0; i < coverage.length; i++) {
    const remaining = 255 - coverage[i];
    let cumulative = 0,
      assigned = 0;
    // Cumulative rounding keeps the original ratios and an exact sum of 255.
    for (let c = 0; c < 4; c++) {
      cumulative += before.weights[i * 4 + c];
      const next = Math.round((cumulative * remaining) / 255);
      weights[i * 4 + c] = next - assigned;
      assigned = next;
    }
    bed[i * 4] = coverage[i];
  }
  return {
    ...source,
    layers: [...source.layers, layer],
    alphamaps: [
      { ...before, weights },
      { sampleSize: size, layers: [layer.id, null, null, null], weights: bed }
    ]
  };
}
