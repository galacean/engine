import { expect, beforeAll, afterAll, describe, it } from "vitest";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Loader, MeshRenderer, Script } from "@galacean/engine-core";
import { PrefabParser } from "../../../packages/loader/src/prefab/PrefabParser";
import type { PrefabFile } from "../../../packages/loader/src/scene-format/types";

let engine: WebGLEngine;

class DiceScript extends Script {
  skinMesh: MeshRenderer = null;
  numMesh: MeshRenderer = null;
}

class OverrideCallScript extends Script {
  value = "";

  appendSuffix(suffix: string): void {
    this.value += suffix;
  }
}

Loader.registerClass("MeshRenderer", MeshRenderer);
Loader.registerClass("DiceScript", DiceScript);
Loader.registerClass("OverrideCallScript", OverrideCallScript);

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
});

describe("$ref null guard in Prefab mode", () => {
  it("should not add null to dependence assets when $ref resolves to null", async () => {
    const prefabData: PrefabFile = {
      version: "2.0",
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "DiceScript", props: { skinMesh: { $ref: "missing-asset.png" } } }],
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
  it("should reject direct root props on prefab instance entities", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      entities: [{ name: "nestedRoot" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-invalid.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-invalid.prefab"] = nestedPrefab;

    const invalidPrefabData = {
      version: "2.0",
      entities: [
        { name: "outerRoot", children: [1] },
        {
          name: "invalidRootName",
          instance: { asset: { $ref: "nested-invalid.prefab" } }
        }
      ],
      components: [],
      root: 0
    } as any;

    await expect(PrefabParser.parse(engine, "invalid-instance.prefab", invalidPrefabData)).rejects.toThrow(
      "Prefab instance entity cannot declare name directly. Move root overrides to instance.overrides.entityProps with path: []."
    );

    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-invalid.prefab"];
  });

  it("should apply entityProps overrides to nested prefab entities", async () => {
    // Nested prefab: root → child
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
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
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: { $ref: "nested.prefab" },
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
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "MeshRenderer" }],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-cp.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-cp.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: { $ref: "nested-cp.prefab" },
            overrides: {
              componentProps: [{ path: [], selector: "MeshRenderer/0", props: { enabled: false } }]
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

  it("should execute component override calls after props", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "OverrideCallScript" }],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-calls.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-calls.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: { $ref: "nested-calls.prefab" },
            overrides: {
              componentProps: [
                {
                  path: [],
                  selector: "OverrideCallScript/0",
                  props: { value: "base" },
                  calls: [{ method: "appendSuffix", args: ["-override"] }]
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
    expect(overrideScript.value).toBe("base-override");

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-calls.prefab"];
  });

  it("should add components via addedComponents", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      entities: [{ name: "root" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-ac.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-ac.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: { $ref: "nested-ac.prefab" },
            overrides: {
              addedComponents: [
                {
                  target: [],
                  component: {
                    type: "OverrideCallScript",
                    props: { value: "base" },
                    calls: [{ method: "appendSuffix", args: ["-added"] }]
                  }
                }
              ]
            }
          }
        }
      ],
      components: [],
      root: 0
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer-ac.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const instanceEntity = root.children[0];
    const overrideScript = instanceEntity.getComponent(OverrideCallScript);
    expect(overrideScript).not.toBeNull();
    expect(overrideScript.value).toBe("base-added");

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-ac.prefab"];
  });

  it("should add entities via addedEntities", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      entities: [{ name: "root" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-ae.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-ae.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: { $ref: "nested-ae.prefab" },
            overrides: {
              addedEntities: [
                {
                  parent: [],
                  entity: {
                    name: "addedChild",
                    position: [1, 2, 3],
                    components: [
                      {
                        type: "OverrideCallScript",
                        props: { value: "base" },
                        calls: [{ method: "appendSuffix", args: ["-inline"] }]
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
      ],
      components: [],
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
    expect(addedChild.getComponent(OverrideCallScript).value).toBe("base-inline");

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["nested-ae.prefab"];
  });

  it("should remove entities via removedEntities", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      entities: [{ name: "root", children: [1] }, { name: "child" }],
      components: [],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-re.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-re.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: { $ref: "nested-re.prefab" },
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

  it("should remove components via removedComponents", async () => {
    const nestedPrefabData: PrefabFile = {
      version: "2.0",
      entities: [{ name: "root", components: [0] }],
      components: [{ type: "MeshRenderer" }],
      root: 0
    };
    const nestedPrefab = await PrefabParser.parse(engine, "nested-rc.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["nested-rc.prefab"] = nestedPrefab;

    const outerPrefabData: PrefabFile = {
      version: "2.0",
      entities: [
        { name: "outerRoot", children: [1] },
        {
          instance: {
            asset: { $ref: "nested-rc.prefab" },
            overrides: {
              removedComponents: [{ path: [], selectors: ["MeshRenderer/0"] }]
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
      entities: [
        { name: "DiceNode", children: [1], components: [0] },
        {
          instance: {
            asset: { $ref: "dice.prefab" },
            overrides: { entityProps: [{ path: [], name: "dice" }] }
          }
        }
      ],
      components: [
        {
          type: "DiceScript",
          props: {
            skinMesh: { $component: { entity: 1, type: "MeshRenderer", index: 0 } }
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
      entities: [
        { name: "DiceNode", children: [1, 2], components: [0] },
        { name: "numCube", components: [1] },
        {
          instance: {
            asset: { $ref: "dice.prefab" },
            overrides: { entityProps: [{ path: [], name: "dice" }] }
          }
        }
      ],
      components: [
        {
          type: "DiceScript",
          props: {
            numMesh: { $component: { entity: 1, type: "MeshRenderer", index: 0 } },
            skinMesh: { $component: { entity: 2, type: "MeshRenderer", index: 0 } }
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
});
