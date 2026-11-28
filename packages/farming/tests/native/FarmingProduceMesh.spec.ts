import { PBRMaterial } from "@galacean/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeadlessEngine } from "../../../rhi-null/src/HeadlessEngine";
import { createBasketContentsMesh } from "../../src/farming/presentation/harvest/BasketContentsMesh";
import { createHarvestProduceMesh } from "../../src/farming/presentation/harvest/HarvestProduceMesh";
import { HARVEST_PRODUCE_IDS } from "../../src/farming/presentation/harvest/HarvestProduceShape";
import { ProceduralPlant } from "../../src/farming/procedural/runtime/ProceduralPlant";
import { rosetteRecipe } from "../fixtures/procedural-fixtures";

describe("PrimitiveMesh keepMeshData compatibility", () => {
  const engines: HeadlessEngine[] = [];

  beforeEach(() => {
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    for (const engine of engines.splice(0)) engine.destroy();
    vi.unstubAllGlobals();
  });

  it("builds harvest produce and basket meshes from readable primitive templates", async () => {
    const engine = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } });
    engines.push(engine);

    for (const cropId of HARVEST_PRODUCE_IDS) {
      const produced = createHarvestProduceMesh(engine, cropId, 2, false);
      expect(produced.mesh.vertexCount).toBeGreaterThan(0);
      expect(produced.mesh.getIndices()!.length).toBeGreaterThan(0);
      produced.mesh.destroy();
    }

    const basket = createBasketContentsMesh(engine, [
      { cropId: "wheat", itemId: "wheat-grain", quantity: 1 },
      { cropId: "carrot", itemId: "carrot-root", quantity: 1 },
      { cropId: "grapevine", itemId: "grapevine-fruit", quantity: 1 },
      { cropId: "rice", itemId: "rice-grain", quantity: 1 }
    ]);
    expect(basket.vertexCount).toBeGreaterThan(0);
    expect(basket.vertexCount).toBeLessThan(65536);
    basket.destroy();
  });

  it("builds ProceduralPlant support cuboids with readable vertex buffers", async () => {
    const engine = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } });
    engines.push(engine);

    const scene = engine.sceneManager.activeScene!;
    const parent = scene.createRootEntity("plant-parent");
    const material = new PBRMaterial(engine);
    const base = rosetteRecipe();
    const recipe = {
      ...base,
      supports: [{ id: "stake", center: [0, 0.5, 0] as const, size: [0.04, 1, 0.04] as const, uv: [0.1, 0.1] as const }]
    };

    const plant = new ProceduralPlant(recipe, engine, parent, material);
    expect(plant.support.children).toHaveLength(1);
    plant.dispose();
    material.destroy(true);
  });
});
