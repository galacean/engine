import { describe, expect, it, vi } from "vitest";
import { BuildingWallBakeCache } from "../src/building/runtime/BuildingWallBakeCache";

describe("scene wall lightmaps", () => {
  it("bakes once per lit type during loading and reuses an existing GPU resource for a later instance", async () => {
    const release = vi.fn();
    const cache = new BuildingWallBakeCache<object>(release);
    const bake = vi.fn(async () => ({}));
    const initial = Array.from({ length: 20 }, (_, i) => (i % 3).toString());
    const buildings = initial.flatMap((key, index) => {
      const building = { buildingId: String(index), typeKey: String(index % 6) };
      // A second lamp may reuse its neighbour's map or need another existing map.
      return [
        { ...building, key },
        { ...building, key: String((index + (index % 2)) % 3) }
      ];
    });
    expect(cache.inventory(buildings)).toMatchObject({ litBuildings: 20, litTypes: 6, mapTypes: 3, readyTypes: 0 });
    const maps = await Promise.all(initial.map((key) => cache.getOrCreate(key, bake)));
    expect(bake).toHaveBeenCalledTimes(3);
    expect(cache.inventory(buildings)).toMatchObject({ readyTypes: 3, cachedTypes: 3, cacheHits: 17 });
    expect(await cache.getOrCreate("0", bake)).toBe(maps[0]);
    const newType = await Promise.all([cache.getOrCreate("edited", bake), cache.getOrCreate("edited", bake)]);
    expect(newType[0]).toBe(newType[1]);
    expect(bake).toHaveBeenCalledTimes(4);
    expect(cache.inventory([{ buildingId: "LLM addition", typeKey: "new building", key: "edited" }])).toMatchObject({
      litBuildings: 1,
      litTypes: 1,
      readyTypes: 1,
      cachedTypes: 4
    });
    cache.dispose();
    expect(release).toHaveBeenCalledTimes(4);
  });

  it("lets a later edit retry after a failed bake", async () => {
    const cache = new BuildingWallBakeCache<object>(vi.fn());
    const error = new Error("texture upload failed");
    await expect(
      cache.getOrCreate("tower", async () => {
        throw error;
      })
    ).rejects.toBe(error);
    expect(cache.metrics).toMatchObject({ cachedTypes: 0, pendingTypes: 0, failedBakes: 1 });
    await cache.getOrCreate("tower", async () => ({}));
    expect(cache.metrics).toMatchObject({ bakesStarted: 2, bakesCompleted: 1, failedBakes: 1 });
    cache.dispose();
  });

  it("releases a late GPU result once if a scene closes while the worker is returning", async () => {
    const release = vi.fn();
    const cache = new BuildingWallBakeCache<object>(release);
    let finish!: (value: object) => void;
    const pending = cache.getOrCreate("house", () => new Promise((resolve) => (finish = resolve)));
    await Promise.resolve();
    cache.dispose();
    const texture = {};
    finish(texture);
    await expect(pending).rejects.toThrow();
    cache.dispose();
    expect(release).toHaveBeenCalledExactlyOnceWith(texture);
    expect(cache.metrics).toMatchObject({ cachedTypes: 0, pendingTypes: 0, bakesCompleted: 0 });
  });
});
