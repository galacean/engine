import { expect, beforeAll, afterAll, describe, it } from "vitest";
import { AssetType, WebGLEngine } from "@galacean/engine";
import {
  AssetPromise,
  DependentMode,
  Loader,
  MeshRenderer,
  Script,
  Transform,
  dependentComponents,
  resourceLoader
} from "@galacean/engine-core";
import type { PrefabResource } from "@galacean/engine-loader";
import { UICanvas, UITransform } from "@galacean/engine-ui";
import type { GLTFResource } from "../../../packages/loader/src/gltf/GLTFResource";
import { PrefabParser } from "../../../packages/loader/src/prefab/PrefabParser";
import type { PrefabFile } from "../../../packages/loader/src/schema/PrefabSchema";

let engine: WebGLEngine;

class DiceScript extends Script {
  skinMesh: MeshRenderer = null;
  numMesh: MeshRenderer = null;
}

class OverrideCallScript extends Script {
  value = "";
  receivedArgs: string[] = [];

  appendSuffix(suffix: string): void {
    this.value += suffix;
  }

  captureResolvedArgs(...args: string[]): void {
    this.receivedArgs = args;
  }
}

class ReferenceScript extends Script {
  target: ReferenceScript = null;
}

Loader.registerClass("MeshRenderer", MeshRenderer);
Loader.registerClass("DiceScript", DiceScript);
Loader.registerClass("OverrideCallScript", OverrideCallScript);
Loader.registerClass("ReferenceScript", ReferenceScript);

beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  engine = await WebGLEngine.create({ canvas });
});

afterAll(() => {
  engine?.destroy();
});

async function loadPrefab(data: PrefabFile): Promise<PrefabResource> {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  try {
    return await engine.resourceManager.load<PrefabResource>({ url, type: AssetType.Prefab });
  } finally {
    URL.revokeObjectURL(url);
  }
}

