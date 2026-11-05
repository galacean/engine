import { expect, it, vi } from "vitest";
import { type Engine, type Material } from "@galacean/engine";
import { createTerrainClipmapMaterialBinding } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmapMaterial";
import type { TerrainClipmapRegionSource } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmapSource";
import { packTerrainHeightAtlas } from "@galacean/engine-terrain/terrain/clipmap/TerrainHeightAtlas";
import { packTerrainNormalAtlas } from "@galacean/engine-terrain/terrain/clipmap/TerrainNormalAtlas";
import { TerrainPuddleHydrologyCompiler } from "@galacean/engine-terrain/terrain/clipmap/TerrainPuddleHydrology";
import {
  terrainChangedRectangle,
  reversibleTerrainSteps
} from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";

vi.hoisted(() => Object.defineProperty(globalThis, "window", { value: {}, configurable: true }));
const gpu = vi.hoisted(() => ({
  textures: [] as { name: string; pixels: Uint8Array; destroyed: boolean; uploads: number[][] }[],
  fail: ""
}));
vi.mock("@galacean/engine", async (original) => {
  const actual = await original<typeof import("@galacean/engine")>();
  return {
    ...actual,
    ScreenSpaceReflection: { setMaterialReceiver: () => true },
    Texture2D: class {
      name = "";
      pixels = new Uint8Array();
      destroyed = false;
      uploads: number[][] = [];
      constructor(
        readonly engine: unknown,
        readonly width: number,
        readonly height: number,
        readonly format: number
      ) {
        gpu.textures.push(this);
      }
      setPixelBuffer(pixels: ArrayBufferView, mip = 0, x = 0, y = 0, width = this.width, height = this.height) {
        const channels =
          this.format === actual.TextureFormat.R8G8 ? 2 : this.format === actual.TextureFormat.R8 ? 1 : 4;
        if (!this.pixels.length) this.pixels = new Uint8Array(this.width * this.height * channels);
        const input = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
        for (let row = 0; row < height; row++)
          this.pixels.set(
            input.subarray(row * width * channels, (row + 1) * width * channels),
            ((row + y) * this.width + x) * channels
          );
        this.uploads.push([x, y, width, height]);
        if (gpu.fail === this.name) {
          gpu.fail = "";
          throw Error("mutated upload");
        }
      }
      destroy() {
        this.destroyed = true;
      }
    }
  };
});
function source(id = "region", x = 0): TerrainClipmapRegionSource {
  return {
    id,
    worldPosition: [x, 0, 0],
    worldSize: [4, 10, 4],
    heightSampleSize: [5, 5],
    heightDecodeOffset: 0,
    heightDecodeScale: 10,
    heightSamples: new Uint16Array(25).fill(20000)
  };
}
function fixture(sources = [source()], withAlpha = false) {
  gpu.fail = "";
  gpu.textures.length = 0;
  const data = new Map<string, unknown>();
  const shaderData = {
    setTexture: (k: string, v: unknown) => {
      data.set(k, v);
      if (gpu.fail === k) {
        gpu.fail = "";
        throw Error("mutated binding");
      }
    },
    getTexture: (k: string) => data.get(k),
    setVector2() {},
    setVector3() {},
    setVector4() {},
    setFloat() {},
    setInt() {},
    setFloatArray: (k: string, v: Float32Array) => {
      data.set(k, v.slice());
      if (gpu.fail === k) {
        gpu.fail = "";
        throw Error("mutated decode");
      }
    },
    enableMacro() {},
    disableMacro() {}
  };
  const material = { name: "test", clone: () => ({ shaderData, destroy() {} }) } as unknown as Material;
  const engine = {
    canvas: { _webCanvas: { getContext: () => ({ MAX_TEXTURE_SIZE: 1, getParameter: () => 1024 }) } },
    resourceManager: { addContentRestorer() {} }
  } as unknown as Engine;
  const layers = withAlpha
    ? sources.map((s) => ({
        id: s.id,
        layers: [
          {
            id: "base",
            tileSize: [1, 1] as const,
            tileOffset: [0, 0] as const,
            normalScale: 0,
            diffuseRemapMin: [1, 1, 1, 1] as const,
            diffuseRemapMax: [1, 1, 1, 1] as const,
            maskRemapMin: [0, 0, 0, 0] as const,
            maskRemapMax: [1, 1, 1, 1] as const,
            metallic: 0,
            smoothness: 0,
            specular: [1, 1, 1, 1] as const,
            snowResponse: 0.65
          }
        ],
        alphamaps: [
          { sampleSize: [5, 5] as const, layers: ["base", null, null, null] as const, weights: new Uint8Array(100) }
        ]
      }))
    : undefined;
  const binding = createTerrainClipmapMaterialBinding(engine, material, sources, layers);
  return { binding, data, texture: gpu.textures[0], sources };
}
it("compares exact edges/channels and rejects mismatched or non-finite lattices", () => {
  const old = new Float32Array(12),
    next = old.slice();
  next[11] = 1;
  expect(terrainChangedRectangle(old, next, 2, 2, 3)).toEqual({ x: 1, z: 1, width: 1, height: 1 });
  expect(() => terrainChangedRectangle(old, next, 3, 3)).toThrow();
  next[0] = NaN;
  expect(() => terrainChangedRectangle(old, next, 2, 2, 3)).toThrow();
});
it("prepares without live mutation, uploads only changed pixels, and matches full normals/drainage across regions", () => {
  const f = fixture([source("a"), source("b", 4)]),
    before = f.texture.pixels.slice();
  const next = f.sources.map((s) => ({ ...s, heightSamples: s.heightSamples.slice() }));
  next[0].heightSamples[12] = 0;
  const oldNormal = f.data.get("material_TerrainNormalAtlas");
  const prepared = f.binding.prepareRegionUpdate!({ sources: next });
  expect(f.texture.pixels).toEqual(before);
  expect(f.data.get("material_TerrainNormalAtlas")).toBe(oldNormal);
  prepared.commit();
  expect(f.texture.uploads.at(-1)?.slice(2)).toEqual([1, 1]);
  const expected = packTerrainNormalAtlas(next, packTerrainHeightAtlas(next, 1024));
  expect((f.data.get("material_TerrainNormalAtlas") as { pixels: Uint8Array }).pixels).toEqual(expected);
  expect(f.binding.puddleHydrology).toEqual(new TerrainPuddleHydrologyCompiler(next, 1024).compile());
  prepared.rollback();
  expect(f.texture.pixels).toEqual(before);
  expect(f.data.get("material_TerrainNormalAtlas")).toBe(oldNormal);
  expect(f.binding.heightSamplingSource!.revision).toBe(0);
  prepared.discard();
  f.binding.destroy();
  expect(gpu.textures.every((t) => t.destroyed)).toBe(true);
});
it.each([
  "Terrain height residency atlas",
  "material_TerrainNormalAtlas",
  "material_TerrainPuddleAtlas",
  "material_TerrainRegionHeightDecode"
])("rolls back mutate-then-throw at %s and a later owner failure", (failure) => {
  const f = fixture(),
    before = f.texture.pixels.slice();
  const next = {
    ...f.sources[0],
    heightSamples: f.sources[0].heightSamples.slice(),
    heightDecodeOffset: -10,
    heightDecodeScale: 40
  };
  next.heightSamples[0] = 65535;
  const prepared = f.binding.prepareRegionUpdate!({ sources: [next] });
  gpu.fail = failure;
  expect(() => prepared.commit()).toThrow();
  expect(f.texture.pixels).toEqual(before);
  expect(Array.from(f.binding.heightSamplingSource!.regionHeightDecode.slice(0, 2))).toEqual([0, 10]);
  const transaction = reversibleTerrainSteps([
    prepared,
    {
      commit: () => {
        throw Error("Water");
      },
      rollback() {}
    }
  ]);
  expect(() => transaction.commit()).toThrow("Water");
  expect(f.texture.pixels).toEqual(before);
  prepared.commit();
  expect(f.texture.uploads.at(-1)?.slice(2)).toEqual([5, 5]);
  prepared.finalize();
  expect(gpu.textures[1].destroyed).toBe(true);
  f.binding.destroy();
});
it("rejects stale candidates and changed grids, releases uncommitted textures with its owner", () => {
  const f = fixture();
  const candidate = f.binding.prepareRegionUpdate!({ sources: f.sources });
  f.binding.updateHeightRegion({
    regionId: "region",
    sampleOrigin: [0, 0],
    sampleSize: [1, 1],
    samples: new Uint16Array([3])
  });
  expect(() => candidate.commit()).toThrow("Stale");
  expect(() => f.binding.prepareRegionUpdate!({ sources: [{ ...f.sources[0], worldPosition: [1, 0, 0] }] })).toThrow(
    "grid"
  );
  f.binding.destroy();
  expect(gpu.textures.every((t) => t.destroyed)).toBe(true);
});

