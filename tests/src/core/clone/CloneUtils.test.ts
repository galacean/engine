import { CloneUtils, Entity, MeshRenderer } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("CloneUtils", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  afterAll(() => {
    engine?.destroy();
  });

  it("should remap to the correct component when entity has multiple components of same type", () => {
    const srcRoot = new Entity(engine, "srcRoot");
    const child = new Entity(engine, "child");
    srcRoot.addChild(child);

    child.addComponent(MeshRenderer);
    const mesh1 = child.addComponent(MeshRenderer);

    const targetRoot = srcRoot.clone();
    const targetChild = targetRoot.children[0];
    const targetMeshes = targetChild.getComponents(MeshRenderer, []);

    const remapped = CloneUtils.remapComponent(srcRoot, targetRoot, mesh1);

    expect(remapped).toBe(targetMeshes[1]);
    expect(remapped).not.toBe(targetMeshes[0]);
  });
});