describe("Prefab mutation blocks", () => {
  it.each([false, true])(
    "resolves component references in authored order (prefab additions: %s)",
    async (additions) => {
      const baseType = "OrderedReferenceBase";
      const providerType = "OrderedReferenceProvider";
      const consumerType = "OrderedReferenceConsumer";
      class OrderedReferenceBase extends Script {
        label = "";
      }
      class OrderedReferenceProvider extends OrderedReferenceBase {}
      @dependentComponents(OrderedReferenceProvider, DependentMode.CheckOnly)
      class OrderedReferenceConsumer extends Script {
        target: OrderedReferenceBase;
      }
      Loader.registerClass(baseType, OrderedReferenceBase);
      Loader.registerClass(providerType, OrderedReferenceProvider);
      Loader.registerClass(consumerType, OrderedReferenceConsumer);

      const components = [
        {
          type: consumerType,
          props: { target: { $component: { entity: [0], type: baseType, index: 0 } } }
        },
        { type: baseType, props: { label: "base" } },
        { type: providerType, props: { label: "provider" } }
      ];
      const data: PrefabFile = { version: "2.0", refs: [], entities: [{ components: [0, 1, 2] }], components, root: 0 };
      let templateUrl: string;
      if (additions) {
        const templatePath = "ordered-components.prefab";
        templateUrl = URL.createObjectURL(
          new Blob([JSON.stringify({ ...data, entities: [{}], components: [] })], { type: "application/json" })
        );
        engine.resourceManager.registerVirtualResources([
          { virtualPath: templatePath, path: templateUrl, type: AssetType.Prefab }
        ]);
        data.refs = [{ url: templatePath }];
        data.entities = [
          {
            instance: {
              asset: 0,
              overrides: {
                addedComponents: [0, 1, 2].map((component) => ({ target: [], component })),
                componentProps: [
                  { path: [], selector: { type: baseType, index: 0 }, props: { label: "overridden base" } }
                ]
              }
            }
          }
        ];
      }
      try {
        const prefab = await loadPrefab(data);
        const instance = prefab.instantiate();
        try {
          const target = instance.getComponent(OrderedReferenceConsumer)!.target;
          expect(target.label).toBe(additions ? "overridden base" : "base");
          expect(instance.getComponent(OrderedReferenceProvider)!.label).toBe("provider");
        } finally {
          instance.destroy();
          prefab.destroy();
        }
      } finally {
        if (templateUrl) URL.revokeObjectURL(templateUrl);
      }
    }
  );

  it("resolves an automatic dependency when the instance removes an unrelated component", async () => {
    class RemovedTemplateScript extends Script {}
    class AutomaticProvider extends Script {}
    @dependentComponents(AutomaticProvider, DependentMode.AutoAdd)
    class AutomaticConsumer extends Script {
      target: AutomaticProvider;
    }
    Loader.registerClass("RemovedTemplateScript", RemovedTemplateScript);
    Loader.registerClass("AutomaticProvider", AutomaticProvider);
    Loader.registerClass("AutomaticConsumer", AutomaticConsumer);

    const template: PrefabFile = {
      version: "2.0",
      refs: [],
      root: 0,
      entities: [{ components: [0] }],
      components: [{ type: "RemovedTemplateScript" }]
    };
    const templatePath = "automatic-provider.prefab";
    const templateUrl = URL.createObjectURL(new Blob([JSON.stringify(template)], { type: "application/json" }));
    engine.resourceManager.registerVirtualResources([
      { virtualPath: templatePath, path: templateUrl, type: AssetType.Prefab }
    ]);
    try {
      const prefab = await loadPrefab({
        version: "2.0",
        refs: [{ url: templatePath }],
        root: 0,
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                removedComponents: [{ path: [], selectors: [{ type: "RemovedTemplateScript", index: 0 }] }],
                addedComponents: [{ target: [], component: 0 }]
              }
            }
          }
        ],
        components: [
          {
            type: "AutomaticConsumer",
            props: { target: { $component: { entity: [0], type: "AutomaticProvider", index: 0 } } }
          }
        ]
      });
      const instance = prefab.instantiate();
      try {
        const provider = instance.getComponent(AutomaticProvider);
        expect(provider).not.toBeNull();
        expect(instance.getComponent(AutomaticConsumer)!.target?.instanceId).toBe(provider!.instanceId);
        expect(instance.getComponent(RemovedTemplateScript)).toBeNull();
      } finally {
        instance.destroy();
        prefab.destroy();
      }
    } finally {
      URL.revokeObjectURL(templateUrl);
    }
  });

  it.each([false, true])("keeps the prefab Transform slot with UI (explicit: %s)", async (explicit) => {
    class TransformSlotObserver extends Script {
      label: string;
      observedTransform: Transform;
      survivor: TransformSlotObserver;
    }
    const observerType = "TransformSlotObserver";
    Loader.registerClass(observerType, TransformSlotObserver);
    Loader.registerClass("UICanvas", UICanvas);
    Loader.registerClass("UITransform", UITransform);

    const template: PrefabFile = {
      version: "2.0",
      refs: [],
      root: 0,
      entities: [{ components: [0, 1] }],
      components: [
        { type: observerType, props: { label: "removed" } },
        { type: observerType, props: { label: "survivor" } }
      ]
    };
    const templatePath = `transform-slot-${explicit}.prefab`;
    const templateUrl = URL.createObjectURL(new Blob([JSON.stringify(template)], { type: "application/json" }));
    engine.resourceManager.registerVirtualResources([
      { virtualPath: templatePath, path: templateUrl, type: AssetType.Prefab }
    ]);

    try {
      const components = [
        { type: "UICanvas" },
        ...(explicit ? [{ type: "UITransform" }] : []),
        {
          type: observerType,
          props: {
            observedTransform: { $component: { entity: [0], type: "Transform", index: 0 } },
            survivor: { $component: { entity: [0], type: observerType, index: 1 } }
          }
        }
      ];
      const prefab = await loadPrefab({
        ...template,
        refs: [{ url: templatePath }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                removedComponents: [{ path: [], selectors: [{ type: observerType, index: 0 }] }],
                addedComponents: components.map((_, component) => ({ target: [], component })),
                componentProps: [{ path: [], selector: { type: observerType, index: 2 }, props: { label: "added" } }]
              }
            }
          }
        ],
        components
      });
      const instance = prefab.instantiate();
      try {
        const [survivor, observer] = instance.getComponents(TransformSlotObserver, []);
        expect([survivor.label, observer.label]).toEqual(["survivor", "added"]);
        expect(observer.survivor).toBe(survivor);
        expect(instance.transform).toBeInstanceOf(UITransform);
        expect(observer.observedTransform?.instanceId).toBe(instance.transform.instanceId);
      } finally {
        instance.destroy();
        prefab.destroy();
      }
    } finally {
      URL.revokeObjectURL(templateUrl);
    }
  });

  it.each([false, true])("handles started property rejections when a setter throws (nested: %s)", async (nested) => {
    const failure = new Error("prefab property setter failed");
    class RejectingProperties extends Script {
      state = {
        set invalid(_value: boolean) {
          throw failure;
        }
      };

      set invalid(_value: boolean) {
        throw failure;
      }
    }
    Loader.registerClass("RejectingProperties", RejectingProperties);
    const props = { resource: { $ref: 0 }, invalid: true };

    await expect(
      loadPrefab({
        version: "2.0",
        refs: [],
        root: 0,
        entities: [{ components: [0] }],
        components: [{ type: "RejectingProperties", props: nested ? { state: props } : props }]
      })
    ).rejects.toThrow(failure);
  });

  it("applies result blocks to plain objects with a destroyed property", async () => {
    const results: number[] = [];
    class ReturnsObject extends Script {
      createResult() {
        return {
          destroyed: true,
          value: 0,
          report() {
            results.push(this.value);
          }
        };
      }
    }
    Loader.registerClass("ReturnsObject", ReturnsObject);

    const prefab = await loadPrefab({
      version: "2.0",
      refs: [],
      root: 0,
      entities: [{ components: [0] }],
      components: [
        {
          type: "ReturnsObject",
          calls: [{ method: "createResult", result: { props: { value: 42 }, calls: [{ method: "report" }] } }]
        }
      ]
    });
    try {
      expect(results).toEqual([42]);
    } finally {
      prefab.destroy();
    }
  });
});

