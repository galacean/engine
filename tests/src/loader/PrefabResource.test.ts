import { expect, beforeAll, afterAll, describe, it } from "vitest";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import type { IHierarchyFile } from "@galacean/engine-loader";
import { Loader, MeshRenderer, Script } from "@galacean/engine-core";
import { PrefabParser } from "../../../packages/loader/src/prefab/PrefabParser";

let engine: WebGLEngine;

class DiceScript extends Script {
  skinMesh: MeshRenderer = null;
  numMesh: MeshRenderer = null;
}

Loader.registerClass("MeshRenderer", MeshRenderer);
Loader.registerClass("DiceScript", DiceScript);

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
  it("should increase and decrease with instantiated entities", async () => {
    const prefabData: IHierarchyFile = {
      entities: [
        {
          id: "0",
          name: "root",
          components: [],
          children: ["1"]
        },
        {
          id: "1",
          name: "child",
          parent: "0",
          components: []
        }
      ]
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
});

describe("Cross-prefab IComponentRef (path-based)", () => {
  it("should resolve component ref inside nested prefab instance via entityPath", async () => {
    // 1. nested prefab (dice.prefab): 单个 root entity 带 MeshRenderer
    const nestedPrefabData: IHierarchyFile = {
      entities: [
        {
          id: "0",
          name: "diceRoot",
          components: [{ id: "mesh-comp", class: "MeshRenderer" }],
          children: []
        }
      ]
    };
    const nestedPrefab = await PrefabParser.parse(engine, "dice.prefab", nestedPrefabData);
    // @ts-ignore — 注册到 resourceManager 使 getResourceByRef 可返回
    engine.resourceManager._objectPool["dice.prefab"] = nestedPrefab;

    // 2. outer prefab (DiceNode.prefab)
    //    树结构（解析后）: DiceNode(root=[0]) -> [0]numCube, [1]diceRoot(nested)
    //    skinMesh 通过 entityPath 穿透 nested prefab 边界
    const outerPrefabData: IHierarchyFile = {
      entities: [
        {
          id: "root",
          name: "DiceNode",
          components: [
            {
              id: "script-comp",
              class: "DiceScript",
              props: {
                skinMesh: { entityPath: [0, 0], componentType: "MeshRenderer", componentIndex: 0 }
              }
            }
          ],
          children: ["dice-inst"]
        },
        {
          id: "dice-inst",
          name: "dice",
          parent: "root",
          components: [],
          assetUrl: "dice.prefab",
          modifications: [],
          removedEntities: [],
          removedComponents: []
        }
      ]
    };

    const outerPrefab = await PrefabParser.parse(engine, "DiceNode.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();
    const script = root.getComponent(DiceScript);

    // skinMesh 应指向 nested prefab instance 内的 MeshRenderer
    expect(script.skinMesh).not.toBeNull();
    expect(script.skinMesh).toBeInstanceOf(MeshRenderer);
    expect(script.skinMesh.entity.name).toBe("dice");

    root.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["dice.prefab"];
  });

  it("should resolve both local and cross-prefab refs, and survive clone independently", async () => {
    const nestedPrefabData: IHierarchyFile = {
      entities: [
        {
          id: "0",
          name: "diceRoot",
          components: [{ id: "mesh-comp", class: "MeshRenderer" }],
          children: []
        }
      ]
    };
    const nestedPrefab = await PrefabParser.parse(engine, "dice.prefab", nestedPrefabData);
    // @ts-ignore
    engine.resourceManager._objectPool["dice.prefab"] = nestedPrefab;

    // 树结构: DiceNode(root=[0]) -> [0]numCube, [1]diceRoot(nested)
    const outerPrefabData: IHierarchyFile = {
      entities: [
        {
          id: "root",
          name: "DiceNode",
          components: [
            {
              id: "script-comp",
              class: "DiceScript",
              props: {
                numMesh: { entityPath: [0, 0], componentType: "MeshRenderer", componentIndex: 0 },
                skinMesh: { entityPath: [0, 1], componentType: "MeshRenderer", componentIndex: 0 }
              }
            }
          ],
          children: ["num-cube", "dice-inst"]
        },
        {
          id: "num-cube",
          name: "numCube",
          parent: "root",
          components: [{ id: "num-mesh-comp", class: "MeshRenderer" }]
        },
        {
          id: "dice-inst",
          name: "dice",
          parent: "root",
          components: [],
          assetUrl: "dice.prefab",
          modifications: [],
          removedEntities: [],
          removedComponents: []
        }
      ]
    };

    const outerPrefab = await PrefabParser.parse(engine, "DiceNode.prefab", outerPrefabData);

    const instance1 = outerPrefab.instantiate();
    const instance2 = outerPrefab.instantiate();

    const script1 = instance1.getComponent(DiceScript);
    const script2 = instance2.getComponent(DiceScript);

    // instance1: numMesh → numCube 的 MeshRenderer, skinMesh → diceRoot 的 MeshRenderer
    const numMesh1 = instance1.children[0].getComponent(MeshRenderer);
    const skinMesh1 = instance1.children[1].getComponent(MeshRenderer);
    expect(script1.numMesh).toBe(numMesh1);
    expect(script1.skinMesh).toBe(skinMesh1);

    // instance2: 各自独立的引用
    const numMesh2 = instance2.children[0].getComponent(MeshRenderer);
    const skinMesh2 = instance2.children[1].getComponent(MeshRenderer);
    expect(script2.numMesh).toBe(numMesh2);
    expect(script2.skinMesh).toBe(skinMesh2);

    // 两个实例的引用互相独立
    expect(script1.numMesh).not.toBe(script2.numMesh);
    expect(script1.skinMesh).not.toBe(script2.skinMesh);

    instance1.destroy();
    instance2.destroy();
    // @ts-ignore
    delete engine.resourceManager._objectPool["dice.prefab"];
  });
});
