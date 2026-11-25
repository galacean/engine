import { AssetType, MeshRenderer, PBRMaterial, Texture2D } from "@galacean/engine";
import { expect, it, vi } from "vitest";
import { HeadlessEngine } from "../../../rhi-null/src/HeadlessEngine";
import { FARM_DEFINITIONS } from "../../src/farming/content/DefaultFarmingDefinitions";
import {
  farmingCatalogFromData,
  farmingResourceData,
  validateFarmingResourceFile
} from "../../src/farming/native/FarmingResources";
import { SoilVisualProvider } from "../../src/farming/presentation/soil/SoilVisualProvider";
import { plantGrowthRadius } from "../../src/farming/procedural/core/plantGrowthRadius";
import recipeMetadata from "../../src/farming/procedural/plant-recipe-metadata.json";
import { loadPlantGrowthDefinition } from "../../src/farming/procedural/runtime/loadPlantGrowthDefinition";

it("serializes built-in plant references and retains the exact radii and legacy inline recipes", async () => {
  const data = farmingResourceData(FARM_DEFINITIONS).catalog;
  expect(data.plants).toHaveLength(14);
  expect(data.plants.every((plant) => !("recipe" in plant))).toBe(true);
  const catalog = farmingCatalogFromData(JSON.parse(JSON.stringify(data)));
  for (const entry of catalog.plants) {
    if ("recipe" in entry) throw new Error("Expected a built-in recipe reference");
    const [a, b] = await Promise.all([loadPlantGrowthDefinition(entry), loadPlantGrowthDefinition(entry)]);
    expect(a).toBe(b);
    const metadata = recipeMetadata[entry.id as keyof typeof recipeMetadata];
    expect(a.recipe.revision).toBe(metadata.revision);
    expect(plantGrowthRadius(a.recipe)).toBe(metadata.radius);
    expect(metadata.requiresTintColors).toBe(
      a.recipe.volumes.some((part) => part.tint) || !!a.recipe.meshes?.some((part) => part.tint)
    );
    const { recipeRevision: _revision, ...legacy } = entry;
    const inline = farmingCatalogFromData({
      ...data,
      plants: data.plants.map((plant) =>
        plant.id === entry.id ? { ...legacy, recipe: { ...a.recipe, schemaVersion: 1, leafTemplates: [] } } : plant
      )
    });
    expect(await loadPlantGrowthDefinition(inline.getPlant(entry.id))).toEqual(a);
  }
});

it("requests fallback resources on first use and drops late texture results after disposal", async () => {
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const engine = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } });
  try {
    const root = engine.sceneManager.activeScene!.createRootEntity("Soil");
    const shaderMaterial = new PBRMaterial(engine);
    const soil = new SoilVisualProvider(engine, 1, shaderMaterial.shader);
    shaderMaterial.destroy(true);
    const pending: ((texture: Texture2D) => void)[] = [];
    const load = vi
      .spyOn(engine.resourceManager, "load")
      .mockImplementation(
        (() => new Promise<Texture2D>((resolve) => pending.push(resolve))) as typeof engine.resourceManager.load
      );
    const bed = root.createChild("Bed").addComponent(MeshRenderer);
    const border = root.createChild("Border").addComponent(MeshRenderer);
    expect(soil.ready).toBe(true);
    expect(load).not.toHaveBeenCalled();

    soil.apply(bed, 0.1);
    const mesh = bed.mesh!;
    soil.apply(bed, 0.2);
    expect(bed.mesh).toBe(mesh);
    expect(load).toHaveBeenCalledTimes(2);
    expect(soil.ready).toBe(false);
    const color = new Texture2D(engine, 4, 4);
    const normal = new Texture2D(engine, 4, 4);
    pending[0](color);
    await Promise.resolve();
    expect((bed.getMaterial() as PBRMaterial).baseTexture).toBe(color);
    expect(soil.ready).toBe(false);
    pending[1](normal);
    await Promise.resolve();
    expect((bed.getMaterial() as PBRMaterial).normalTexture).toBe(normal);
    expect(soil.ready).toBe(true);

    soil.applyPerimeter(border);
    const material = border.getMaterial()!;
    soil.applyPerimeter(border);
    expect(load).toHaveBeenCalledTimes(4);
    expect(load.mock.calls.every(([item]) => typeof item === "object" && item.type === AssetType.KTX2)).toBe(true);
    soil.dispose();
    expect(mesh.destroyed).toBe(true);
    expect(material.destroyed).toBe(true);
    expect(border.getMaterial()).toBeNull();
    expect(color.refCount).toBe(0);
    expect(normal.refCount).toBe(0);
    const late = new Texture2D(engine, 4, 4);
    pending[2](late);
    pending[3](late);
    await Promise.resolve();
    expect(late.refCount).toBe(0);
    expect(soil.loadedTextureCount).toBe(0);
    engine.resourceManager.gc();
    expect(late.destroyed).toBe(true);
  } finally {
    engine.destroy();
    vi.unstubAllGlobals();
  }
});