describe("PrefabResource refCount", () => {
  it("rejects loading a prefab with an unsupported version", async () => {
    const prefabData = {
      version: "1.0",
      refs: [],
      entities: [{ name: "root" }],
      components: [],
      root: 0
    } as any;

    await expect(loadPrefab(prefabData)).rejects.toThrow('Unsupported prefab format version "1.0". Expected "2.0".');
  });

  it("should increase and decrease with instantiated entities", async () => {
    const prefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", children: [1] }, { name: "child" }],
      components: [],
      root: 0
    };

    const prefab = await PrefabParser.parse(engine, "prefab.json", prefabData);

    expect(prefab.refCount).toBe(0);

    const instance1 = prefab.instantiate();
    const instance2 = prefab.instantiate();

    // One ref count per templated entity in each instance (root + child).
    expect(prefab.refCount).toBe(4);

    instance1.destroy();
    expect(prefab.refCount).toBe(2);

    instance2.destroy();
    expect(prefab.refCount).toBe(0);
  });

  it("should support destroy then re-instantiate cycle", async () => {
    const prefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", children: [1] }, { name: "child" }],
      components: [],
      root: 0
    };

    const prefab = await PrefabParser.parse(engine, "lifecycle.prefab", prefabData);

    // First cycle: instantiate → destroy
    const instance1 = prefab.instantiate();
    expect(instance1.name).toBe("root");
    expect(instance1.children[0].name).toBe("child");
    expect(prefab.refCount).toBe(2);

    instance1.destroy();
    expect(prefab.refCount).toBe(0);

    // Second cycle: re-instantiate from same prefab
    const instance2 = prefab.instantiate();
    expect(instance2.name).toBe("root");
    expect(instance2.children[0].name).toBe("child");
    expect(prefab.refCount).toBe(2);

    // Verify independence from destroyed instance
    expect(instance2).not.toBe(instance1);

    instance2.destroy();
    expect(prefab.refCount).toBe(0);
  });

  it("should count instances when prefab root comes from a nested prefab instance", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "nestedRoot", children: [1] }, { name: "nestedChild" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-root-instance.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-root-instance.prefab"] = nestedPrefab;

    try {
      const outerPrefabData: PrefabFile = {
        version: "2.0",
        refs: [{ url: "nested-root-instance.prefab" }],
        entities: [{ instance: { asset: 0 } }],
        components: [],
        root: 0
      };

      const outerPrefab = await PrefabParser.parse(engine, "outer-root-instance.prefab", outerPrefabData);

      expect(outerPrefab.refCount).toBe(0);

      const instance1 = outerPrefab.instantiate();
      const instance2 = outerPrefab.instantiate();

      expect(outerPrefab.refCount).toBe(2);

      instance1.destroy();
      expect(outerPrefab.refCount).toBe(1);

      instance2.destroy();
      expect(outerPrefab.refCount).toBe(0);
    } finally {
      // @ts-ignore
      delete engine.resourceManager._objectPool["nested-root-instance.prefab"];
    }
  });

  it("releases a glTF source after destroying its prefab template", async () => {
    const sourcePath = "nested-template.gltf";
    const sourceData = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }] };
    const sourceUrl = URL.createObjectURL(new Blob([JSON.stringify(sourceData)], { type: "model/gltf+json" }));
    const resources = engine.resourceManager;
    resources.registerVirtualResources([{ virtualPath: sourcePath, path: sourceUrl, type: AssetType.GLTF }]);

    let source: GLTFResource;
    let prefab: PrefabResource;
    try {
      source = await resources.load<GLTFResource>(sourcePath);
      prefab = await loadPrefab({
        version: "2.0",
        refs: [{ url: sourcePath }],
        entities: [{ instance: { asset: 0 } }],
        components: [],
        root: 0
      });
      expect(source.destroy()).toBe(false);
      expect(prefab.destroy()).toBe(true);
      expect(source.refCount).toBe(0);
      resources.gc();
      expect(source.destroyed).toBe(true);
    } finally {
      prefab?.destroy();
      source?.destroy();
      URL.revokeObjectURL(sourceUrl);
    }
  });
});

describe("Missing Prefab references", () => {
  it("resolves a missing asset to null and releases the prefab", async () => {
    const prefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "missing-asset.png" }],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "DiceScript", props: { skinMesh: { $ref: 0 } } }],
      root: 0
    };

    const prefab = await loadPrefab(prefabData);
    const root = prefab.instantiate();
    try {
      expect(root.getComponent(DiceScript)!.skinMesh).toBeNull();
    } finally {
      root.destroy();
      expect(prefab.destroy()).toBe(true);
    }
  });
});

