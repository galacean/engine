import { AssetPromise, AssetType, ResourceManager, Scene } from "@galacean/engine-core";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

describe("SceneLoader cache policy", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    engine.destroy();
  });

  it("SceneLoader should have useCache disabled", () => {
    const sceneLoader = ResourceManager._loaders[AssetType.Scene];
    expect(sceneLoader).to.not.be.undefined;
    expect(sceneLoader.useCache).to.eq(false);
  });

  it("PrimitiveMeshLoader should also have useCache disabled (existing convention)", () => {
    const loader = ResourceManager._loaders[AssetType.PrimitiveMesh];
    expect(loader).to.not.be.undefined;
    expect(loader.useCache).to.eq(false);
  });

  it("Texture loader should still have useCache enabled (immutable asset)", () => {
    const loader = ResourceManager._loaders[AssetType.Texture];
    expect(loader).to.not.be.undefined;
    expect(loader.useCache).to.eq(true);
  });

  describe("loadScene behavior", () => {
    function mockSceneLoad() {
      const loader = ResourceManager._loaders[AssetType.Scene];
      return vi.spyOn(loader, "load").mockImplementation(
        () =>
          new AssetPromise<Scene>((resolve) => {
            resolve(new Scene(engine, "mock"));
          })
      );
    }

    it("should activate a fresh Scene instance and destroy the old one on sequential loads of the same url", async () => {
      mockSceneLoad();
      const sceneManager = engine.sceneManager;

      const first = await sceneManager.loadScene("/mock-sequential.scene");
      const second = await sceneManager.loadScene("/mock-sequential.scene");

      expect(second).not.toBe(first);
      expect(first.destroyed).toBe(true);
      expect(second.destroyed).toBe(false);
      expect(sceneManager.scenes[0]).toBe(second);
    });

    it("should destroy every old scene when multiple scenes are active", async () => {
      mockSceneLoad();
      const sceneManager = engine.sceneManager;
      sceneManager.addScene(new Scene(engine, "extra1"));
      sceneManager.addScene(new Scene(engine, "extra2"));
      const oldScenes = [...sceneManager.scenes];
      expect(oldScenes.length).toBeGreaterThanOrEqual(2);

      const scene = await sceneManager.loadScene("/mock-multi.scene");

      for (const oldScene of oldScenes) {
        expect(oldScene.destroyed).toBe(true);
      }
      expect(scene.destroyed).toBe(false);
      expect(sceneManager.scenes.length).toBe(1);
      expect(sceneManager.scenes[0]).toBe(scene);
    });

    it("should not destroy the activated scene when concurrent loads of the same url share one loading promise", async () => {
      const loadSpy = mockSceneLoad();
      const sceneManager = engine.sceneManager;

      const [first, second] = await Promise.all([
        sceneManager.loadScene("/mock-concurrent.scene"),
        sceneManager.loadScene("/mock-concurrent.scene")
      ]);

      // The in-flight loading promise is shared regardless of useCache
      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);
      expect(first.destroyed).toBe(false);
      expect(sceneManager.scenes.length).toBe(1);
      expect(sceneManager.scenes[0]).toBe(first);
    });
  });
});