it("rejects recipe references without the tint colors required by their geometry", () => {
  const data = farmingResourceData(FARM_DEFINITIONS).catalog;
  const plants = data.plants.map((plant) => {
    if (plant.id !== "canola-farmlands") return plant;
    const { tintColors: _, ...material } = plant.material;
    return { ...plant, material };
  });
  expect(() => validateFarmingResourceFile({ version: 1, kind: "catalog", data: { ...data, plants } })).toThrow(
    "着色器官缺少颜色曲线"
  );
});

it("recovers missing maps on existing soil and perimeter after backoff", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const engine = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } });
  const shader = new PBRMaterial(engine);
  const soil = new SoilVisualProvider(engine, 1, shader.shader);
  shader.destroy(true);
  try {
    const scene = engine.sceneManager.activeScene!;
    const bed = scene.createRootEntity("Bed").addComponent(MeshRenderer);
    const perimeter = scene.createRootEntity("Perimeter").addComponent(MeshRenderer);
    const colors = new Map([
      ["basecolor.ktx2", new Texture2D(engine, 4, 4)],
      ["grass-mud-albedo-smoothness-1024.ktx2", new Texture2D(engine, 4, 4)]
    ]);
    const normals = new Map([
      ["normalogl.jpg", new Texture2D(engine, 4, 4)],
      ["grass-mud-normal-1024.png", new Texture2D(engine, 4, 4)]
    ]);
    let networkRecovered = false;
    const load = vi.spyOn(engine.resourceManager, "load").mockImplementation((async (item: {
      url: string;
      type: AssetType;
    }) => {
      const name = item.url.split("/").at(-1)!;
      const color = colors.get(name);
      if (color) return color;
      if (item.type === AssetType.Texture && networkRecovered && normals.has(name)) return normals.get(name)!;
      throw Error("Injected normal texture failure");
    }) as typeof engine.resourceManager.load);

    soil.apply(bed, 0.1);
    soil.applyPerimeter(perimeter);
    await vi.advanceTimersByTimeAsync(0);
    const bedMaterial = bed.getMaterial() as PBRMaterial;
    const perimeterMaterial = perimeter.getMaterial() as PBRMaterial;
    expect(load).toHaveBeenCalledTimes(6);
    expect(soil.loadError).toContain("normal");
    expect(bedMaterial.baseTexture).toBe(colors.get("basecolor.ktx2"));
    expect(perimeterMaterial.baseTexture).toBe(colors.get("grass-mud-albedo-smoothness-1024.ktx2"));

    for (let frame = 0; frame < 300; frame++) {
      soil.setMoisture(bed, frame % 2);
      soil.update(0.016);
      await vi.advanceTimersByTimeAsync(16);
    }
    expect(load).toHaveBeenCalledTimes(14);
    networkRecovered = true;
    await vi.advanceTimersByTimeAsync(2200);
    expect(soil.ready).toBe(true);
    expect(soil.loadError).toBeNull();
    expect(bedMaterial.normalTexture).toBe(normals.get("normalogl.jpg"));
    expect(perimeterMaterial.normalTexture).toBe(normals.get("grass-mud-normal-1024.png"));
    expect(load).toHaveBeenCalledTimes(18);
    for (const [item] of load.mock.calls) {
      if (typeof item === "object" && item.type === AssetType.Texture)
        expect(item.params).toMatchObject({ isSRGBColorSpace: false, mipmap: true });
    }

    networkRecovered = false;
    const other = new SoilVisualProvider(engine, 1);
    other.applyPerimeter(scene.createRootEntity("Pending").addComponent(MeshRenderer));
    await vi.advanceTimersByTimeAsync(0);
    expect(other.loadError).toContain("normal");
    const count = load.mock.calls.length;
    other.dispose();
    await vi.advanceTimersByTimeAsync(30000);
    expect(load).toHaveBeenCalledTimes(count);
  } finally {
    soil.dispose();
    engine.destroy();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it("P1-16: StorageContainerPresenter stops auto-retrying on update()/setDeferOffscreenLoad() after prefab load error while allowing explicit prepare() retry", async () => {
  const { Vector3 } = await import("@galacean/engine");
  const { StorageContainerPresenter } = await import("../../src/farming/presentation/storage/StorageContainerPresenter");
  const engine = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } });
  try {
    const parent = engine.sceneManager.activeScene!.createRootEntity("StorageRetryParent");
    let shouldFail = true;
    const fakePrefab = {
      instantiate: () => parent.scene!.createRootEntity("StoragePrefabInstance")
    };
    const loadSpy = vi.spyOn(engine.resourceManager, "load").mockImplementation((async () => {
      if (shouldFail) throw new Error("prefab fetch failed");
      return fakePrefab as any;
    }) as typeof engine.resourceManager.load);
    const viewerPos = new Vector3(0, 0, 0);
    const fakeService = {
      getSnapshot: () => ({
        farmId: "farm-retry",
        storage: {
          containers: [{ id: "cart-1", typeId: "cart", position: [5, 0, 0], yaw: 0, cropId: null, contents: [] }]
        }
      }),
      subscribe: () => () => {}
    } as any;
    const presenter = new StorageContainerPresenter(
      parent,
      fakeService,
      FARM_DEFINITIONS,
      () => viewerPos,
      false
    );

    await expect(presenter.prepare()).rejects.toThrow("prefab fetch failed");
    expect(presenter.snapshot().error).toContain("prefab fetch failed");
    const loadsAfterFailure = loadSpy.mock.calls.length;
    expect(loadsAfterFailure).toBe(2);

    // Subsequent update() frames and setDeferOffscreenLoad(false) must NOT storm failed loads.
    for (let i = 0; i < 5; i++) {
      presenter.update(0.016);
    }
    presenter.setDeferOffscreenLoad(false);
    expect(loadSpy).toHaveBeenCalledTimes(loadsAfterFailure);

    // Explicit prepare() clears this.error and retries cleanly once the network recovers.
    shouldFail = false;
    await presenter.prepare();
    expect(loadSpy).toHaveBeenCalledTimes(loadsAfterFailure + 2);
    expect(presenter.snapshot().error).toBeNull();
    expect(presenter.snapshot().ready).toBe(true);
    presenter.dispose();
  } finally {
    engine.destroy();
  }
});

