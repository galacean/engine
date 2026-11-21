import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AssetType, BoxCollider, Loader, PhysicsMaterial, Script, SphereCollider, WebGLEngine } from "@galacean/engine";
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

  it("keeps shared materials alive for prefab instances and releases duplicate dependencies once", async () => {
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
        entities: [{ name: "PhysicsPrefab", components: [0, 1] }],
        components: [
          { type: "BoxCollider", props: { material: { $ref: 0 } } },
          { type: "SphereCollider", props: { material: { $ref: 0 } } }
        ]
      },
      "prefab"
    );
    const prefab = await engine.resourceManager.load<PrefabResource>(prefabUrl);
    const instance = prefab.instantiate();
    engine.sceneManager.activeScene.addRootEntity(instance);
    const material = instance.getComponent(BoxCollider)!.material;
    expect(instance.getComponent(SphereCollider)!.material).toBe(material);
    // The Prefab retains the template material. The Collider reference count covers the two instances.
    expect(material.refCount).toBe(2);
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

  it("releases a prefab material when a template script throws during destruction", async () => {
    const failure = new Error("template script failed to destroy");
    class ThrowingPrefabScript extends Script {
      override onDestroy(): void {
        throw failure;
      }
    }
    Loader.registerClass("ThrowingPrefabScript", ThrowingPrefabScript);

    const materialUrl = assetUrl({});
    const materialPath = "materials/throwing-prefab.physMat";
    engine.resourceManager.registerVirtualResources([
      { virtualPath: materialPath, path: materialUrl, type: AssetType.PhysicsMaterial }
    ]);
    const prefab = await engine.resourceManager.load<PrefabResource>(
      assetUrl(
        {
          version: "2.0",
          refs: [{ url: materialPath }],
          root: 0,
          entities: [{ components: [0, 1] }],
          components: [{ type: "BoxCollider", props: { material: { $ref: 0 } } }, { type: "ThrowingPrefabScript" }]
        },
        "prefab"
      )
    );
    const material = await engine.resourceManager.load<PhysicsMaterial>(materialUrl);
    expect(material.destroy()).toBe(false);
    expect(() => prefab.destroy()).toThrow(failure);
    expect(material.destroy()).toBe(true);
  });

  it.each([false, true])(
    "releases materials inherited through a nested prefab root (overrides: %s)",
    async (overrides) => {
      const materialUrl = assetUrl({});
      const materialPath = "materials/nested-root.physMat";
      const innerPath = "materials/nested-root.prefab";
      const innerUrl = assetUrl(
        {
          version: "2.0",
          refs: [{ url: materialPath }],
          root: 0,
          entities: [{ components: [0] }],
          components: [{ type: "BoxCollider", props: { material: { $ref: 0 } } }]
        },
        "prefab"
      );
      const resources = engine.resourceManager;
      resources.registerVirtualResources([
        { virtualPath: materialPath, path: materialUrl, type: AssetType.PhysicsMaterial },
        { virtualPath: innerPath, path: innerUrl, type: AssetType.Prefab }
      ]);
      const outer = await resources.load<PrefabResource>(
        assetUrl(
          {
            version: "2.0",
            refs: [{ url: innerPath }],
            root: 0,
            entities: [
              {
                instance: {
                  asset: 0,
                  overrides: overrides
                    ? {
                        componentProps: [
                          { path: [], selector: { type: "BoxCollider", index: 0 }, props: { material: null } }
                        ]
                      }
                    : undefined
                }
              }
            ],
            components: []
          },
          "prefab"
        )
      );
      const inner = await resources.load<PrefabResource>(innerPath);
      const material = await resources.load<PhysicsMaterial>(materialUrl);
      const instance = outer.instantiate();
      try {
        expect(instance.getComponent(BoxCollider)!.material).toBe(overrides ? null : material);
        expect(inner.destroy()).toBe(false);
        resources.gc();
        const sourceInstance = inner.instantiate();
        try {
          expect(sourceInstance.getComponent(BoxCollider)!.material).toBe(material);
          expect(material.destroyed).toBe(false);
        } finally {
          sourceInstance.destroy();
        }
      } finally {
        instance.destroy();
      }
      expect(outer.destroy()).toBe(true);
      expect(material.refCount).toBe(0);
      expect(inner.destroy()).toBe(true);
      expect(material.destroy()).toBe(true);
    }
  );

  it("releases a nested prefab created before its sibling asset fails to load", async () => {
    const materialUrl = assetUrl({});
    const materialPath = "materials/partial-prefab.physMat";
    const innerPath = "materials/partial-prefab.prefab";
    const missingPath = "materials/invalid-sibling.prefab";
    const resources = engine.resourceManager;
    const innerUrl = assetUrl(
      {
        version: "2.0",
        refs: [{ url: materialPath }],
        root: 0,
        entities: [{ children: [1] }, { components: [0] }],
        components: [{ type: "BoxCollider", props: { material: { $ref: 0 } } }]
      },
      "prefab"
    );
    resources.registerVirtualResources([
      { virtualPath: materialPath, path: materialUrl, type: AssetType.PhysicsMaterial },
      { virtualPath: innerPath, path: innerUrl, type: AssetType.Prefab },
      { virtualPath: missingPath, path: assetUrl({ version: "1.0" }, "prefab"), type: AssetType.Prefab }
    ]);
    const inner = await resources.load<PrefabResource>(innerPath);
    const material = await resources.load<PhysicsMaterial>(materialUrl);
    const outerUrl = assetUrl(
      {
        version: "2.0",
        refs: [{ url: innerPath }, { url: missingPath }],
        root: 0,
        entities: [{ children: [1, 2] }, { instance: { asset: 0 } }, { instance: { asset: 1 } }],
        components: []
      },
      "prefab"
    );

    await expect(resources.load<PrefabResource>(outerUrl)).rejects.toThrow("Unsupported prefab format version");
    expect(inner.destroy()).toBe(true);
    expect(material.destroy()).toBe(true);
  });

  it.each([false, true])("releases materials after prefab load failure (cached: %s)", async (cached) => {
    const failure = new Error("template call failed");
    class FailingTemplate extends Script {
      material: PhysicsMaterial;

      fail(): never {
        throw failure;
      }
    }
    Loader.registerClass("FailingTemplate", FailingTemplate);

    const materialUrl = assetUrl({});
    const materialPath = "materials/failed-prefab.physMat";
    engine.resourceManager.registerVirtualResources([
      { virtualPath: materialPath, path: materialUrl, type: AssetType.PhysicsMaterial }
    ]);
    const type = "FailingTemplate";
    const props = { material: { $ref: 0 } };
    const calls = [{ method: "fail" }];
    let nestedPath: string | undefined;
    if (cached) {
      await engine.resourceManager.load<PhysicsMaterial>(materialUrl);
    } else {
      const nestedUrl = assetUrl(
        {
          version: "2.0",
          refs: [],
          root: 0,
          entities: [{ components: [0], children: [1] }, { components: [1] }],
          components: [{ type }, { type: "BoxCollider" }]
        },
        "prefab"
      );
      nestedPath = "materials/failed-prefab-base.prefab";
      engine.resourceManager.registerVirtualResources([
        { virtualPath: nestedPath, path: nestedUrl, type: AssetType.Prefab }
      ]);
      await engine.resourceManager.load<PrefabResource>(nestedPath);
    }
    const prefabUrl = assetUrl(
      {
        version: "2.0",
        refs: [{ url: materialPath }, ...(nestedPath ? [{ url: nestedPath }] : [])],
        root: 0,
        entities: nestedPath
          ? [
              {
                instance: {
                  asset: 1,
                  overrides: {
                    componentProps: [
                      { path: [0], selector: { type: "BoxCollider", index: 0 }, props },
                      { path: [], selector: { type, index: 0 }, calls }
                    ]
                  }
                }
              }
            ]
          : [{ components: [0] }],
        components: nestedPath ? [] : [{ type, props, calls }]
      },
      "prefab"
    );

    await expect(engine.resourceManager.load<PrefabResource>(prefabUrl)).rejects.toThrow(failure);
    if (!cached) expect(engine.resourceManager.getFromCache(materialUrl)).toBeNull();
    const material = await engine.resourceManager.load<PhysicsMaterial>(materialUrl);
    expect(material.destroy()).toBe(true);
  });
});
