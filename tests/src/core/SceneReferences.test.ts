import { WebGLEngine } from "@galacean/engine";
import { Scene, SceneManager } from "@galacean/engine-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("Scene reference contracts", () => {
  let engine: WebGLEngine;
  let scene: Scene;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });
  beforeEach(() => {
    scene = new Scene(engine);
  });
  afterEach(() => scene.destroy());
  afterAll(() => engine.destroy());

  it("returns undefined for a missing root index", () => {
    expect(scene.getRootEntity()).toBeUndefined();
    const root = scene.createRootEntity("root");
    expect(scene.getRootEntity()).toBe(root);
    expect(scene.getRootEntity(0)).toBe(root);
    expect(scene.getRootEntity(-1)).toBeUndefined();
    expect(scene.getRootEntity(1)).toBeUndefined();
  });

  it("reports an unassigned sun as undefined and a cleared sun as null", () => {
    expect(scene.sun).toBeUndefined();
    scene.sun = null;
    expect(scene.sun).toBeNull();
  });

  it("returns undefined when no scene is registered", () => {
    const manager = new SceneManager(engine);
    expect(manager.activeScene).toBeUndefined();
    manager.activeScene = scene;
    expect(manager.activeScene).toBe(scene);
    manager.activeScene = null;
    expect(manager.activeScene).toBeUndefined();
    manager.activeScene = scene;
    manager.activeScene = undefined;
    expect(manager.activeScene).toBeUndefined();
  });
});