it("StorageContainerPresenter reports ready when deferred beyond draw distance or empty and computes bitwise-stable foodPosition without uploading deferred meshes", async () => {
  const { ModelMesh, Vector3 } = await import("@galacean/engine");
  const { StorageContainerPresenter } = await import("../../src/farming/presentation/storage/StorageContainerPresenter");
  const engine = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } });
  try {
    const parent = engine.sceneManager.activeScene!.createRootEntity("StorageDeferredParent");
    const fakePrefab = {
      instantiate: () => parent.scene!.createRootEntity("StoragePrefabInstance")
    };
    const loadSpy = vi.spyOn(engine.resourceManager, "load").mockResolvedValue(fakePrefab as any);
    const uploadSpy = vi.spyOn(ModelMesh.prototype, "uploadData");
    const viewerPos = new Vector3(0, 0, 0);
    const wheat = FARM_DEFINITIONS.catalog.crops.find((c) => c.id === "wheat") ?? FARM_DEFINITIONS.catalog.crops[0];
    const rice = FARM_DEFINITIONS.catalog.crops.find((c) => c.id === "rice");
    const tomato = FARM_DEFINITIONS.catalog.crops.find((c) => c.id === "tomato");
    const cropId = wheat.id;
    const itemId = wheat.harvest.itemId;
    const containers = [
      {
        id: "cart-distant-yaw0",
        typeId: "cart",
        groundId: "ground-1",
        order: 1,
        position: [120, 4, -30] as [number, number, number],
        yaw: 0,
        cropId,
        itemId,
        quantity: 3
      },
      {
        id: "cart-distant",
        typeId: "cart",
        groundId: "ground-1",
        order: 2,
        position: [125, 4, -30] as [number, number, number],
        yaw: 90,
        cropId,
        itemId,
        quantity: 3,
        ...(rice ? { additionalContents: [{ cropId: rice.id, itemId: rice.harvest.itemId, quantity: 2 }] } : {})
      },
      ...(tomato
        ? [
            {
              id: "basket-distant",
              typeId: "basket",
              groundId: "ground-1",
              order: 3,
              position: [122, 4, -30] as [number, number, number],
              yaw: 0,
              cropId: tomato.id,
              itemId: tomato.harvest.itemId,
              quantity: 2
            }
          ]
        : [])
    ];
    const fakeService = {
      getSnapshot: () => ({
        farmId: "farm-distant",
        storage: { containers }
      }),
      subscribe: () => () => {}
    } as any;
    const presenter = new StorageContainerPresenter(
      parent,
      fakeService,
      FARM_DEFINITIONS,
      () => viewerPos,
      true,
      () => false
    );

    // Distant offscreen container (> 50m): prepare() skips prefab fetch, snapshot().ready stays true (not stuck pending).
    await presenter.prepare();
    expect(loadSpy).not.toHaveBeenCalled();
    expect(presenter.snapshot().ready).toBe(true);

    // Even after startup deferral is lifted while camera remains > 50m away, readiness stays true and foodPosition works on CPU without GPU mesh uploads.
    presenter.setDeferOffscreenLoad(false);
    presenter.update(0.016);
    expect(loadSpy).not.toHaveBeenCalled();
    expect(presenter.snapshot().ready).toBe(true);
    uploadSpy.mockClear();
    const analyticalCart0 = presenter.foodPosition("cart-distant-yaw0", cropId, itemId);
    const analyticalCart90 = presenter.foodPosition("cart-distant", cropId, itemId);
    const analyticalBasket = tomato ? presenter.foodPosition("basket-distant", tomato.id, tomato.harvest.itemId) : null;
    expect(analyticalCart0).not.toBeNull();
    expect(analyticalCart90).not.toBeNull();
    if (tomato) expect(analyticalBasket).not.toBeNull();
    expect(uploadSpy).not.toHaveBeenCalled();

    // Once player approaches within 50m and prefabs instantiate, materialized foodPosition is bitwise identical (===)
    // to satisfy PlanningAnimalFood strict equality guards.
    viewerPos.set(115, 4, -30);
    await presenter.prepare();
    expect(loadSpy).toHaveBeenCalledTimes(2);
    const materializedCart0 = presenter.foodPosition("cart-distant-yaw0", cropId, itemId);
    const materializedCart90 = presenter.foodPosition("cart-distant", cropId, itemId);
    expect(materializedCart0).toEqual(analyticalCart0);
    expect(materializedCart90).toEqual(analyticalCart90);
    if (tomato) {
      const materializedBasket = presenter.foodPosition("basket-distant", tomato.id, tomato.harvest.itemId);
      expect(materializedBasket).toEqual(analyticalBasket);
    }
    presenter.dispose();

    // Empty container farm reports ready without loading prefabs even when getViewerPosition is omitted or returns undefined.
    const emptyService = {
      getSnapshot: () => ({ farmId: "farm-empty", storage: { containers: [] } }),
      subscribe: () => () => {}
    } as any;
    loadSpy.mockClear();
    for (const getViewer of [undefined, () => undefined, () => viewerPos]) {
      const emptyPresenter = new StorageContainerPresenter(parent, emptyService, FARM_DEFINITIONS, getViewer, true);
      expect(emptyPresenter.snapshot().ready).toBe(true);
      await emptyPresenter.prepare();
      expect(loadSpy).not.toHaveBeenCalled();
      emptyPresenter.dispose();
    }
  } finally {
    engine.destroy();
  }
});
