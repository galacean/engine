import { expect, it } from "vitest";
import { BufferAsset, JSONAsset, Loader, UnlitMaterial, WebGLEngine } from "@galacean/engine";
import {
  WaterBodyComponent,
  WaterSystem,
  registerNativeWater,
  encodeWaterTerrainAssets,
  validateWaterAuthoringSettings,
  patchWaterQualitySettings,
  createWaterQualitySettings
} from "../src/water/native/index";
import { WaterBodyComponent as DirectWaterBody } from "../src/water/native/WaterBodyComponent";
import { lake, terrain } from "./WaterFixtures";

it("registers the existing constructors and exposes shared validation without changing defaults", () => {
  registerNativeWater();
  registerNativeWater();
  expect(WaterBodyComponent).toBe(DirectWaterBody);
  expect(Loader.getClass("WaterBodyComponent")).toBe(WaterBodyComponent);
  expect(Loader.getClass("WaterSystem")).toBe(WaterSystem);
  const quality = validateWaterAuthoringSettings({ shape: lake, terrain: { mode: "host" } });
  expect(quality).toEqual(createWaterQualitySettings("lake"));
  const patched = patchWaterQualitySettings("lake", quality, { reflectionBudget: { screenSpace: false } });
  expect(patched.reflectionBudget.screenSpace).toBe(false);
  expect(patched.reflectionBudget.environment).toBe(quality.reflectionBudget.environment);
  expect(quality.reflectionBudget.screenSpace).toBe(true);
});

it("clones author input independently and releases only its own borrowed material reference", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const material = new UnlitMaterial(engine);
    material.shaderData.setInt("material_WaterProfile", 0);
    material.shaderData.setInt("material_WaterRiverDrops", 0);
    const pair = encodeWaterTerrainAssets(terrain);
    const description = new JSONAsset(engine),
      heights = new BufferAsset(engine);
    description.data = pair.description;
    heights.buffer = pair.heights.buffer;
    const root = engine.sceneManager.activeScene.createRootEntity("Inactive author");
    root.isActive = false;
    const body = root.addComponent(WaterBodyComponent);
    const initialReferences = material.refCount;
    body.authoring = { shape: lake, terrain: { mode: "asset", description, heights }, material };
    const clone = root.clone();
    const copied = clone.getComponent(WaterBodyComponent)!;
    expect(material.refCount).toBe(initialReferences + 2);
    expect(copied.authoring!.material).toBe(material);
    expect(copied.authoring!.terrain).toEqual(body.authoring!.terrain);
    expect(copied.waterId).not.toBe(body.waterId);
    const draft = copied.authoring!;
    (draft.shape as { shoreline: { x: number }[] }).shoreline[0].x = 2;
    expect(body.authoring!.shape).toEqual(lake);
    expect(copied.authoring!.shape).toEqual(lake);
    await body.dispose();
    await body.dispose();
    expect(material.refCount).toBe(initialReferences + 1);
    expect(description.destroyed).toBe(false);
    expect(heights.destroyed).toBe(false);
    expect(material.destroyed).toBe(false);
    expect(copied.authoring!.shape).toEqual(lake);
    await copied.dispose();
    expect(material.refCount).toBe(initialReferences);
    expect(description.data).toEqual(pair.description);
    expect(heights.buffer.byteLength).toBe(pair.heights.byteLength);
    clone.destroy();
  } finally {
    engine.destroy();
  }
});
