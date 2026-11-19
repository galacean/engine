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
