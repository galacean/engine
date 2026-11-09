import { describe, expect, it } from "vitest";
import { BufferAsset, JSONAsset, WebGLEngine } from "@galacean/engine";
import {
  encodeWaterTerrainAssets,
  decodeWaterTerrainAssets,
  resolveWaterTerrainAssets
} from "../src/water/native/WaterTerrainAssets";
import { digestSha256HexPortable } from "../src/water/resources/sha256";
import { sampleWaterTerrainHeight } from "../src/water/authoring/terrain/WaterTerrainSnapshot";
import { validateWaterAuthoringSettings } from "../src/water/native/WaterAuthoring";
import { lake, terrain } from "./WaterFixtures";

describe("native JSON/Buffer terrain inputs", () => {
  it("preserves negative, fractional and sub-Float32 heights, coordinates and interpolation", () => {
    const source = {
      ...terrain,
      origin: [-5, -8] as const,
      spacingZ: 0.5,
      heights: terrain.heights.map((_, i) => -1 + i * 1e-10)
    };
    const pair = encodeWaterTerrainAssets(source);
    const decoded = decodeWaterTerrainAssets(pair.description, pair.heights).snapshot;
    expect(decoded).toEqual(source);
    expect(sampleWaterTerrainHeight(decoded, -2.25, -6.75)).toBe(sampleWaterTerrainHeight(source, -2.25, -6.75));
    expect(new DataView(pair.heights.buffer).getFloat64(8, true)).toBe(source.heights[1]);
  });

  it("retains refinement grids and exact triangle sampling", () => {
    const source = {
      ...terrain,
      surface: "float32-triangles" as const,
      refinements: [
        {
          id: "fine",
          revision: 2,
          origin: [2, 2] as const,
          spacing: 0.5,
          columns: 3,
          rows: 3,
          heights: Array(9).fill(-2),
          surface: "float32-triangles" as const
        }
      ]
    };
    const pair = encodeWaterTerrainAssets(source);
    expect(decodeWaterTerrainAssets(pair.description, pair.heights).snapshot).toEqual(source);
  });

  it("rejects stale pairs, truncated bytes, invalid dimensions and non-finite samples", () => {
    const pair = encodeWaterTerrainAssets(terrain);
    expect(() => decodeWaterTerrainAssets({ ...pair.description, version: 2 }, pair.heights)).toThrow("version");
    expect(() => decodeWaterTerrainAssets(pair.description, pair.heights.slice(1))).toThrow("length");
    const changed = pair.heights.slice();
    new DataView(changed.buffer).setFloat64(0, -2, true);
    expect(() => decodeWaterTerrainAssets(pair.description, changed)).toThrow("checksum");
    expect(() =>
      decodeWaterTerrainAssets(
        { ...pair.description, grid: { ...pair.description.grid, columns: 1000000 } },
        pair.heights
      )
    ).toThrow("grid");
    new DataView(changed.buffer).setFloat64(0, NaN, true);
    expect(() =>
      decodeWaterTerrainAssets({ ...pair.description, sha256: digestSha256HexPortable(changed) }, changed)
    ).toThrow("snapshot");
  });

  it("shares validated snapshots, detects in-place mutations and invalidates a replacement of either asset", async () => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    try {
      const pair = encodeWaterTerrainAssets(terrain);
      const description = new JSONAsset(engine),
        heights = new BufferAsset(engine);
      description.data = pair.description;
      heights.buffer = pair.heights.buffer;
      const input = { mode: "asset" as const, description, heights };
      const first = resolveWaterTerrainAssets(input);
      expect(resolveWaterTerrainAssets(input)).toBe(first);
      new DataView(heights.buffer).setFloat64(0, -2, true);
      expect(() => resolveWaterTerrainAssets(input)).toThrow("checksum");
      const replacement = encodeWaterTerrainAssets({ ...terrain, heights: terrain.heights.map(() => -2) });
      description.data = replacement.description;
      heights.buffer = replacement.heights.buffer;
      const second = resolveWaterTerrainAssets(input);
      expect(second.contentHash).not.toBe(first.contentHash);
      expect(second.snapshot.heights[0]).toBe(-2);
      expect(first.snapshot.heights[0]).toBe(-1);
    } finally {
      engine.destroy();
    }
  });

  it("rejects ambiguous or legacy terrain sources at the author boundary", () => {
    expect(() => validateWaterAuthoringSettings({ shape: lake, terrain: { mode: "host" } })).not.toThrow();
    for (const terrain of [{ $ref: "legacy" }, { mode: "host", description: {} }, { mode: "asset" }])
      expect(() => validateWaterAuthoringSettings({ shape: lake, terrain })).toThrow("terrain");
    expect(() =>
      validateWaterAuthoringSettings({ shape: lake, terrain: { mode: "host" }, terrainBinding: "host" } as never)
    ).toThrow("Unknown");
  });
});