it("uploads an alphamap dirty rectangle and restores its accepted bytes on a later failure", () => {
  const f = fixture([source()], true),
    atlas = gpu.textures.find((t) => t.name === "Terrain alphamap residency atlas")!;
  const before = atlas.pixels.slice(),
    pixels = new Uint8Array(100);
  pixels[51] = 255;
  const update = () =>
    f.binding.prepareRegionUpdate!({
      sources: f.sources,
      alphamaps: [{ regionId: "region", mapIndex: 0, sampleSize: [5, 5], pixels }]
    });
  const candidate = update();
  expect(atlas.pixels).toEqual(before);
  candidate.commit();
  expect(atlas.uploads.at(-1)).toEqual([2, 2, 1, 1]);
  candidate.rollback();
  expect(atlas.pixels).toEqual(before);
  candidate.discard();
  const failed = update();
  gpu.fail = "Terrain alphamap residency atlas";
  expect(() => failed.commit()).toThrow();
  expect(atlas.pixels).toEqual(before);
  failed.discard();
  f.binding.destroy();
});

it("updates layer metadata and simple-shader colours together, without replacing terrain resources", () => {
  const f = fixture([source()], true),
    before = [...gpu.textures];
  const metadata = f.data.get("material_TerrainLayerMetadata") as { setPixelBuffer(pixels: ArrayBufferView): void };
  const upload = vi.spyOn(metadata, "setPixelBuffer");
  const patch = { regionId: "region", layerId: "base", color: [0, 0.7, 0.9, 1] as const };
  f.binding.setLayerDiffuseColors!([patch]);
  expect(gpu.textures).toEqual(before);
  expect(f.data.get("material_TerrainLayerMetadata")).toBe(metadata);
  expect(Array.from((upload.mock.lastCall![0] as Float32Array).slice(4, 12))).toEqual(
    Array.from(new Float32Array([0, 0.7, 0.9, 1, 0, 0.7, 0.9, 1]))
  );
  expect(Array.from((f.data.get("material_TerrainSimpleColors") as Float32Array).slice(0, 4))).toEqual(
    Array.from(new Float32Array([0, 0.7, 0.9, 1]))
  );
  f.binding.setLayerDiffuseColors!([patch]);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(() => f.binding.setLayerDiffuseColors!([{ ...patch, layerId: "missing" }])).toThrow("not resident");
  expect(() => f.binding.setLayerDiffuseColors!([{ ...patch, color: [NaN, 0, 0, 1] }])).toThrow();
  expect(upload).toHaveBeenCalledTimes(1);
  f.binding.setLayerDiffuseColors!([{ regionId: "region", layerId: "base" }]);
  expect(Array.from((f.data.get("material_TerrainSimpleColors") as Float32Array).slice(0, 4))).toEqual([1, 1, 1, 1]);
  gpu.fail = "Terrain layer metadata";
  expect(() => f.binding.setLayerDiffuseColors!([patch])).toThrow("mutated upload");
  expect(Array.from((upload.mock.lastCall![0] as Float32Array).slice(4, 8))).toEqual([1, 1, 1, 1]);
  f.binding.destroy();
  expect(() => f.binding.setLayerDiffuseColors!([patch])).toThrow("destroyed");
});

it("rejects unrepresentable Float32 decode and uses the accepted GPU rounding for repeated candidates", () => {
  const f = fixture();
  for (const heightDecodeScale of [0, -1, 1e100])
    expect(() => f.binding.prepareRegionUpdate!({ sources: [{ ...f.sources[0], heightDecodeScale }] })).toThrow();
  const sources = [{ ...f.sources[0], heightDecodeOffset: -1.0000000001, heightDecodeScale: 10.00000001 }];
  const first = f.binding.prepareRegionUpdate!({ sources });
  first.commit();
  first.finalize();
  const uploads = f.texture.uploads.length;
  const repeated = f.binding.prepareRegionUpdate!({ sources });
  repeated.commit();
  repeated.finalize();
  expect(f.texture.uploads).toHaveLength(uploads);
  f.binding.destroy();
});
