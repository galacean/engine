import { expect, beforeAll, afterAll, describe, it, vi } from "vitest";
import { WebGLEngine } from "@galacean/engine";
import { Loader, MeshCollider, MeshRenderer, Rigidbody, Script } from "@galacean/engine-core";
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

describe("PrefabResource refCount", () => {
  it("should reject prefab data with an unsupported version", () => {
    const prefabData = {
      version: "1.0",
      refs: [],
      entities: [{ name: "root" }],
      components: [],
      root: 0
    } as any;

    expect(() => PrefabParser.parse(engine, "invalid.prefab", prefabData)).toThrow(
      'Unsupported prefab format version "1.0". Expected "2.0".'
    );
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
});

describe("$ref null guard in Prefab mode", () => {
  it("should not add null to dependence assets when $ref resolves to null", async () => {
    const prefabData: PrefabFile = {
      version: "2.0",
      refs: [{ url: "missing-asset.png" }],
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "DiceScript", props: { skinMesh: { $ref: 0 } } }],
      root: 0
    };

    const prefab = await PrefabParser.parse(engine, "test.prefab", prefabData);
    // @ts-ignore — access private field for verification
    expect(prefab._dependenceAssets.size).toBe(0);

    // Verify the component property was actually resolved to null (not skipped)
    const root = prefab.instantiate();
    const script = root.getComponent(DiceScript);
    expect(script.skinMesh).toBeNull();
    root.destroy();
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

  it("should defer only isTrigger onto convex override while keeping other base props in Wave 0, avoid deadlocking neutral async blocks, and serialize paired restrict-relax physics cycles", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    class WaveEnabledReader extends Rigidbody {
      seenEnabled: boolean | null = null;
      seenCenterX: number | null = null;
      observe(): void {
        const mesh = this.entity.getComponent(MeshCollider)!;
        this.seenEnabled = mesh.enabled;
        this.seenCenterX = mesh.center.x;
      }
    }
    class WaveScriptReader extends Script {
      seenCenterX: number | null = null;
      observe(): void {
        this.seenCenterX = this.entity.getComponent(MeshCollider)!.center.x;
      }
    }
    class PairedBody extends Rigidbody {
      seen: boolean | undefined;
      observe(): void {
        this.seen = this.isKinematic;
      }
    }
    class PairedMesh extends MeshCollider {
      seen: boolean | undefined;
      observe(): void {
        this.seen = this.convex;
      }
    }
    Loader.registerClass("R7WaveEnabledReader", WaveEnabledReader);
    Loader.registerClass("R7WaveScriptReader", WaveScriptReader);
    Loader.registerClass("R7PairedBody", PairedBody);
    Loader.registerClass("R7PairedMesh", PairedMesh);

    const emptyBase = await PrefabParser.parse(engine, "r7-empty-base.prefab", {
      version: "2.0",
      refs: [],
      entities: [{ name: "template" }],
      components: [],
      root: 0
    });
    // @ts-ignore
    engine.resourceManager._objectPool["r7-empty-base.prefab"] = emptyBase;

    const pairedBase = await PrefabParser.parse(engine, "r7-paired-base.prefab", {
      version: "2.0",
      refs: [],
      entities: [{ name: "root", components: [0, 1] }],
      components: [
        { type: "R7PairedBody", props: { isKinematic: true } },
        { type: "R7PairedMesh", props: { convex: true } }
      ],
      root: 0
    });
    // @ts-ignore
    engine.resourceManager._objectPool["r7-paired-base.prefab"] = pairedBase;

    try {
      // 1. Surgical isTrigger deferral: enabled & center stay in Wave 0 for both Rigidbody and Script observers
      const deferPrefab = await PrefabParser.parse(engine, "r7-enabled-deferral.prefab", {
        version: "2.0",
        refs: [{ url: "r7-empty-base.prefab" }],
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
                    selector: { type: "MeshCollider", index: 0 },
                    props: { convex: true },
                    calls: [{ target: ["entity"], method: "findByName", args: ["template"] }]
                  }
                ]
              }
            }
          }
        ],
        components: [
          { type: "MeshCollider", props: { isTrigger: true, enabled: false, center: { x: 7, y: 0, z: 0 } } },
          { type: "R7WaveEnabledReader", props: { isKinematic: false }, calls: [{ method: "observe" }] },
          { type: "R7WaveScriptReader", calls: [{ method: "observe" }] }
        ],
        root: 0
      });
      const deferInst = deferPrefab.instantiate();
      try {
        const mesh = deferInst.getComponent(MeshCollider)!;
        const bodyReader = deferInst.getComponent(WaveEnabledReader)!;
        const scriptReader = deferInst.getComponent(WaveScriptReader)!;
        expect(bodyReader.seenEnabled).toBe(false);
        expect(bodyReader.seenCenterX).toBe(7);
        expect(scriptReader.seenCenterX).toBe(7);
        expect(mesh.enabled).toBe(false);
        expect(mesh.center.x).toBe(7);
        expect(mesh.convex).toBe(true);
        expect(mesh.isTrigger).toBe(true);
      } finally {
        deferInst.destroy();
      }

      // 2. Neutral async chains never deadlock behind unrelated MeshCollider (neutral contactOffset OR phased convex)
      for (const mode of ["none", "neutral-mesh", "phased-mesh"] as const) {
        let unblock!: () => void;
        const gate = new Promise<void>((r) => (unblock = r));
        const seen: string[] = [];
        class WaitScript extends Script {
          async wait(): Promise<void> {
            seen.push("wait");
            await gate;
            seen.push("resumed");
          }
        }
        class ReleaseScript extends Script {
          stage(): void {
            seen.push("stage");
          }
          release(): void {
            seen.push("release");
            unblock();
          }
        }
        const waitType = `R7Wait_${mode}`;
        const releaseType = `R7Release_${mode}`;
        Loader.registerClass(waitType, WaitScript);
        Loader.registerClass(releaseType, ReleaseScript);

        const withMesh = mode !== "none";
        const baseKey = `r7-neutral-base-${mode}.prefab`;
        const neutralBase = await PrefabParser.parse(engine, baseKey, {
          version: "2.0",
          refs: [],
          entities: [{ name: "template", components: withMesh ? [0, 1, 2] : [0, 1] }],
          components: [{ type: waitType }, { type: releaseType }, ...(withMesh ? [{ type: "MeshCollider" }] : [])],
          root: 0
        });
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = neutralBase;

        try {
          const neutralOuter = await PrefabParser.parse(engine, `r7-neutral-outer-${mode}.prefab`, {
            version: "2.0",
            refs: [{ url: baseKey }],
            entities: [
              {
                instance: {
                  asset: 0,
                  overrides: {
                    componentProps: [
                      { path: [], selector: { type: waitType, index: 0 }, calls: [{ method: "wait" }] },
                      { path: [], selector: { type: releaseType, index: 0 }, calls: [{ method: "stage" }] },
                      { path: [], selector: { type: releaseType, index: 0 }, calls: [{ method: "release" }] },
                      ...(mode === "neutral-mesh"
                        ? [{ path: [], selector: { type: "MeshCollider", index: 0 }, props: { contactOffset: 0.04 } }]
                        : mode === "phased-mesh"
                          ? [{ path: [], selector: { type: "MeshCollider", index: 0 }, props: { convex: true } }]
                          : [])
                    ]
                  }
                }
              }
            ],
            components: [],
            root: 0
          });
          const inst = neutralOuter.instantiate();
          inst.destroy();
          expect(seen).toEqual(["wait", "stage", "release", "resumed"]);
        } finally {
          // @ts-ignore
          delete engine.resourceManager._objectPool[baseKey];
        }
      }

      // 3. Paired Rigidbody & MeshCollider restrict->relax cycles succeed cleanly in both override orders
      const bodyBlocks = [
        {
          path: [],
          selector: { type: "R7PairedBody", index: 0 },
          props: { isKinematic: false },
          calls: [{ method: "observe" }]
        },
        { path: [], selector: { type: "R7PairedBody", index: 0 }, props: { isKinematic: true } }
      ];
      const meshBlocks = [
        {
          path: [],
          selector: { type: "R7PairedMesh", index: 0 },
          props: { convex: false },
          calls: [{ method: "observe" }]
        },
        { path: [], selector: { type: "R7PairedMesh", index: 0 }, props: { convex: true } }
      ];
      for (const order of ["body-first", "mesh-first"] as const) {
        const pairedOuter = await PrefabParser.parse(engine, `r7-paired-${order}.prefab`, {
          version: "2.0",
          refs: [{ url: "r7-paired-base.prefab" }],
          entities: [
            {
              instance: {
                asset: 0,
                overrides: {
                  componentProps:
                    order === "body-first" ? [...bodyBlocks, ...meshBlocks] : [...meshBlocks, ...bodyBlocks]
                }
              }
            }
          ],
          components: [],
          root: 0
        });
        const inst = pairedOuter.instantiate();
        try {
          const b = inst.getComponent(PairedBody)!;
          const m = inst.getComponent(PairedMesh)!;
          expect(b.seen).toBe(false);
          expect(m.seen).toBe(false);
          expect(b.isKinematic).toBe(true);
          expect(m.convex).toBe(true);
        } finally {
          inst.destroy();
        }
      }

      // 4. Independent phased Rigidbody chains & independent MeshCollider chains & Script+MeshCollider phaseCalls run concurrently (no deadlock)
      for (const withRelaxation of [false, true]) {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        const observed: string[] = [];
        class WaitingBody extends Rigidbody {
          async runCall(): Promise<void> {
            observed.push(`waiting:${this.isKinematic}`);
            await gate;
            observed.push("ready");
          }
        }
        class SignalBody extends Rigidbody {
          runCall(): void {
            observed.push(`release:${this.isKinematic}`);
            release();
          }
        }
        const waitKey = `R8WaitBody_${withRelaxation}`;
        const sigKey = `R8SigBody_${withRelaxation}`;
        Loader.registerClass(waitKey, WaitingBody);
        Loader.registerClass(sigKey, SignalBody);

        const baseKey = `r8-bodies-base-${withRelaxation}.prefab`;
        const bodiesBase = await PrefabParser.parse(engine, baseKey, {
          version: "2.0",
          refs: [],
          entities: [
            { name: "root", children: [1, 2] },
            { name: "a", components: [0] },
            { name: "b", components: [1] }
          ],
          components: [
            { type: waitKey, props: { isKinematic: true } },
            { type: sigKey, props: { isKinematic: true } }
          ],
          root: 0
        });
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = bodiesBase;
        try {
          const calls = [waitKey, sigKey].flatMap((type, i) => {
            const target = { path: [i], selector: { type, index: 0 } };
            return [
              { ...target, props: { isKinematic: false }, calls: [{ method: "runCall" }] },
              ...(withRelaxation ? [{ ...target, props: { isKinematic: true } }] : [])
            ];
          });
          const bodiesOuter = await PrefabParser.parse(engine, `r8-bodies-outer-${withRelaxation}.prefab`, {
            version: "2.0",
            refs: [{ url: baseKey }],
            entities: [{ instance: { asset: 0, overrides: { componentProps: calls } } }],
            components: [],
            root: 0
          });
          const inst = bodiesOuter.instantiate();
          try {
            expect(observed).toEqual(["waiting:false", "release:false", "ready"]);
            expect(inst.children.map((e) => e.getComponent(Rigidbody)!.isKinematic)).toEqual([
              withRelaxation,
              withRelaxation
            ]);
          } finally {
            inst.destroy();
          }
        } finally {
          // @ts-ignore
          delete engine.resourceManager._objectPool[baseKey];
        }
      }

      // Independent MeshCollider restrict->relax pairs & neutral Script + standalone MeshCollider phase calls
      for (const mode of ["control", "restrict", "relax", "paired"] as const) {
        let unblock!: () => void;
        const gate = new Promise<void>((r) => (unblock = r));
        const seen: string[] = [];
        class PhaseScript extends Script {
          async wait(): Promise<void> {
            seen.push("wait");
            await gate;
            seen.push("resumed");
          }
          release(): void {
            seen.push("release");
            unblock();
          }
        }
        class PhaseMesh extends MeshCollider {
          async wait(): Promise<void> {
            seen.push(`wait:${this.convex}`);
            await gate;
            seen.push("resumed");
          }
          release(): void {
            seen.push(`release:${this.convex}`);
            unblock();
          }
        }
        const scriptKey = `R8PhaseScript_${mode}`;
        const meshKey = `R8PhaseMesh_${mode}`;
        Loader.registerClass(scriptKey, PhaseScript);
        Loader.registerClass(meshKey, PhaseMesh);

        const baseKey = `r8-phase-base-${mode}.prefab`;
        const baseData: PrefabFile =
          mode === "paired"
            ? {
                version: "2.0",
                refs: [],
                entities: [
                  { name: "root", children: [1, 2] },
                  { name: "first", components: [0] },
                  { name: "second", components: [1] }
                ],
                components: [
                  { type: meshKey, props: { convex: true } },
                  { type: meshKey, props: { convex: true } }
                ],
                root: 0
              }
            : {
                version: "2.0",
                refs: [],
                entities: [{ name: "root", components: [0, 1] }],
                components: [{ type: scriptKey }, { type: meshKey, props: { convex: mode === "restrict" } }],
                root: 0
              };
        const phaseBase = await PrefabParser.parse(engine, baseKey, baseData);
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = phaseBase;
        try {
          const componentProps =
            mode === "paired"
              ? [
                  {
                    path: [0],
                    selector: { type: meshKey, index: 0 },
                    props: { convex: false },
                    calls: [{ method: "wait" }]
                  },
                  { path: [0], selector: { type: meshKey, index: 0 }, props: { convex: true } },
                  {
                    path: [1],
                    selector: { type: meshKey, index: 0 },
                    props: { convex: false },
                    calls: [{ method: "release" }]
                  },
                  { path: [1], selector: { type: meshKey, index: 0 }, props: { convex: true } }
                ]
              : [
                  {
                    path: [],
                    selector: { type: scriptKey, index: 0 },
                    calls: [{ method: mode === "relax" ? "release" : "wait" }]
                  },
                  {
                    path: [],
                    selector: { type: meshKey, index: 0 },
                    props: mode === "control" ? { contactOffset: 0.04 } : { convex: mode === "relax" },
                    calls: [{ method: mode === "relax" ? "wait" : "release" }]
                  }
                ];
          const phaseOuter = await PrefabParser.parse(engine, `r8-phase-outer-${mode}.prefab`, {
            version: "2.0",
            refs: [{ url: baseKey }],
            entities: [{ instance: { asset: 0, overrides: { componentProps } } }],
            components: [],
            root: 0
          });
          const inst = phaseOuter.instantiate();
          inst.destroy();
          expect(seen).toContain("resumed");
        } finally {
          // @ts-ignore
          delete engine.resourceManager._objectPool[baseKey];
        }
      }

      // 5. Wave 0 primitive prop fast path: MeshCollider center is visible to sibling Script.observe() for both isTrigger=false and isTrigger=true
      for (const trigger of [false, true]) {
        const centerPrefab = await PrefabParser.parse(engine, `r8-center-${trigger}.prefab`, {
          version: "2.0",
          refs: [{ url: "r7-empty-base.prefab" }],
          entities: [
            {
              instance: {
                asset: 0,
                overrides: {
                  addedComponents: [
                    { target: [], component: 0 },
                    { target: [], component: 1 }
                  ],
                  componentProps: [{ path: [], selector: { type: "MeshCollider", index: 0 }, props: { convex: true } }]
                }
              }
            }
          ],
          components: [
            { type: "MeshCollider", props: { center: { x: 7, y: 0, z: 0 }, isTrigger: trigger } },
            { type: "R7WaveScriptReader", calls: [{ method: "observe" }] }
          ],
          root: 0
        });
        const inst = centerPrefab.instantiate();
        try {
          expect(inst.getComponent(WaveScriptReader)!.seenCenterX).toBe(7);
          expect(inst.getComponent(MeshCollider)!.center.x).toBe(7);
        } finally {
          inst.destroy();
        }
      }

      // 6. Same-group Rigidbody + already-convex MeshCollider setting isTrigger: true runs concurrently with zero deadlock
      for (const isTriggered of [false, true]) {
        let unblock!: () => void;
        const gate = new Promise<void>((r) => (unblock = r));
        const observed: string[] = [];
        class GroupedWaitBody extends Rigidbody {
          async wait(): Promise<void> {
            observed.push(`wait:${this.isKinematic}`);
            await gate;
            observed.push("resumed");
          }
        }
        class GroupedTriggerMesh extends MeshCollider {
          signal(): void {
            observed.push(`signal:${this.convex}:${this.isTrigger}`);
            unblock();
          }
        }
        const bodyType = `R9GroupedWaitBody_${isTriggered}`;
        const meshType = `R9GroupedTriggerMesh_${isTriggered}`;
        Loader.registerClass(bodyType, GroupedWaitBody);
        Loader.registerClass(meshType, GroupedTriggerMesh);

        const baseKey = `r9-grouped-trigger-base-${isTriggered}.prefab`;
        const groupedBase = await PrefabParser.parse(engine, baseKey, {
          version: "2.0",
          refs: [],
          entities: [{ name: "root", components: [0, 1] }],
          components: [
            { type: bodyType, props: { isKinematic: true } },
            { type: meshType, props: { convex: true } }
          ],
          root: 0
        });
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = groupedBase;
        try {
          const groupedOuter = await PrefabParser.parse(engine, `r9-grouped-trigger-outer-${isTriggered}.prefab`, {
            version: "2.0",
            refs: [{ url: baseKey }],
            entities: [
              {
                instance: {
                  asset: 0,
                  overrides: {
                    componentProps: [
                      {
                        path: [],
                        selector: { type: bodyType, index: 0 },
                        props: { isKinematic: false },
                        calls: [{ method: "wait" }]
                      },
                      { path: [], selector: { type: bodyType, index: 0 }, props: { isKinematic: true } },
                      {
                        path: [],
                        selector: { type: meshType, index: 0 },
                        props: isTriggered ? { isTrigger: true } : { contactOffset: 0.04 },
                        calls: [{ method: "signal" }]
                      }
                    ]
                  }
                }
              }
            ],
            components: [],
            root: 0
          });
          const inst = groupedOuter.instantiate();
          try {
            const body = inst.getComponent(GroupedWaitBody)!;
            const mesh = inst.getComponent(GroupedTriggerMesh)!;
            expect(observed).toContain("resumed");
            expect(observed).toContain(`signal:true:${isTriggered}`);
            expect(body.isKinematic).toBe(true);
            expect(mesh.isTrigger).toBe(isTriggered);
          } finally {
            inst.destroy();
          }
        } finally {
          // @ts-ignore
          delete engine.resourceManager._objectPool[baseKey];
        }
      }

      // 7. Same-group Rigidbody / MeshCollider relaxing props satisfy the phase barrier without waiting on async calls (both directions)
      for (const mode of ["body-waits-mesh", "mesh-waits-body-noop", "mesh-waits-body-change"] as const) {
        let unblock!: () => void;
        const gate = new Promise<void>((r) => (unblock = r));
        const seen: string[] = [];
        const bodyWaits = mode === "body-waits-mesh";
        class CoupledBody extends Rigidbody {
          async boot(): Promise<void> {
            seen.push(`body:${this.isKinematic}`);
            await gate;
            seen.push("body-done");
          }
          signal(): void {
            seen.push(`body:${this.isKinematic}`);
            unblock();
          }
        }
        class CoupledMesh extends MeshCollider {
          async waitForBody(): Promise<void> {
            seen.push(`mesh-wait:${this.convex}`);
            await gate;
            seen.push("mesh-done");
          }
          notify(): void {
            seen.push(`mesh:${this.convex}`);
            unblock();
          }
        }
        const bodyType = `R10CoupledBody_${mode}`;
        const meshType = `R10CoupledMesh_${mode}`;
        Loader.registerClass(bodyType, CoupledBody);
        Loader.registerClass(meshType, CoupledMesh);

        const baseKey = `r10-coupled-base-${mode}.prefab`;
        const coupledBase = await PrefabParser.parse(engine, baseKey, {
          version: "2.0",
          refs: [],
          entities: [
            { name: "body", components: [0], children: [1] },
            { name: "mesh", components: [1] }
          ],
          components: [
            { type: bodyType, props: { isKinematic: !bodyWaits } },
            { type: meshType, props: { convex: mode !== "mesh-waits-body-change" } }
          ],
          root: 0
        });
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = coupledBase;
        try {
          const componentProps = bodyWaits
            ? [
                {
                  path: [],
                  selector: { type: bodyType, index: 0 },
                  props: { isKinematic: true },
                  calls: [{ method: "boot" }]
                },
                {
                  path: [0],
                  selector: { type: meshType, index: 0 },
                  props: { convex: false },
                  calls: [{ method: "notify" }]
                }
              ]
            : [
                {
                  path: [],
                  selector: { type: bodyType, index: 0 },
                  props: { isKinematic: false },
                  calls: [{ method: "signal" }]
                },
                {
                  path: [0],
                  selector: { type: meshType, index: 0 },
                  props: { convex: true },
                  calls: [{ method: "waitForBody" }]
                }
              ];
          const coupledOuter = await PrefabParser.parse(engine, `r10-coupled-outer-${mode}.prefab`, {
            version: "2.0",
            refs: [{ url: baseKey }],
            entities: [{ instance: { asset: 0, overrides: { componentProps } } }],
            components: [],
            root: 0
          });
          const inst = coupledOuter.instantiate();
          try {
            const body = inst.getComponent(CoupledBody)!;
            const mesh = inst.children[0].getComponent(CoupledMesh)!;
            if (bodyWaits) {
              expect(seen).toEqual(["body:true", "mesh:false", "body-done"]);
              expect(body.isKinematic).toBe(true);
              expect(mesh.convex).toBe(false);
            } else {
              expect(seen).toEqual(["mesh-wait:true", "body:false", "mesh-done"]);
              expect(body.isKinematic).toBe(false);
              expect(mesh.convex).toBe(true);
            }
          } finally {
            inst.destroy();
          }
        } finally {
          // @ts-ignore
          delete engine.resourceManager._objectPool[baseKey];
        }
      }

      // 8. Two sibling MeshColliders under the same kinematic Rigidbody run concurrently even when owner has a phased block,
      //    and targets destroyed during props skip calls uniformly in both phased and unphased paths
      for (const withOwnerProp of [true, false]) {
        let unblock!: () => void;
        const gate = new Promise<void>((r) => (unblock = r));
        const seen: string[] = [];
        class SiblingMesh extends MeshCollider {
          async wait(): Promise<void> {
            seen.push(`wait:${this.convex}`);
            await gate;
            seen.push("done");
          }
          signal(): void {
            seen.push(`signal:${this.convex}`);
            unblock();
          }
        }
        const meshType = `R11SiblingMesh_${withOwnerProp}`;
        Loader.registerClass(meshType, SiblingMesh);
        const baseKey = `r11-siblings-base-${withOwnerProp}.prefab`;
        const sibBase = await PrefabParser.parse(engine, baseKey, {
          version: "2.0",
          refs: [],
          entities: [
            { name: "body", components: [0], children: [1, 2] },
            { name: "m0", components: [1] },
            { name: "m1", components: [1] }
          ],
          components: [
            { type: "Rigidbody", props: { isKinematic: true } },
            { type: meshType, props: { convex: true } }
          ],
          root: 0
        });
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = sibBase;
        try {
          const sibOuter = await PrefabParser.parse(engine, `r11-siblings-outer-${withOwnerProp}.prefab`, {
            version: "2.0",
            refs: [{ url: baseKey }],
            entities: [
              {
                instance: {
                  asset: 0,
                  overrides: {
                    componentProps: [
                      ...(withOwnerProp
                        ? [{ path: [], selector: { type: "Rigidbody", index: 0 }, props: { isKinematic: true } }]
                        : []),
                      {
                        path: [0],
                        selector: { type: meshType, index: 0 },
                        props: { convex: false },
                        calls: [{ method: "wait" }]
                      },
                      {
                        path: [1],
                        selector: { type: meshType, index: 0 },
                        props: { convex: false },
                        calls: [{ method: "signal" }]
                      },
                      { path: [0], selector: { type: meshType, index: 0 }, props: { convex: true } },
                      { path: [1], selector: { type: meshType, index: 0 }, props: { convex: true } }
                    ]
                  }
                }
              }
            ],
            components: [],
            root: 0
          });
          const inst = sibOuter.instantiate();
          inst.destroy();
          expect(seen).toEqual(["wait:false", "signal:false", "done"]);
        } finally {
          // @ts-ignore
          delete engine.resourceManager._objectPool[baseKey];
        }
      }

      for (const grouped of [true, false]) {
        const observed: string[] = [];
        class DisposeDuringPropsMesh extends MeshCollider {
          set dispose(value: boolean) {
            if (value) this.destroy();
          }
          capture(): void {
            observed.push(`called:${this.destroyed}`);
          }
        }
        const meshType = `R11DisposePropsMesh_${grouped}`;
        Loader.registerClass(meshType, DisposeDuringPropsMesh);
        const baseKey = `r11-dispose-base-${grouped}.prefab`;
        const disposeBase = await PrefabParser.parse(engine, baseKey, {
          version: "2.0",
          refs: [],
          entities: [
            { name: "body", components: [0], children: [1] },
            { name: "mesh", components: [1] }
          ],
          components: [{ type: "Rigidbody", props: { isKinematic: true } }, { type: meshType }],
          root: 0
        });
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = disposeBase;
        try {
          const disposeOuter = await PrefabParser.parse(engine, `r11-dispose-outer-${grouped}.prefab`, {
            version: "2.0",
            refs: [{ url: baseKey }],
            entities: [
              {
                instance: {
                  asset: 0,
                  overrides: {
                    componentProps: [
                      ...(grouped
                        ? [{ path: [], selector: { type: "Rigidbody", index: 0 }, props: { isKinematic: true } }]
                        : []),
                      {
                        path: [0],
                        selector: { type: meshType, index: 0 },
                        props: { convex: true, dispose: true },
                        calls: [{ method: "capture" }]
                      }
                    ]
                  }
                }
              }
            ],
            components: [],
            root: 0
          });
          const inst = disposeOuter.instantiate();
          expect(inst.children[0].getComponent(MeshCollider)).toBeNull();
          inst.destroy();
          expect(observed).toEqual([]);
        } finally {
          // @ts-ignore
          delete engine.resourceManager._objectPool[baseKey];
        }
      }

      // 8. Event-driven live-constraint group scheduling: later owner blocks never stall currently-legal
      //    peer blocks while owner awaits peer, and symmetric restrict->relax ties follow declaration order
      for (const restoreKinematic of [false, true]) {
        let unlock!: () => void;
        const gate = new Promise<void>((r) => (unlock = r));
        const trace: string[] = [];
        class WaitingOwner extends Rigidbody {
          async waitForPeer(): Promise<void> {
            trace.push(`wait:${this.isKinematic}`);
            await gate;
            trace.push("resumed");
          }
          observe(): void {
            trace.push(`owner:${this.isKinematic}`);
          }
        }
        class SignallingPeer extends MeshCollider {
          notify(): void {
            trace.push(`peer:${this.convex}:${this.attachedRigidbody?.isKinematic}`);
            unlock();
          }
          observe(): void {
            trace.push(`peer:${this.convex}:${this.attachedRigidbody?.isKinematic}`);
          }
        }
        const ownerType = `R12WaitingOwner_${restoreKinematic}`;
        const peerType = `R12SignallingPeer_${restoreKinematic}`;
        Loader.registerClass(ownerType, WaitingOwner);
        Loader.registerClass(peerType, SignallingPeer);

        const baseKey = `r12-owner-cycle-base-${restoreKinematic}.prefab`;
        const ownerBase = await PrefabParser.parse(engine, baseKey, {
          version: "2.0",
          refs: [],
          entities: [
            { name: "body", components: [0], children: [1] },
            { name: "mesh", components: [1] }
          ],
          components: [
            { type: ownerType, props: { isKinematic: true } },
            { type: peerType, props: { convex: true } }
          ],
          root: 0
        });
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = ownerBase;
        try {
          const outer = await PrefabParser.parse(engine, `r12-owner-cycle-outer-${restoreKinematic}.prefab`, {
            version: "2.0",
            refs: [{ url: baseKey }],
            entities: [
              {
                instance: {
                  asset: 0,
                  overrides: {
                    componentProps: [
                      {
                        path: [],
                        selector: { type: ownerType, index: 0 },
                        props: { isKinematic: true },
                        calls: [{ method: "waitForPeer" }]
                      },
                      {
                        path: [],
                        selector: { type: ownerType, index: 0 },
                        props: { isKinematic: false },
                        calls: [{ method: "observe" }]
                      },
                      ...(restoreKinematic
                        ? [
                            {
                              path: [],
                              selector: { type: ownerType, index: 0 },
                              props: { isKinematic: true },
                              calls: [{ method: "observe" }]
                            }
                          ]
                        : []),
                      {
                        path: [0],
                        selector: { type: peerType, index: 0 },
                        props: { convex: false },
                        calls: [{ method: "notify" }]
                      },
                      {
                        path: [0],
                        selector: { type: peerType, index: 0 },
                        props: { convex: true },
                        calls: [{ method: "observe" }]
                      }
                    ]
                  }
                }
              }
            ],
            components: [],
            root: 0
          });
          const inst = outer.instantiate();
          try {
            expect(trace).toContain("peer:false:true");
            expect(trace).toContain("resumed");
            expect(inst.getComponent(WaitingOwner)!.isKinematic).toBe(restoreKinematic);
            expect(inst.children[0].getComponent(SignallingPeer)!.convex).toBe(true);
          } finally {
            inst.destroy();
          }
        } finally {
          // @ts-ignore
          delete engine.resourceManager._objectPool[baseKey];
        }
      }

      for (const mode of ["owner-restricts-and-relaxes", "owner-relaxes-twice", "owner-relaxes-once"] as const) {
        let release!: () => void;
        const signal = new Promise<void>((r) => (release = r));
        const events: string[] = [];
        class GameBody extends Rigidbody {
          async waitForSetup(): Promise<void> {
            events.push(`body-wait:${this.isKinematic}`);
            await signal;
            events.push("body-ready");
          }
        }
        class GameMesh extends MeshCollider {
          finishSetup(): void {
            events.push(`mesh-signal:${this.convex}:${this.attachedRigidbody?.isKinematic}`);
            release();
          }
        }
        const bodyType = `R12GameBody_${mode}`;
        const meshType = `R12GameMesh_${mode}`;
        Loader.registerClass(bodyType, GameBody);
        Loader.registerClass(meshType, GameMesh);

        const baseKey = `r12-phase-base-${mode}.prefab`;
        const phaseBase = await PrefabParser.parse(engine, baseKey, {
          version: "2.0",
          refs: [],
          entities: [
            { name: "body", components: [0], children: [1] },
            { name: "mesh", components: [1] }
          ],
          components: [
            { type: bodyType, props: { isKinematic: true } },
            { type: meshType, props: { convex: true } }
          ],
          root: 0
        });
        // @ts-ignore
        engine.resourceManager._objectPool[baseKey] = phaseBase;
        try {
          const bodyRestricts = mode === "owner-restricts-and-relaxes";
          const outer = await PrefabParser.parse(engine, `r12-phase-outer-${mode}.prefab`, {
            version: "2.0",
            refs: [{ url: baseKey }],
            entities: [
              {
                instance: {
                  asset: 0,
                  overrides: {
                    componentProps: [
                      {
                        path: [0],
                        selector: { type: meshType, index: 0 },
                        props: { convex: false },
                        calls: [{ method: "finishSetup" }]
                      },
                      { path: [0], selector: { type: meshType, index: 0 }, props: { convex: true } },
                      {
                        path: [],
                        selector: { type: bodyType, index: 0 },
                        props: { isKinematic: !bodyRestricts },
                        calls: [{ method: "waitForSetup" }]
                      },
                      ...(mode !== "owner-relaxes-once"
                        ? [{ path: [], selector: { type: bodyType, index: 0 }, props: { isKinematic: true } }]
                        : [])
                    ]
                  }
                }
              }
            ],
            components: [],
            root: 0
          });
          const inst = outer.instantiate();
          try {
            expect(events).toContain("mesh-signal:false:true");
            expect(events).toContain("body-ready");
            expect(inst.getComponent(GameBody)!.isKinematic).toBe(true);
            expect(inst.children[0].getComponent(GameMesh)!.convex).toBe(true);
          } finally {
            inst.destroy();
          }
        } finally {
          // @ts-ignore
          delete engine.resourceManager._objectPool[baseKey];
        }
      }

      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
      // @ts-ignore
      delete engine.resourceManager._objectPool["r7-empty-base.prefab"];
      // @ts-ignore
      delete engine.resourceManager._objectPool["r7-paired-base.prefab"];
    }
  });
});
