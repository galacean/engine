/**
 * Tests stripped entities that proxy internal prefab-instance entities.
 *
 * A stripped entity can resolve to an entity inside a nested prefab instance and
 * serve as the parent for newly added entities.
 */
import { expect, beforeAll, afterAll, describe, it } from "vitest";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import type { IHierarchyFile } from "@galacean/engine-loader";
import { Vector3 } from "@galacean/engine-math";
import { PrefabParser } from "../../../packages/loader/src/prefab/PrefabParser";

let engine: WebGLEngine;

function getResourceObjectPool(): Record<string, unknown> {
  return (engine.resourceManager as unknown as { _objectPool: Record<string, unknown> })._objectPool;
}

function cachePrefab(url: string, prefab: unknown): void {
  getResourceObjectPool()[url] = prefab;
}

function removeCachedPrefab(url: string): void {
  delete getResourceObjectPool()[url];
}

beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  engine = await WebGLEngine.create({ canvas });
});

afterAll(() => {
  engine?.destroy();
});

describe("IStrippedEntity as addedEntities mechanism", () => {
  it("keeps nested prefab children after instantiation", async () => {
    const nestedPrefabData: IHierarchyFile = {
      entities: [
        { id: "0", name: "nestedRoot", components: [], children: ["1", "2"] },
        { id: "1", name: "boneHand", parent: "0", components: [] },
        { id: "2", name: "otherChild", parent: "0", components: [] }
      ]
    };
    const nestedPrefab = await PrefabParser.parse(engine, "sanity.prefab", nestedPrefabData);
    const inst = nestedPrefab.instantiate();
    const names = inst.children.map((c) => c.name);
    expect(names).toContain("boneHand");
    expect(names).toContain("otherChild");
    inst.destroy();
  });

  it("should attach new child entity under an internal entity of a nested prefab", async () => {
    // Nested prefab:
    //   root
    //     - boneHand    (proxied by the stripped entity)
    //     - otherChild
    const nestedPrefabData: IHierarchyFile = {
      entities: [
        { id: "0", name: "nestedRoot", components: [], children: ["1", "2"] },
        { id: "1", name: "boneHand", parent: "0", components: [] },
        { id: "2", name: "otherChild", parent: "0", components: [] }
      ]
    };
    const nestedPrefab = await PrefabParser.parse(engine, "char.prefab", nestedPrefabData);
    cachePrefab("char.prefab", nestedPrefab);

    // Outer prefab:
    //   - IRefEntity instantiating the nested prefab (only direct child of outerRoot)
    //   - IStrippedEntity proxying to boneHand, not in outerRoot.children
    //   - weaponslot listed in stripped entity's children
    const outerPrefabData: IHierarchyFile = {
      entities: [
        {
          id: "outerRoot",
          name: "Character",
          components: [],
          children: ["charInst"]
        },
        {
          id: "charInst",
          name: "char",
          parent: "outerRoot",
          components: [],
          assetUrl: "char.prefab",
          isClone: true,
          modifications: [],
          removedEntities: [],
          removedComponents: []
        } as any,
        {
          // Do not set `name`: _applyEntityData would override the internal entity's name.
          strippedId: "boneHandle",
          prefabInstanceId: "charInst",
          prefabSource: { assetId: "", entityId: "0" },
          components: [],
          children: ["weaponslot"]
        } as any,
        {
          id: "weaponslot",
          name: "weaponslot1",
          parent: "boneHandle",
          components: [],
          position: { x: 0.5, y: 0.25, z: 0 }
        }
      ]
    };

    const outerPrefab = await PrefabParser.parse(engine, "outer.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();

    const charInst = root.children.find((c) => c.name === "char");
    expect(charInst, "char instance should be a child of outerRoot").not.toBeUndefined();

    const boneHand = charInst!.children.find((c) => c.name === "boneHand");
    expect(boneHand, "boneHand should exist inside nested prefab").not.toBeUndefined();

    const weaponslot = boneHand!.children.find((c) => c.name === "weaponslot1");
    expect(weaponslot, "weaponslot1 should be attached as child of boneHand via stripped entity").not.toBeUndefined();
    expect(weaponslot!.transform.position.x).toBeCloseTo(0.5, 5);
    expect(weaponslot!.transform.position.y).toBeCloseTo(0.25, 5);
    expect(weaponslot!.transform.position.z).toBeCloseTo(0, 5);

    root.destroy();
    removeCachedPrefab("char.prefab");
  });

  it("should support multiple stripped entities targeting different internal entities (LeftHand / RightHand socket case)", async () => {
    // Nested prefab: root -> [LeftHand, RightHand]
    const nestedPrefabData: IHierarchyFile = {
      entities: [
        { id: "0", name: "nestedRoot", components: [], children: ["1", "2"] },
        { id: "1", name: "LeftHand", parent: "0", components: [] },
        { id: "2", name: "RightHand", parent: "0", components: [] }
      ]
    };
    const nestedPrefab = await PrefabParser.parse(engine, "body.prefab", nestedPrefabData);
    cachePrefab("body.prefab", nestedPrefab);

    // entityId is the path string generated by _generateInstanceContext:
    //   nestedRoot = ""
    //   nestedRoot.children[0] = LeftHand  -> "0"
    //   nestedRoot.children[1] = RightHand -> "1"
    const outerPrefabData: IHierarchyFile = {
      entities: [
        {
          id: "outerRoot",
          name: "Player",
          components: [],
          children: ["bodyInst"]
        },
        {
          id: "bodyInst",
          name: "body",
          parent: "outerRoot",
          components: [],
          assetUrl: "body.prefab",
          isClone: true,
          modifications: [],
          removedEntities: [],
          removedComponents: []
        } as any,
        {
          strippedId: "lhHandle",
          prefabInstanceId: "bodyInst",
          prefabSource: { assetId: "", entityId: "0" },
          components: [],
          children: ["ws1"]
        } as any,
        {
          strippedId: "rhHandle",
          prefabInstanceId: "bodyInst",
          prefabSource: { assetId: "", entityId: "1" },
          components: [],
          children: ["ws2", "ws3"]
        } as any,
        { id: "ws1", name: "weaponslot1", parent: "lhHandle", components: [] },
        { id: "ws2", name: "weaponslot2", parent: "rhHandle", components: [] },
        { id: "ws3", name: "weaponslot3", parent: "rhHandle", components: [] }
      ]
    };

    const outerPrefab = await PrefabParser.parse(engine, "player.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();
    const bodyInst = root.children.find((c) => c.name === "body")!;
    const leftHand = bodyInst.children.find((c) => c.name === "LeftHand")!;
    const rightHand = bodyInst.children.find((c) => c.name === "RightHand")!;

    const slot1 = leftHand.children.find((c) => c.name === "weaponslot1");
    const slot2 = rightHand.children.find((c) => c.name === "weaponslot2");
    const slot3 = rightHand.children.find((c) => c.name === "weaponslot3");

    expect(slot1, "weaponslot1 under LeftHand").not.toBeUndefined();
    expect(slot2, "weaponslot2 under RightHand").not.toBeUndefined();
    expect(slot3, "weaponslot3 under RightHand").not.toBeUndefined();

    // No new entities should remain as direct children of outerRoot after reparenting
    expect(root.children.find((c) => c.name === "weaponslot1")).toBeUndefined();
    expect(root.children.find((c) => c.name === "lh-proxy")).toBeUndefined();

    root.destroy();
    removeCachedPrefab("body.prefab");
  });

  it("should propagate internal entity transform changes to the attached child (bone-drives-weapon behavior)", async () => {
    // When an internal entity moves, the child attached through the stripped
    // entity follows through normal hierarchy transforms.
    const nestedPrefabData: IHierarchyFile = {
      entities: [
        { id: "0", name: "nestedRoot", components: [], children: ["1"] },
        { id: "1", name: "bone", parent: "0", components: [] }
      ]
    };
    const nestedPrefab = await PrefabParser.parse(engine, "skel.prefab", nestedPrefabData);
    cachePrefab("skel.prefab", nestedPrefab);

    const outerPrefabData: IHierarchyFile = {
      entities: [
        {
          id: "outerRoot",
          name: "Actor",
          components: [],
          children: ["skelInst"]
        },
        {
          id: "skelInst",
          name: "skel",
          parent: "outerRoot",
          components: [],
          assetUrl: "skel.prefab",
          isClone: true,
          modifications: [],
          removedEntities: [],
          removedComponents: []
        } as any,
        {
          strippedId: "boneHandle",
          prefabInstanceId: "skelInst",
          prefabSource: { assetId: "", entityId: "0" },
          components: [],
          children: ["weapon"]
        } as any,
        {
          id: "weapon",
          name: "weapon",
          parent: "boneHandle",
          components: [],
          position: { x: 1, y: 0, z: 0 }
        }
      ]
    };

    const outerPrefab = await PrefabParser.parse(engine, "actor.prefab", outerPrefabData);
    const root = outerPrefab.instantiate();
    const bone = root.children.find((c) => c.name === "skel")!.children.find((c) => c.name === "bone")!;
    const weapon = bone.children.find((c) => c.name === "weapon")!;

    // Initial: bone at origin, weapon world position = (1, 0, 0)
    const worldPos = new Vector3();
    worldPos.copyFrom(weapon.transform.worldPosition);
    expect(worldPos.x).toBeCloseTo(1, 5);
    expect(worldPos.y).toBeCloseTo(0, 5);
    expect(worldPos.z).toBeCloseTo(0, 5);

    // Simulate transform animation: move bone to (10, 5, -3)
    bone.transform.setPosition(10, 5, -3);
    worldPos.copyFrom(weapon.transform.worldPosition);
    expect(worldPos.x).toBeCloseTo(11, 5); // 10 + 1
    expect(worldPos.y).toBeCloseTo(5, 5); //  5 + 0
    expect(worldPos.z).toBeCloseTo(-3, 5); // -3 + 0

    root.destroy();
    removeCachedPrefab("skel.prefab");
  });
});
