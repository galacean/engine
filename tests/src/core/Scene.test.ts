import { Engine, Entity, Scene } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("Scene", () => {
  let engine: Engine;
  let scene: Scene;
 before(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });

    engine.run();
    scene = engine.sceneManager.scenes[0];
  });

  beforeEach(() => {
    scene.createRootEntity("root");
  });
  describe("Find entity", () => {
    it("findEntityByName", () => {
      const parent = new Entity(engine, "parent");
      scene.addRootEntity(parent);
      const child = new Entity(engine, "child");
      child.parent = parent;
      const child2 = new Entity(engine, "child2");
      child2.parent = parent;
      expect(scene.findEntityByName("parent")).eq(parent);
      expect(scene.findEntityByName("child")).eq(child);
      expect(scene.findEntityByName("child2")).eq(child2);
      scene.removeRootEntity(scene.rootEntities[0]);
      scene.removeRootEntity(scene.rootEntities[0]);
    });
  });

  describe("rootEntities", () => {
    it("sibling index", () => {
      scene.removeRootEntity(scene.rootEntities[0]);
      const child0 = new Entity(engine, "child0");
      const child1 = new Entity(engine, "child1");
      const child2 = new Entity(engine, "child2");
      const child3 = new Entity(engine, "child3");

      // insert index
      scene.addRootEntity(child0);
      scene.addRootEntity(child2);
      scene.addRootEntity(child3);
      scene.addRootEntity(1, child1);

      expect(child0).eq(scene.rootEntities[0]);
      expect(child1).eq(scene.rootEntities[1]);
      expect(child2).eq(scene.rootEntities[2]);
      expect(child3).eq(scene.rootEntities[3]);
      expect(child0.siblingIndex).eq(0);
      expect(child1.siblingIndex).eq(1);
      expect(child2.siblingIndex).eq(2);
      expect(child3.siblingIndex).eq(3);

      // high index to low index
      child2.siblingIndex = 0;
      expect(child2).eq(scene.rootEntities[0]);
      expect(child0).eq(scene.rootEntities[1]);
      expect(child1).eq(scene.rootEntities[2]);
      expect(child3).eq(scene.rootEntities[3]);
      expect(child2.siblingIndex).eq(0);
      expect(child0.siblingIndex).eq(1);
      expect(child1.siblingIndex).eq(2);
      expect(child3.siblingIndex).eq(3);

      // low index to high index
      child2.siblingIndex = 3;
      expect(child0).eq(scene.rootEntities[0]);
      expect(child1).eq(scene.rootEntities[1]);
      expect(child3).eq(scene.rootEntities[2]);
      expect(child2).eq(scene.rootEntities[3]);
      expect(child0.siblingIndex).eq(0);
      expect(child1.siblingIndex).eq(1);
      expect(child3.siblingIndex).eq(2);
      expect(child2.siblingIndex).eq(3);

      // remove entity
      scene.removeRootEntity(child1);
      expect(child0).eq(scene.rootEntities[0]);
      expect(child3).eq(scene.rootEntities[1]);
      expect(child2).eq(scene.rootEntities[2]);
      expect(child0.siblingIndex).eq(0);
      expect(child3.siblingIndex).eq(1);
      expect(child2.siblingIndex).eq(2);
      expect(child1.siblingIndex).eq(-1);
    });
    it("destroy entity", () => {
      expect(scene.rootEntities.length).eq(4);
      scene.rootEntities[0].destroy();
      expect(scene.rootEntities.length).eq(3);
    });

    it("Root entity enable", () => {
      const scene = new Scene(engine);
      const child0 = new Entity(engine, "child0");
      const child1 = new Entity(engine, "child1");
      scene.addRootEntity(child0);
      scene.addRootEntity(child1);
      engine.sceneManager.addScene(scene);
      expect(child0.isActiveInHierarchy).eq(true);
      expect(child1.isActiveInHierarchy).eq(true);
      scene.destroy();
    });

    it("Cross scene add entity", () => {
      const secondScene = new Scene(engine);
      const child0 = new Entity(engine, "child0");
      secondScene.addRootEntity(child0);
      expect(secondScene.rootEntities.length).eq(1);

      const sceneRootEntityCount = scene.rootEntities.length;
      scene.addRootEntity(child0);
      expect(secondScene.rootEntities.length).eq(0);
      expect(scene.rootEntities.length).eq(sceneRootEntityCount + 1);
      secondScene.destroy();
    });

    it("Child entity became root entity", () => {
      const child0 = new Entity(engine, "child0");
      const child1 = new Entity(engine, "child1");
      child0.addChild(child1);
      scene.addRootEntity(child0);
      expect(child0.children.length).eq(1);

      const previousSceneRootEntityCount = scene.rootEntities.length;
      scene.addRootEntity(child1);
      expect(child1.children.length).eq(0);
      expect(scene.rootEntities.length).eq(previousSceneRootEntityCount + 1);

      child0.destroy();
      expect(scene.rootEntities.length).eq(previousSceneRootEntityCount);
    });
  });

  describe("MultiScene test", () => {
    it("Add and remove", () => {
      const scene = new Scene(engine);

      engine.sceneManager.addScene(scene);
      expect(engine.sceneManager.scenes.length).eq(2);

      engine.sceneManager.removeScene(scene);
      expect(engine.sceneManager.scenes.length).eq(1);
    });

    it("The second scene destroy", () => {
      const scene = new Scene(engine);
      engine.sceneManager.addScene(scene);

      scene.destroy();
      expect(engine.sceneManager.scenes.length).eq(1);
    });
  });

  describe("destroy", () => {
    it("all destroy", () => {
      scene.createRootEntity("root1");
      scene.createRootEntity("root2");
      scene.createRootEntity("root3");
      scene.createRootEntity("root4");
      scene.createRootEntity("root5");
      scene.destroy();
      expect(scene.destroyed).eq(true);
      expect(scene.rootEntitiesCount).eq(0);
    });
  });
});
