import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AssetType, BoxCollider, PhysicsMaterial, WebGLEngine } from "@galacean/engine";
import { PrefabResource } from "@galacean/engine-loader";
import { createPhysics } from "../utils/physics";

const completeData = {
  bounciness: 0.3,
  staticFriction: 0.8,
  dynamicFriction: 0.4,
  bounceCombine: 1,
  frictionCombine: 3
};

describe("PhysicsMaterialLoader", () => {
  let engine: WebGLEngine;
  const physics = createPhysics();
  const urls: string[] = [];
  function assetUrl(data: unknown, extension = "physMat"): string {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    urls.push(url);
    return `${url}#asset.${extension}`;
  }
  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
  });
  afterEach(() => {
    engine.sceneManager.activeScene.rootEntities.slice().forEach((entity) => entity.destroy());
    engine.resourceManager.gc();
    urls.splice(0).forEach((url) => URL.revokeObjectURL(url));
    vi.restoreAllMocks();
  });
  afterAll(() => engine.destroy());

  it("preserves constructor defaults for omitted fields", async () => {
    const material = await engine.resourceManager.load<PhysicsMaterial>(assetUrl({ bounciness: 0.5 }));
    expect(material.bounciness).toBe(0.5);
    expect(material.staticFriction).toBe(0.6);
    expect(material.dynamicFriction).toBe(0.6);
    expect(material.bounceCombine).toBe(0);
    expect(material.frictionCombine).toBe(0);
    expect(material.engine).toBe(engine);
  });

  it("gives cached assets distinct identities and reloads after destruction", async () => {
    const url = assetUrl(completeData);
    const first = await engine.resourceManager.load<PhysicsMaterial>(url);
    const otherUrl = assetUrl({});
    const other = await engine.resourceManager.load<PhysicsMaterial>(otherUrl);
    expect(first.instanceId).not.toBe(other.instanceId);
    expect(engine.resourceManager.getAssetPath(first.instanceId)).toBe(url);
    expect(engine.resourceManager.getAssetPath(other.instanceId)).toBe(otherUrl);
    expect(await engine.resourceManager.load<PhysicsMaterial>(url)).toBe(first);
    expect(first.bounceCombine).toBe(1);
    expect(first.frictionCombine).toBe(3);
    first.destroy();
    expect(first.destroyed).toBe(true);
    expect(engine.resourceManager.getFromCache(url)).toBeNull();
    const replacement = await engine.resourceManager.load<PhysicsMaterial>(url);
    expect(replacement).not.toBe(first);
    expect(replacement.destroyed).toBe(false);
    expect(replacement.bounciness).toBe(0.3);
  });

  it("keeps a prefab material alive for prefab instances until destroyed", async () => {
    const materialUrl = assetUrl(completeData);
    const materialPath = "materials/shared-physics.physMat";
    engine.resourceManager.registerVirtualResources([
      { virtualPath: materialPath, path: materialUrl, type: AssetType.PhysicsMaterial }
    ]);
    const prefabUrl = assetUrl(
      {
        version: "2.0",
        refs: [{ url: materialPath }],
        root: 0,
        entities: [{ name: "PhysicsPrefab", components: [0] }],
        components: [{ type: "BoxCollider", props: { material: { $ref: 0 } } }]
      },
      "prefab"
    );
    const prefab = await engine.resourceManager.load<PrefabResource>(prefabUrl);
    const instance = prefab.instantiate();
    engine.sceneManager.activeScene.addRootEntity(instance);
    const material = instance.getComponent(BoxCollider)!.material!;
    expect(material.refCount).toBe(1);
    expect(prefab.destroy()).toBe(false);
    engine.resourceManager.gc();
    expect(material.destroyed).toBe(false);
    expect(material.destroy()).toBe(false);
    instance.destroy();
    expect(material.refCount).toBe(0);
    expect(prefab.destroy()).toBe(true);
    expect(material.refCount).toBe(0);
    expect(material.destroy()).toBe(true);
    expect(material.destroyed).toBe(true);
    expect(engine.resourceManager.getFromCache(materialUrl)).toBeNull();
  });
});
