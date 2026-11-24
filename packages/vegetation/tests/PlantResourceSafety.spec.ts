import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetType, type Engine, type JSONAsset, type ModelMesh } from "@galacean/engine";
import { loadPlantJSON, loadPlantParameters } from "../src/asset-assembly/ProceduralPlantResources";
import { encodePlantParameters } from "../src/asset-assembly/PlantParameterEncoding";
import * as ProceduralShrubSource from "../src/asset-assembly/ProceduralShrubSource";
import { PLANT_SPECIES_CATALOG } from "../src/asset-assembly/PlantSpeciesCatalog";
import { PlantSpeciesSources } from "../src/asset-assembly/PlantSpeciesSources";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProceduralPlantResources WeakMap caching (P1-12)", () => {
  it("delegates to ResourceManager without private _getRemoteUrl and auto-invalidates when JSONAsset changes", async () => {
    let currentAsset = { data: { version: 1, items: [{ id: "a" }] } } as unknown as JSONAsset;
    const load = vi.fn(async () => currentAsset);
    const getRemoteUrl = vi.fn(() => {
      throw new Error("_getRemoteUrl must not be accessed");
    });
    const fakeEngine = {
      resourceManager: {
        load,
        _getRemoteUrl: getRemoteUrl
      }
    } as unknown as Engine;

    const first = await loadPlantJSON<{ version: number; items: { id: string }[] }>(
      fakeEngine,
      "World/Vegetation/plant-species.json"
    );
    const second = await loadPlantJSON<{ version: number; items: { id: string }[] }>(
      fakeEngine,
      "World/Vegetation/plant-species.json"
    );
    expect(getRemoteUrl).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenNthCalledWith(1, { type: AssetType.JSON, url: "World/Vegetation/plant-species.json" });
    // Same live JSONAsset returns the same WeakMap-cached resolved object.
    expect(second).toBe(first);
    expect(first.version).toBe(1);

    // Simulating destroy() / replaceCachedResource() / blob swap: ResourceManager returns a new JSONAsset.
    currentAsset = { data: { version: 2, items: [{ id: "b" }] } } as unknown as JSONAsset;
    const third = await loadPlantJSON<{ version: number; items: { id: string }[] }>(
      fakeEngine,
      "World/Vegetation/plant-species.json"
    );
    expect(third).not.toBe(first);
    expect(third.version).toBe(2);

    // Same contract for loadPlantParameters: WeakMap<JSONAsset, WeakRef<object>> auto-invalidates on new JSONAsset.
    let paramAsset = { data: encodePlantParameters({ id: "tree-1", value: 42 }) } as unknown as JSONAsset;
    const paramLoad = vi.fn(async () => paramAsset);
    const paramEngine = { resourceManager: { load: paramLoad } } as unknown as Engine;
    const validate = vi.fn();
    const p1 = await loadPlantParameters<{ id: string; value: number }>(paramEngine, "tree.json", validate);
    const p2 = await loadPlantParameters<{ id: string; value: number }>(paramEngine, "tree.json", validate);
    expect(p2).toBe(p1);
    expect(p1).toEqual({ id: "tree-1", value: 42 });
    expect(validate).toHaveBeenCalledTimes(2);

    paramAsset = { data: encodePlantParameters({ id: "tree-1", value: 99 }) } as unknown as JSONAsset;
    const p3 = await loadPlantParameters<{ id: string; value: number }>(paramEngine, "tree.json", validate);
    expect(p3).not.toBe(p1);
    expect(p3.value).toBe(99);
  });
});

describe("PlantSpeciesSources partial shrub load cleanup (P1-13)", () => {
  it("destroys every fulfilled shrub ModelMesh without leaking when a sibling shrub load rejects", async () => {
    const shrubId = PLANT_SPECIES_CATALOG.shrubRecipes[0].id;
    const catalog = {
      assets: [],
      treeRecipes: [],
      shrubRecipes: [
        { id: shrubId, displayName: "Shrub A", materialFiles: { leaves: "a.mat" }, textures: [] },
        { id: shrubId, displayName: "Shrub B", materialFiles: { leaves: "b.mat" }, textures: [] }
      ]
    };
    const fakeEngine = {
      resourceManager: {
        load: vi.fn(async () => ({ data: catalog }))
      }
    } as unknown as Engine;
    const rootDestroy = vi.fn();
    const fakeRoot = {
      engine: fakeEngine,
      isActive: true,
      destroy: rootDestroy,
      createChild: vi.fn()
    };
    const fakeOwner = {
      engine: fakeEngine,
      createChild: vi.fn(() => fakeRoot)
    };

    const meshA0 = { destroy: vi.fn() } as unknown as ModelMesh;
    const meshA1 = { destroy: vi.fn() } as unknown as ModelMesh;
    const loadShrubSpy = vi
      .spyOn(ProceduralShrubSource, "loadCatalogShrubSource")
      .mockImplementation(async (_engine, descriptor) => {
        if (descriptor.displayName === "Shrub A") {
          return {
            lods: [
              { renderers: [{ mesh: meshA0 }, { mesh: meshA0 }] },
              { renderers: [{ mesh: meshA1 }] }
            ],
            lodGroup: { screenRelativeTransitionHeights: [0.5, 0.2] },
            geometryBounds: { min: [0, 0, 0], max: [1, 1, 1] }
          } as unknown as Awaited<ReturnType<typeof ProceduralShrubSource.loadCatalogShrubSource>>;
        }
        throw new Error("simulated shrub B load failure");
      });

    await expect(
      PlantSpeciesSources.load(
        fakeOwner as unknown as Parameters<typeof PlantSpeciesSources.load>[0],
        [0, 2, 3],
        new Set([shrubId])
      )
    ).rejects.toThrow("simulated shrub B load failure");

    expect(loadShrubSpy).toHaveBeenCalledTimes(2);
    // Every fulfilled shrub mesh must be destroyed exactly once (zero leaked GPU meshes).
    expect(meshA0.destroy).toHaveBeenCalledTimes(1);
    expect(meshA1.destroy).toHaveBeenCalledTimes(1);
    expect(rootDestroy).toHaveBeenCalledTimes(1);
  });
});
