import "@galacean/engine-loader";
import { AssetPromise, BackgroundMode, Scene } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import type { SceneFile } from "../../../packages/loader/src/schema/SceneSchema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sceneFile: SceneFile = {
  version: "2.0",
  refs: [],
  entities: [{ name: "root" }],
  components: [],
  scene: {
    name: "main",
    rootEntities: [0],
    background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] }
  }
};

describe("SceneManager.loadScene", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  afterAll(() => {
    engine.destroy();
  });

  it("loads overlapping same-URL requests into independent scenes", async () => {
    const resolves: ((value: SceneFile) => void)[] = [];
    const request = vi
      .spyOn(engine.resourceManager as any, "_request")
      .mockImplementation(
        () => new AssetPromise((resolve) => resolves.push(resolve as (value: SceneFile) => void)) as any
      );

    try {
      const firstPromise = engine.sceneManager.loadScene("main.scene");
      const secondPromise = engine.sceneManager.loadScene("main.scene");

      resolves[0](sceneFile);
      const first = await firstPromise;
      resolves[1](sceneFile);
      const second = await secondPromise;

      expect(first).not.toBe(second);
      expect(first.destroyed).toBe(true);
      expect(second.destroyed).toBe(false);
      expect(second.rootEntities).toHaveLength(1);
      expect(second.rootEntities[0].name).toBe("root");
      expect(engine.sceneManager.activeScene).toBe(second);
    } finally {
      request.mockRestore();
    }
  });

  it("keeps overlapping same-URL requests independent when the second finishes first", async () => {
    const resolves: ((value: SceneFile) => void)[] = [];
    const request = vi
      .spyOn(engine.resourceManager as any, "_request")
      .mockImplementation(
        () => new AssetPromise((resolve) => resolves.push(resolve as (value: SceneFile) => void)) as any
      );

    try {
      const firstPromise = engine.sceneManager.loadScene("main.scene");
      const secondPromise = engine.sceneManager.loadScene("main.scene");

      resolves[1](sceneFile);
      const second = await secondPromise;
      resolves[0](sceneFile);
      const first = await firstPromise;

      expect(first).not.toBe(second);
      expect(second.destroyed).toBe(true);
      expect(first.destroyed).toBe(false);
      expect(first.rootEntities).toHaveLength(1);
      expect(first.rootEntities[0].name).toBe("root");
      expect(engine.sceneManager.activeScene).toBe(first);
    } finally {
      request.mockRestore();
    }
  });

  it("destroys every active scene while activating the fresh scene", async () => {
    const request = vi
      .spyOn(engine.resourceManager as any, "_request")
      .mockReturnValue(AssetPromise.resolve(sceneFile) as any);

    try {
      const sceneManager = engine.sceneManager;
      const extraScenes = [new Scene(engine, "extra-1"), new Scene(engine, "extra-2")];
      extraScenes.forEach((scene) => sceneManager.addScene(scene));
      const oldScenes = [...sceneManager.scenes];

      const scene = await sceneManager.loadScene("main.scene");

      oldScenes.forEach((oldScene) => expect(oldScene.destroyed).toBe(true));
      expect(scene.destroyed).toBe(false);
      expect(sceneManager.scenes).toEqual([scene]);
    } finally {
      request.mockRestore();
    }
  });
});
