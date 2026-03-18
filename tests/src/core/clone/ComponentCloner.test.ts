import { Entity, MeshRenderer, Script } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

class DiceScript extends Script {
  skinMesh: MeshRenderer = null;
}

class TestEntityRefScript extends Script {
  targetEntity: Entity = null;
}

describe("ComponentCloner auto-remap references", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  afterAll(() => {
    engine?.destroy();
  });

  it("should remap undecorated Component reference on Script after clone", () => {
    const root = new Entity(engine, "root");
    const child = new Entity(engine, "child");
    root.addChild(child);

    const meshRenderer = child.addComponent(MeshRenderer);
    const script = root.addComponent(DiceScript);
    script.skinMesh = meshRenderer;

    const clonedRoot = root.clone();
    const clonedScript = clonedRoot.getComponent(DiceScript);
    const clonedMesh = clonedRoot.children[0].getComponent(MeshRenderer);

    expect(clonedScript.skinMesh).toBe(clonedMesh);
    expect(clonedScript.skinMesh).not.toBe(meshRenderer);
  });

  it("should preserve external Component reference", () => {
    const external = new Entity(engine, "external");
    const externalMesh = external.addComponent(MeshRenderer);

    const root = new Entity(engine, "root");
    const script = root.addComponent(DiceScript);
    script.skinMesh = externalMesh;

    const clonedRoot = root.clone();
    const clonedScript = clonedRoot.getComponent(DiceScript);

    expect(clonedScript.skinMesh).toBe(externalMesh);
  });

  it("should remap undecorated Entity reference on Script after clone", () => {
    const root = new Entity(engine, "root");
    const child = new Entity(engine, "child");
    root.addChild(child);

    const script = root.addComponent(TestEntityRefScript);
    script.targetEntity = child;

    const clonedRoot = root.clone();
    const clonedScript = clonedRoot.getComponent(TestEntityRefScript);

    expect(clonedScript.targetEntity).toBe(clonedRoot.children[0]);
    expect(clonedScript.targetEntity).not.toBe(child);
  });

  it("should preserve external Entity reference", () => {
    const external = new Entity(engine, "external");

    const root = new Entity(engine, "root");
    const script = root.addComponent(TestEntityRefScript);
    script.targetEntity = external;

    const clonedRoot = root.clone();
    const clonedScript = clonedRoot.getComponent(TestEntityRefScript);

    expect(clonedScript.targetEntity).toBe(external);
  });
});