describe("Prefab instance overrides", () => {
  it("should throw a clear error when prefab instance asset ref index is out of range", async () => {
    const prefabData = {
      version: "2.0",
      refs: [],
      entities: [{ name: "outerRoot", children: [1] }, { instance: { asset: 0 } }],
      components: [],
      root: 0
    } as any;

    await expect(PrefabParser.parse(engine, "invalid-ref.prefab", prefabData)).rejects.toThrow(
      "HierarchyParser: invalid ref index 0 for instance.asset"
    );
  });

  it("should apply entityProps overrides to nested prefab entities", async () => {
    // Nested prefab: root → child
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "originalRoot", children: [1] }, { name: "originalChild" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested.prefab"] = nestedPrefab;

    // Outer prefab with instance overrides: rename child entity
    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "nested.prefab" }],
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: 0,
            overrides: {
              entityProps: [
                { path: [], name: "renamedRoot" },
                { path: [0], name: "renamedChild", isActive: false }
              ]
            }
          }
        }
      ],
      components: [],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const instanceEntity = root.children[0];
    expect(instanceEntity.name).toBe("renamedRoot");
    expect(instanceEntity.children[0].name).toBe("renamedChild");
    expect(instanceEntity.children[0].isActive).toBe(false);

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested.prefab"];
  });

  it("should override component props via componentProps", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "MeshRenderer" }],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-cp.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-cp.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "nested-cp.prefab" }],
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: 0,
            overrides: {
              componentProps: [{ path: [], selector: { type: "MeshRenderer", index: 0 }, props: { enabled: false } }]
            }
          }
        }
      ],
      components: [],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer-cp.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const instanceEntity = root.children[0];
    const meshRenderer = instanceEntity.getComponent(MeshRenderer);
    expect(meshRenderer.enabled).toBe(false);

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-cp.prefab"];
  });

  it("should apply component override props and calls from the same schema", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "OverrideCallScript" }],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-calls.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-calls.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "nested-calls.prefab" }],
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: 0,
            overrides: {
              componentProps: [
                {
                  path: [],
                  selector: { type: "OverrideCallScript", index: 0 },
                  props: { value: "base" },
                  calls: [{ method: "captureResolvedArgs", args: ["override"] }]
                }
              ]
            }
          }
        }
      ],
      components: [],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer-calls.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const instanceEntity = root.children[0];
    const overrideScript = instanceEntity.getComponent(OverrideCallScript);
    expect(overrideScript.value).toBe("base");
    expect(overrideScript.receivedArgs).toEqual(["override"]);

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-calls.prefab"];
  });

  it("should add components via addedComponents", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-ac.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-ac.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "nested-ac.prefab" }],
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: 0,
            overrides: {
              addedComponents: [{ target: [], component: 0 }]
            }
          }
        }
      ],
      components: [
        {
          type: "OverrideCallScript",
          props: { value: "base" },
          calls: [{ method: "captureResolvedArgs", args: ["added"] }]
        }
      ],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer-ac.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const instanceEntity = root.children[0];
    const overrideScript = instanceEntity.getComponent(OverrideCallScript);
    expect(overrideScript).not.toBeNull();
    expect(overrideScript.value).toBe("base");
    expect(overrideScript.receivedArgs).toEqual(["added"]);

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-ac.prefab"];
  });

  it.each([false, true])(
    "resolves forward and cyclic references to added components before removals (%s)",
    async (removeOriginal) => {
      const url = `nested-component-refs-${removeOriginal}.prefab`;
      const nested = await PrefabParser.parse(engine, url, {
        version: "2.0",
        refs: [],
        root: 0,
        entities: [{ components: [0] }],
        components: [{ type: "ReferenceScript" }]
      });
      // @ts-ignore
      engine.resourceManager._objectPool[url] = nested;
      const ref = (entity: number) => ({ $component: { entity: [entity], type: "ReferenceScript", index: 1 } });
      const instance = (component: number) => ({
        instance: {
          asset: 0,
          overrides: {
            addedComponents: [{ target: [], component }],
            ...(removeOriginal
              ? { removedComponents: [{ path: [], selectors: [{ type: "ReferenceScript", index: 0 }] }] }
              : {})
          }
        }
      });
      try {
        const prefab = await PrefabParser.parse(engine, "component-refs.prefab", {
          version: "2.0",
          refs: [{ url }],
          root: 0,
          entities: [{ children: [1, 2], components: [0] }, instance(1), instance(2)],
          components: [
            { type: "ReferenceScript", props: { target: ref(2) } },
            { type: "ReferenceScript", props: { target: ref(2) } },
            { type: "ReferenceScript", props: { target: ref(1) } }
          ]
        });
        const root = prefab.instantiate();
        try {
          const index = removeOriginal ? 0 : 1;
          const first = root.children[0].getComponents(ReferenceScript, [])[index];
          const second = root.children[1].getComponents(ReferenceScript, [])[index];
          expect(root.getComponent(ReferenceScript).target).toBe(second);
          expect(first.target).toBe(second);
          expect(second.target).toBe(first);
        } finally {
          root.destroy();
        }
      } finally {
        // @ts-ignore
        delete engine.resourceManager._objectPool[url];
      }
    }
  );

  it("should add entities via addedEntities", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-ae.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-ae.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "nested-ae.prefab" }],
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: 0,
            overrides: {
              addedEntities: [{ parent: [] as number[], entity: 2 }]
            }
          }
        },
        {
          name: "addedChild",
          position: [1, 2, 3] as [number, number, number],
          components: [0]
        }
      ],
      components: [
        {
          type: "OverrideCallScript",
          props: { value: "base" },
          calls: [{ method: "captureResolvedArgs", args: ["inline"] }]
        }
      ],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer-ae.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const instanceEntity = root.children[0];
    expect(instanceEntity.children.length).toBe(1);
    const addedChild = instanceEntity.children[0];
    expect(addedChild.name).toBe("addedChild");
    expect(addedChild.transform.position.x).toBe(1);
    expect(addedChild.transform.position.y).toBe(2);
    expect(addedChild.transform.position.z).toBe(3);
    const overrideScript = addedChild.getComponent(OverrideCallScript);
    expect(overrideScript.value).toBe("base");
    expect(overrideScript.receivedArgs).toEqual(["inline"]);

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-ae.prefab"];
  });

  it("applies sequential additions and removals beneath an added prefab entity", async () => {
    const templatePath = "sequential-added-entities.prefab";
    const template: PrefabFile = { version: "2.0", refs: [], root: 0, entities: [{}], components: [] };
    const templateUrl = URL.createObjectURL(new Blob([JSON.stringify(template)], { type: "application/json" }));
    engine.resourceManager.registerVirtualResources([
      { virtualPath: templatePath, path: templateUrl, type: AssetType.Prefab }
    ]);

    let prefab: PrefabResource | undefined;
    try {
      prefab = await loadPrefab({
        version: "2.0",
        refs: [{ url: templatePath }],
        root: 0,
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                addedEntities: [
                  { parent: [], entity: 1 },
                  { parent: [0], entity: 2 },
                  { parent: [0], entity: 3 }
                ],
                removedEntities: [[0, 0]]
              }
            }
          },
          { name: "branch" },
          { name: "removed" },
          { name: "survivor" }
        ],
        components: []
      });
      const instance = prefab.instantiate();
      try {
        expect(instance.children.map((child) => [child.name, ...child.children.map((leaf) => leaf.name)])).toEqual([
          ["branch", "survivor"]
        ]);
      } finally {
        instance.destroy();
      }
    } finally {
      prefab?.destroy();
      URL.revokeObjectURL(templateUrl);
    }
  });

  it("should remove entities via removedEntities", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", children: [1] }, { name: "child" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-re.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-re.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "nested-re.prefab" }],
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: 0,
            overrides: {
              removedEntities: [[0]]
            }
          }
        }
      ],
      components: [],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer-re.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const instanceEntity = root.children[0];
    expect(instanceEntity.children.length).toBe(0);

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-re.prefab"];
  });

  it("should remove multiple sibling entities via removedEntities", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", children: [1, 2, 3] }, { name: "A" }, { name: "B" }, { name: "C" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-re-multi.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-re-multi.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "nested-re-multi.prefab" }],
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: 0,
            overrides: {
              removedEntities: [[0], [2]]
            }
          }
        }
      ],
      components: [],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer-re-multi.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const instanceEntity = root.children[0];
    expect(instanceEntity.children.length).toBe(1);
    expect(instanceEntity.children[0].name).toBe("B");

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-re-multi.prefab"];
  });

  it("should remove multiple components of same type via removedComponents", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0, 1, 2] }],
      components: [{ type: "MeshRenderer" }, { type: "MeshRenderer" }, { type: "MeshRenderer" }],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-rc-multi.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-rc-multi.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "nested-rc-multi.prefab" }],
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: 0,
            overrides: {
              removedComponents: [
                {
                  path: [],
                  selectors: [
                    { type: "MeshRenderer", index: 0 },
                    { type: "MeshRenderer", index: 2 }
                  ]
                }
              ]
            }
          }
        }
      ],
      components: [],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer-rc-multi.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const instanceEntity = root.children[0];
    const buffer: MeshRenderer[] = [];
    instanceEntity.getComponents(MeshRenderer, buffer);
    expect(buffer.length).toBe(1);

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-rc-multi.prefab"];
  });

  it("should remove components via removedComponents", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "MeshRenderer" }],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-rc.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-rc.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "nested-rc.prefab" }],
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: 0,
            overrides: {
              removedComponents: [{ path: [], selectors: [{ type: "MeshRenderer", index: 0 }] }]
            }
          }
        }
      ],
      components: [],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer-rc.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const instanceEntity = root.children[0];
    const meshRenderer = instanceEntity.getComponent(MeshRenderer);
    expect(meshRenderer).toBeNull();

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-rc.prefab"];
  });
});

