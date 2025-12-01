import { expect, beforeAll, afterAll, describe, it } from "vitest";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import type { IHierarchyFile } from "@galacean/engine-loader";
import { PrefabParser } from "../../../packages/loader/src/prefab/PrefabParser";

let engine: WebGLEngine;

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
