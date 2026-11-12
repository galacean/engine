import { BufferAsset, JSONAsset, type Engine } from "@galacean/engine-core";
import { copyWaterTerrainSnapshot, type WaterTerrainSnapshot } from "../authoring/terrain/WaterTerrainSnapshot";
import { waterTerrainContentHash } from "../authoring/terrain/WaterTerrainIdentity";
import { digestSha256HexPortable } from "../resources/sha256";
import { hashStableValue } from "../compiler/shared/determinism";

interface TerrainGrid extends Omit<WaterTerrainSnapshot, "heights" | "refinements"> {
  byteOffset: number;
  refinements?: TerrainGrid[];
}

/** Metadata has no resource URLs. Scene/Prefab owns both native asset references. */
export interface WaterTerrainDescription {
  version: 1;
  format: "float64-le";
  layout: "row-major-x-fast-positive-z";
  byteLength: number;
  sha256: string;
  grid: TerrainGrid;
}

export type WaterTerrainInput = { mode: "host" } | { mode: "asset"; description: JSONAsset; heights: BufferAsset };

export interface DecodedWaterTerrain {
  readonly snapshot: WaterTerrainSnapshot;
  readonly contentHash: string;
}

/** Lossless export of accepted metre-valued heights, including refinement grids. */
export function encodeWaterTerrainAssets(input: WaterTerrainSnapshot): {
  description: WaterTerrainDescription;
  heights: Uint8Array;
} {
  const snapshot = copyWaterTerrainSnapshot(input);
  const values: number[] = [];
  const visit = (terrain: WaterTerrainSnapshot): TerrainGrid => {
    const { heights, refinements, ...metadata } = terrain;
    const byteOffset = values.length * 8;
    for (const height of heights) values.push(height);
    return { ...metadata, byteOffset, ...(refinements ? { refinements: refinements.map(visit) } : {}) };
  };
  const grid = visit(snapshot);
  const heights = new Uint8Array(values.length * 8);
  const view = new DataView(heights.buffer);
  values.forEach((height, index) => view.setFloat64(index * 8, height, true));
  return {
    description: {
      version: 1,
      format: "float64-le",
      layout: "row-major-x-fast-positive-z",
      byteLength: heights.byteLength,
      sha256: digestSha256HexPortable(heights),
      grid
    },
    heights
  };
}

/** Validate the pair before compilation. Never fetch paths from the description. */
export function decodeWaterTerrainAssets(description: unknown, bytes: Uint8Array): DecodedWaterTerrain {
  const input = description as WaterTerrainDescription;
  if (
    !input ||
    Object.keys(input).some((key) => !["version", "format", "layout", "byteLength", "sha256", "grid"].includes(key)) ||
    input.version !== 1 ||
    input.format !== "float64-le" ||
    input.layout !== "row-major-x-fast-positive-z"
  )
    throw new TypeError("INVALID_ARGUMENT: Unsupported Water terrain description version or encoding.");
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0 || input.byteLength !== bytes.byteLength)
    throw new RangeError("INVALID_ARGUMENT: Water terrain byte length does not match its description.");
  if (!/^[a-f0-9]{64}$/.test(input.sha256) || digestSha256HexPortable(bytes) !== input.sha256)
    throw new Error("INVALID_ARGUMENT: Water terrain height checksum does not match its description.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const visit = (grid: TerrainGrid, depth: number): WaterTerrainSnapshot => {
    if (
      !grid ||
      Object.keys(grid).some(
        (key) =>
          ![
            "id",
            "revision",
            "origin",
            "spacing",
            "spacingZ",
            "columns",
            "rows",
            "surface",
            "byteOffset",
            "refinements"
          ].includes(key)
      ) ||
      depth > 32 ||
      !Number.isSafeInteger(grid.columns) ||
      grid.columns < 2 ||
      !Number.isSafeInteger(grid.rows) ||
      grid.rows < 2 ||
      grid.columns * grid.rows > 1048576 ||
      grid.byteOffset !== offset ||
      offset + grid.columns * grid.rows * 8 > bytes.byteLength
    )
      throw new RangeError("INVALID_ARGUMENT: Invalid Water terrain grid or sample range.");
    const { byteOffset: _offset, refinements, ...metadata } = grid;
    const heights = Array.from({ length: grid.columns * grid.rows }, () => {
      const height = view.getFloat64(offset, true);
      offset += 8;
      return height;
    });
    if (refinements !== undefined && !Array.isArray(refinements))
      throw new TypeError("INVALID_ARGUMENT: Invalid Water terrain refinements.");
    return {
      ...metadata,
      heights,
      ...(refinements ? { refinements: refinements.map((child) => visit(child, depth + 1)) } : {})
    };
  };
  const snapshot = copyWaterTerrainSnapshot(visit(input.grid, 0));
  if (offset !== bytes.byteLength) throw new RangeError("INVALID_ARGUMENT: Unused Water terrain height samples.");
  return Object.freeze({ snapshot, contentHash: waterTerrainContentHash(snapshot) });
}

// Weak entries share equivalent revisions across Scene/Prefab asset namespaces without pinning height arrays.
const byContent = new WeakMap<Engine, Map<string, WeakRef<DecodedWaterTerrain>>>();
const decoded = new WeakMap<
  JSONAsset,
  WeakMap<
    BufferAsset,
    {
      descriptionKey: string;
      buffer: ArrayBuffer;
      result: DecodedWaterTerrain;
    }
  >
>();

/** Native assets are replaced by public author transactions. Cache their immutable input pair. */
export function resolveWaterTerrainAssets(input: Extract<WaterTerrainInput, { mode: "asset" }>): DecodedWaterTerrain {
  const { description, heights } = input;
  if (
    !(description instanceof JSONAsset) ||
    !(heights instanceof BufferAsset) ||
    description.destroyed ||
    heights.destroyed ||
    description.engine !== heights.engine
  )
    throw new TypeError("INVALID_ARGUMENT: Water terrain requires live JSON and Buffer assets from one Engine.");
  const descriptionKey = hashStableValue(description.data);
  // Even an in-place Buffer mutation must fail unless its description changes in the same edit.
  if (digestSha256HexPortable(new Uint8Array(heights.buffer)) !== (description.data as WaterTerrainDescription).sha256)
    throw new Error("INVALID_ARGUMENT: Water terrain height checksum does not match its description.");
  const previous = decoded.get(description)?.get(heights);
  if (previous?.descriptionKey === descriptionKey && previous.buffer === heights.buffer) return previous.result;
  let content = byContent.get(description.engine);
  if (!content) byContent.set(description.engine, (content = new Map()));
  const result =
    content.get(descriptionKey)?.deref() ?? decodeWaterTerrainAssets(description.data, new Uint8Array(heights.buffer));
  if (!content.has(descriptionKey) && content.size >= 64) content.delete(content.keys().next().value!);
  content.set(descriptionKey, new WeakRef(result));
  let byHeights = decoded.get(description);
  if (!byHeights) decoded.set(description, (byHeights = new WeakMap()));
  byHeights.set(heights, { descriptionKey, buffer: heights.buffer, result });
  return result;
}

export function waterTerrainReferences(input?: WaterTerrainInput): (JSONAsset | BufferAsset)[] {
  return input?.mode === "asset" ? [input.description, input.heights] : [];
}