describe("Cross-prefab $component ref", () => {
  it("should resolve component ref inside nested prefab instance", async () => {
    // 1. nested prefab (dice.prefab): single root entity with MeshRenderer
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "diceRoot", components: [0] }],
      components: [{ type: "MeshRenderer" }],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "dice.prefab", nestedPrefabData);
    // @ts-ignore — register to resourceManager so getResourceByRef can find it
    engine.resourceManager._objectPool["dice.prefab"] = nestedPrefab;

    // 2. outer prefab (DiceNode.prefab)
    //    Entity 0: DiceNode (root) — has DiceScript referencing entity 1's MeshRenderer
    //    Entity 1: dice (nested prefab instance)
    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "dice.prefab" }],
      entities: [
        { name: "DiceNode", children: [1], components: [0] },
        {
          instance: {
            asset: 0,
            overrides: { entityProps: [{ path: [], name: "dice" }] }
          }
        }
      ],
      components: [
        {
          type: "DiceScript",
          props: {
            skinMesh: { $component: { entity: [1], type: "MeshRenderer", index: 0 } }
          }
        }
      ],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "DiceNode.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();
    const script = root.getComponent(DiceScript);

    // skinMesh should point to the MeshRenderer inside nested prefab instance
    expect(script.skinMesh).not.toBeNull();
    expect(script.skinMesh).toBeInstanceOf(MeshRenderer);
    expect(script.skinMesh.entity.name).toBe("dice");

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["dice.prefab"];
  });

  it("should resolve both local and cross-prefab refs, and survive clone independently", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "diceRoot", components: [0] }],
      components: [{ type: "MeshRenderer" }],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "dice.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["dice.prefab"] = nestedPrefab;

    // Entity 0: DiceNode (root) — DiceScript with numMesh + skinMesh
    // Entity 1: numCube — local entity with MeshRenderer
    // Entity 2: dice — nested prefab instance
    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "dice.prefab" }],
      entities: [
        { name: "DiceNode", children: [1, 2], components: [0] },
        { name: "numCube", components: [1] },
        {
          instance: {
            asset: 0,
            overrides: { entityProps: [{ path: [], name: "dice" }] }
          }
        }
      ],
      components: [
        {
          type: "DiceScript",
          props: {
            numMesh: { $component: { entity: [1], type: "MeshRenderer", index: 0 } },
            skinMesh: { $component: { entity: [2], type: "MeshRenderer", index: 0 } }
          }
        },
        { type: "MeshRenderer" }
      ],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "DiceNode.prefab", outerPrefabData);

    const instance1 = outerPrefab.instantiate();
    const instance2 = outerPrefab.instantiate();

    const script1 = instance1.getComponent(DiceScript);
    const script2 = instance2.getComponent(DiceScript);

    // instance1: numMesh -> numCube's MeshRenderer, skinMesh -> dice's MeshRenderer
    const numMesh1 = instance1.children[0].getComponent(MeshRenderer);
    const skinMesh1 = instance1.children[1].getComponent(MeshRenderer);
    expect(script1.numMesh).toBe(numMesh1);
    expect(script1.skinMesh).toBe(skinMesh1);

    // instance2: independent refs
    const numMesh2 = instance2.children[0].getComponent(MeshRenderer);
    const skinMesh2 = instance2.children[1].getComponent(MeshRenderer);
    expect(script2.numMesh).toBe(numMesh2);
    expect(script2.skinMesh).toBe(skinMesh2);

    // refs across instances are independent
    expect(script1.numMesh).not.toBe(script2.numMesh);
    expect(script1.skinMesh).not.toBe(script2.skinMesh);

    instance1.destroy();
    instance2.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["dice.prefab"];
  });

  it("should resolve $entity into prefab instance deep child", async () => {
    // nested prefab: root with a child "inner"
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [{ name: "nestedRoot", children: [1] }, { name: "inner" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "deep-entity-nested.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["deep-entity-nested.prefab"] = nestedPrefab;

    // outer prefab: DiceScript.skinMesh is Entity (we reuse skinMesh field as any Entity holder via getComponent)
    // We need a script holding an Entity ref — reuse OverrideCallScript? It doesn't have an Entity field.
    // Use DiceScript but expose a targetEntity through a separate Script below.
    class EntityRefScript extends Script {
      target: Entity = null;
    }
    Loader.registerClass("EntityRefScript", EntityRefScript);

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "deep-entity-nested.prefab" }],
      entities: [{ name: "outerRoot", children: [1], components: [0] }, { instance: { asset: 0 } }],
      components: [
        {
          type: "EntityRefScript",
          props: {
            // Reference entities[1]'s child at path [0] — the "inner" entity inside the prefab instance
            target: { $entity: [1, 0] }
          }
        }
      ],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "deep-entity-outer.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();
    const script = root.getComponent(EntityRefScript);

    expect(script.target).not.toBeNull();
    expect(script.target.name).toBe("inner");
    // Confirm it's really the child inside the prefab instance
    expect(script.target.parent).toBe(root.children[0]);

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["deep-entity-nested.prefab"];
  });

  it("should resolve $component into prefab instance deep child component", async () => {
    // nested prefab: root with child "inner" holding a MeshRenderer
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      refs: [],
      entities: [
        { name: "nestedRoot", children: [1] },
        { name: "inner", components: [0] }
      ],
      components: [{ type: "MeshRenderer" }],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "deep-comp-nested.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["deep-comp-nested.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "deep-comp-nested.prefab" }],
      entities: [{ name: "outerRoot", children: [1], components: [0] }, { instance: { asset: 0 } }],
      components: [
        {
          type: "DiceScript",
          props: {
            // Reference the MeshRenderer on the "inner" entity inside the prefab instance
            skinMesh: { $component: { entity: [1, 0], type: "MeshRenderer", index: 0 } }
          }
        }
      ],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "deep-comp-outer.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();
    const script = root.getComponent(DiceScript);

    const innerEntity = root.children[0].children[0];
    const innerMeshRenderer = innerEntity.getComponent(MeshRenderer);
    expect(script.skinMesh).toBe(innerMeshRenderer);

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["deep-comp-nested.prefab"];
  });

  it("should preserve base.calls state boundary when merging same-target component overrides", async () => {
    class StateCaptureScript extends Script {
      value = 0;
      captured: number[] = [];
      capture(): void {
        this.captured.push(this.value);
      }
    }
    Loader.registerClass("StateCaptureScript", StateCaptureScript);

    const basePrefab = await PrefabParser.parse(engine, "calls-boundary-base.prefab", {
      version: "2.0",
      refs: [],
      entities: [{ name: "root" }],
      components: [],
      root: 0
    });
    // @ts-ignore
    engine.resourceManager._objectPool["calls-boundary-base.prefab"] = basePrefab;

    try {
      // Case A: base { props: { value: 1 }, calls: [capture] } + override { props: { value: 2 }, calls: [capture] } => [1, 2]
      // Case B: base { props: { value: 10 }, calls: [capture] } + override { props: { value: 20 } } => [10], value === 20
      // Case C: base { props: { value: 100 } } + override { props: { value: 200 }, calls: [capture] } => [200], value === 200
      const outerPrefab = await PrefabParser.parse(engine, "calls-boundary-outer.prefab", {
        version: "2.0",
        refs: [{ url: "calls-boundary-base.prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                addedComponents: [
                  { target: [], component: 0 },
                  { target: [], component: 1 },
                  { target: [], component: 2 }
                ],
                componentProps: [
                  {
                    path: [],
                    selector: { type: "StateCaptureScript", index: 0 },
                    props: { value: 2 },
                    calls: [{ method: "capture" }]
                  },
                  {
                    path: [],
                    selector: { type: "StateCaptureScript", index: 1 },
                    props: { value: 20 }
                  },
                  {
                    path: [],
                    selector: { type: "StateCaptureScript", index: 2 },
                    props: { value: 200 },
                    calls: [{ method: "capture" }]
                  }
                ]
              }
            }
          }
        ],
        components: [
          { type: "StateCaptureScript", props: { value: 1 }, calls: [{ method: "capture" }] },
          { type: "StateCaptureScript", props: { value: 10 }, calls: [{ method: "capture" }] },
          { type: "StateCaptureScript", props: { value: 100 } }
        ],
        root: 0
      });

      const root = outerPrefab.instantiate();
      try {
        const scripts = root.getComponents(StateCaptureScript, []);
        expect(scripts).toHaveLength(3);
        expect(scripts[0].captured).toEqual([1, 2]);
        expect(scripts[0].value).toBe(2);
        expect(scripts[1].captured).toEqual([10]);
        expect(scripts[1].value).toBe(20);
        expect(scripts[2].captured).toEqual([200]);
        expect(scripts[2].value).toBe(200);
      } finally {
        root.destroy();
      }
    } finally {
      // @ts-ignore
      delete engine.resourceManager._objectPool["calls-boundary-base.prefab"];
    }
  });

  it("should await cross-component async base calls before executing override calls and props", async () => {
    class AsyncProviderScript extends Script {
      ready = false;
      initAsync(): Promise<void> {
        return new Promise((resolve) => {
          setTimeout(() => {
            this.ready = true;
            resolve();
          }, 10);
        });
      }
    }
    class AsyncConsumerScript extends Script {
      observedReady = false;
      observe(provider: AsyncProviderScript): void {
        this.observedReady = provider.ready;
      }
    }
    class AsyncPropObserverScript extends Script {
      provider: AsyncProviderScript | null = null;
      observedReady = false;
      set trigger(_v: boolean) {
        this.observedReady = !!this.provider?.ready;
      }
    }
    Loader.registerClass("AsyncProviderScript", AsyncProviderScript);
    Loader.registerClass("AsyncConsumerScript", AsyncConsumerScript);
    Loader.registerClass("AsyncPropObserverScript", AsyncPropObserverScript);

    const basePrefab = await PrefabParser.parse(engine, "async-barrier-base.prefab", {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "AsyncConsumerScript" }],
      root: 0
    });
    // @ts-ignore
    engine.resourceManager._objectPool["async-barrier-base.prefab"] = basePrefab;

    try {
      const outerPrefab = await PrefabParser.parse(engine, "async-barrier-outer.prefab", {
        version: "2.0",
        refs: [{ url: "async-barrier-base.prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                addedComponents: [
                  { target: [], component: 0 },
                  { target: [], component: 1 }
                ],
                componentProps: [
                  {
                    path: [],
                    selector: { type: "AsyncConsumerScript", index: 0 },
                    calls: [
                      {
                        method: "observe",
                        args: [{ $component: { entity: [0], type: "AsyncProviderScript", index: 0 } }]
                      }
                    ]
                  },
                  {
                    path: [],
                    selector: { type: "AsyncPropObserverScript", index: 0 },
                    props: { trigger: true }
                  }
                ]
              }
            }
          }
        ],
        components: [
          { type: "AsyncProviderScript", calls: [{ method: "initAsync" }] },
          {
            type: "AsyncPropObserverScript",
            props: { provider: { $component: { entity: [0], type: "AsyncProviderScript", index: 0 } } }
          }
        ],
        root: 0
      });

      const root = outerPrefab.instantiate();
      try {
        const provider = root.getComponent(AsyncProviderScript)!;
        const consumer = root.getComponent(AsyncConsumerScript)!;
        const propObserver = root.getComponent(AsyncPropObserverScript)!;
        expect(provider.ready).toBe(true);
        expect(consumer.observedReady).toBe(true);
        expect(propObserver.observedReady).toBe(true);
      } finally {
        root.destroy();
      }
    } finally {
      // @ts-ignore
      delete engine.resourceManager._objectPool["async-barrier-base.prefab"];
    }
  });

  it("should keep setter side effects independent of unrelated base calls and skip overrides on components destroyed during Wave 0", async () => {
    const seen: string[] = [];
    class SideEffectObserver extends Script {
      set label(v: string) {
        seen.push(v);
      }
      noop(): void {}
      destroySibling(): void {
        this.entity.getComponents(SideEffectObserver, [])[1].destroy();
      }
      probeDestroyed(): void {
        seen.push(`destroyed=${this.destroyed}`);
      }
    }
    Loader.registerClass("SideEffectObserver", SideEffectObserver);

    const basePrefab = await PrefabParser.parse(engine, "r6-observer-base.prefab", {
      version: "2.0",
      refs: [],
      entities: [{ name: "template" }],
      components: [],
      root: 0
    });
    // @ts-ignore
    engine.resourceManager._objectPool["r6-observer-base.prefab"] = basePrefab;

    try {
      for (const withUnrelatedCall of [false, true]) {
        seen.length = 0;
        const outerPrefab = await PrefabParser.parse(engine, `r6-effects-${withUnrelatedCall}.prefab`, {
          version: "2.0",
          refs: [{ url: "r6-observer-base.prefab" }],
          entities: [
            {
              instance: {
                asset: 0,
                overrides: {
                  addedComponents: [
                    { target: [], component: 0 },
                    { target: [], component: 1 }
                  ],
                  componentProps: [
                    {
                      path: [],
                      selector: { type: "SideEffectObserver", index: 0 },
                      props: { label: "instance" }
                    }
                  ]
                }
              }
            }
          ],
          components: [
            { type: "SideEffectObserver", props: { label: "base" } },
            { type: "SideEffectObserver", ...(withUnrelatedCall ? { calls: [{ method: "noop" }] } : {}) }
          ],
          root: 0
        });
        const inst = outerPrefab.instantiate();
        inst.destroy();
        expect(seen).toEqual(["base", "instance"]);
      }

      // Wave 1 skips components destroyed during Wave 0 base calls
      seen.length = 0;
      const disposedPrefab = await PrefabParser.parse(engine, "r6-disposed-before-override.prefab", {
        version: "2.0",
        refs: [{ url: "r6-observer-base.prefab" }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                addedComponents: [
                  { target: [], component: 0 },
                  { target: [], component: 1 }
                ],
                componentProps: [
                  {
                    path: [],
                    selector: { type: "SideEffectObserver", index: 1 },
                    calls: [{ method: "probeDestroyed" }]
                  }
                ]
              }
            }
          }
        ],
        components: [
          { type: "SideEffectObserver", calls: [{ method: "destroySibling" }] },
          { type: "SideEffectObserver" }
        ],
        root: 0
      });
      const disposedRoot = disposedPrefab.instantiate();
      try {
        expect(disposedRoot.getComponents(SideEffectObserver, [])).toHaveLength(1);
        expect(seen).toEqual([]);
      } finally {
        disposedRoot.destroy();
      }
    } finally {
      // @ts-ignore
      delete engine.resourceManager._objectPool["r6-observer-base.prefab"];
    }
  });

  it.each([
    { overrides: false, fails: false },
    { overrides: true, fails: false },
    { overrides: false, fails: true }
  ])("runs a sibling call while another is waiting ($overrides, $fails)", async ({ overrides, fails }) => {
    const type = "ConcurrentPrefabScript";
    const failure = new Error("sibling prefab call failed");
    const seen: string[] = [];
    let start: () => void;
    let release: () => void;
    const started = new Promise<void>((resolve) => (start = resolve));
    const waiting = new Promise<void>((resolve) => (release = resolve));
    class ConcurrentPrefabScript extends Script {
      async waitForSibling(): Promise<void> {
        seen.push("waiting");
        start();
        await waiting;
        seen.push("resumed");
      }

      async signal(): Promise<void> {
        await started;
        seen.push("signalled");
        if (fails) throw failure;
        release();
      }
    }
    Loader.registerClass(type, ConcurrentPrefabScript);

    const calls = [[{ method: "waitForSibling" }], [{ method: "signal" }]];
    let data: PrefabFile = {
      version: "2.0",
      refs: [],
      root: 0,
      entities: [{ components: [0, 1] }],
      components: calls.map((calls) => ({ type, calls }))
    };
    let templateUrl: string;
    if (overrides) {
      const template = { ...data, components: [{ type }, { type }] };
      templateUrl = URL.createObjectURL(new Blob([JSON.stringify(template)], { type: "application/json" }));
      const templatePath = "concurrent-template.prefab";
      engine.resourceManager.registerVirtualResources([
        { virtualPath: templatePath, path: templateUrl, type: AssetType.Prefab }
      ]);
      data = {
        ...data,
        refs: [{ url: templatePath }],
        entities: [
          {
            instance: {
              asset: 0,
              overrides: {
                componentProps: calls.map((calls, index) => ({ path: [], selector: { type, index }, calls }))
              }
            }
          }
        ],
        components: []
      };
    }

    try {
      const parsed = PrefabParser.parse(engine, "concurrent-calls.prefab", data);
      if (fails) {
        await expect(parsed).rejects.toThrow(failure);
        expect(seen).toEqual(["waiting", "signalled"]);
      } else {
        const prefab = await parsed;
        expect(seen).toEqual(["waiting", "signalled", "resumed"]);
        prefab.destroy();
      }
    } finally {
      release();
      if (templateUrl) URL.revokeObjectURL(templateUrl);
    }
  });

  it.each(["component", "result", "target path"])("stops pending writes on a destroyed %s", async (mode) => {
    const invoked: string[] = [];
    const state = { record: () => invoked.push("call") };
    class DestroyingSetterScript extends Script {
      readonly state = state;

      set remove(_value: boolean) {
        this.destroy();
      }

      set later(_value: boolean) {
        invoked.push("setter");
      }

      count(): void {
        invoked.push("call");
      }
    }
    Loader.registerClass("DestroyingSetterScript", DestroyingSetterScript);
    class ReturnsDestroyingScript extends Script {
      get child(): DestroyingSetterScript {
        return this.entity.getComponent(DestroyingSetterScript)!;
      }

      getResult(): DestroyingSetterScript {
        return this.child;
      }
    }
    Loader.registerClass("ReturnsDestroyingScript", ReturnsDestroyingScript);
    class DestroyCallTargetArgument {
      constructor(target: DestroyingSetterScript) {
        target.destroy();
      }
    }
    Loader.registerClass("DestroyCallTargetArgument", DestroyCallTargetArgument);

    const mutations = {
      props: { state: { asset: { $ref: 0 } }, remove: true, later: true },
      calls: [{ method: "count" }]
    };
    const call =
      mode === "result"
        ? { method: "getResult", result: mutations }
        : {
            target: ["child", "state"],
            method: "record",
            args: [
              {
                $type: "DestroyCallTargetArgument",
                $args: [{ $component: { entity: [0], type: "DestroyingSetterScript", index: 0 } }]
              }
            ]
          };
    const components =
      mode === "component"
        ? [{ type: "DestroyingSetterScript", ...mutations }]
        : [{ type: "DestroyingSetterScript" }, { type: "ReturnsDestroyingScript", calls: [call] }];

    const assetPath = "destroying-setter.json";
    const assetUrl = URL.createObjectURL(new Blob(['{"value":1}'], { type: "application/json" }));
    engine.resourceManager.registerVirtualResources([{ virtualPath: assetPath, path: assetUrl, type: AssetType.JSON }]);
    try {
      const prefab = await loadPrefab({
        version: "2.0",
        refs: [{ url: assetPath }],
        root: 0,
        entities: [{ components: components.map((_, index) => index) }],
        components
      });
      const instance = prefab.instantiate();
      try {
        expect(instance.getComponent(DestroyingSetterScript)).toBeNull();
        expect(invoked).toEqual([]);
        expect("asset" in state).toBe(false);
      } finally {
        instance.destroy();
        prefab.destroy();
      }
    } finally {
      URL.revokeObjectURL(assetUrl);
    }
  });

  it.each(["method", "argument", "constructor argument"])(
    "stops pending calls after a sibling load failure (waiting for %s)",
    async (waitingFor) => {
      const type = "InterruptedPrefabScript";
      const valueType = "InterruptedPrefabProperty";
      const assetType = "DelayedPrefabArgument";
      const virtualPath = "delayed.prefab-argument";
      const failure = new Error("sibling prefab call failed");
      let waitStarted: () => void;
      let release: () => void;
      const started = new Promise<void>((resolve) => (waitStarted = resolve));
      const waiting = new Promise<void>((resolve) => (release = resolve));
      const events: string[] = [];

      @resourceLoader(assetType, [], false)
      class DelayedArgumentLoader extends Loader<void> {
        override load(): AssetPromise<void> {
          waitStarted();
          return AssetPromise.resolve(waiting);
        }
      }

      class InterruptedPrefabScript extends Script {
        async wait(): Promise<void> {
          waitStarted();
          await waiting;
          events.push("resumed");
        }

        async fail(): Promise<void> {
          await started;
          throw failure;
        }

        record(): void {
          events.push("called");
        }

        override onDestroy(): void {
          events.push("destroyed");
        }
      }

      class InterruptedPrefabProperty {
        constructor() {
          events.push("constructed");
        }
      }

      Loader.registerClass(type, InterruptedPrefabScript);
      Loader.registerClass(valueType, InterruptedPrefabProperty);
      engine.resourceManager.registerVirtualResources([{ virtualPath, path: virtualPath, type: assetType }]);
      try {
        const reference = { $ref: 0 };
        const argument = waitingFor === "argument" ? reference : { $type: valueType, $args: [reference] };
        await expect(
          loadPrefab({
            version: "2.0",
            refs: [{ url: virtualPath }],
            root: 0,
            entities: [{ components: [0, 1] }],
            components: [
              {
                type,
                calls:
                  waitingFor === "method"
                    ? [{ method: "wait" }, { method: "record" }]
                    : [{ method: "record", args: [argument] }]
              },
              { type, calls: [{ method: "fail" }] }
            ]
          })
        ).rejects.toThrow(failure);
        expect(events).toEqual(["destroyed", "destroyed"]);
      } finally {
        release();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(events).toEqual(
        waitingFor === "method" ? ["destroyed", "destroyed", "resumed"] : ["destroyed", "destroyed"]
      );
    }
  );
});
