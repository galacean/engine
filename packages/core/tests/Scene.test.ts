import { Engine } from "../src/Engine";
import { Entity } from "../src/index";

describe("Scene test", () => {
  const engine = new Engine({ width: 1024, height: 1024 }, { init: jest.fn(), canIUse: jest.fn() });
  const scene = engine.sceneManager.activeScene;
  engine.run();

  describe("test - root entity", () => {
    const entity = new Entity(engine);

    it("No root entity by default", () => {
      expect(scene.rootEntitiesCount).toBe(0);
      expect(scene.engine).not.toBe(null);
    });

    it("Add root entity", () => {
      scene.addRootEntity(entity);
      expect(scene.rootEntitiesCount).toBe(1);
      expect(scene.getRootEntity()).toBe(entity);
    });

    it("Remove root entity", () => {
      expect(scene.rootEntitiesCount).toBe(1);
      scene.removeRootEntity(entity);
      expect(scene.rootEntitiesCount).toBe(0);
      expect(scene.getRootEntity()).not.toBeDefined();

      scene.addRootEntity(entity);
    });
  });

  it("test - destory", () => {
    // before
    expect(scene.destroyed).toBeFalsy();
    expect(scene.rootEntitiesCount).not.toBe(0);

    // after
    scene.destroy();
    expect(scene.destroy).toBeTruthy();
    expect(scene.rootEntitiesCount).toBe(0);
    expect(scene.engine.sceneManager.activeScene).not.toBe(scene);
  });
});
