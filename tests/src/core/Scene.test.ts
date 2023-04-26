import { Engine, Entity, Scene } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("Scene", () => {
  let engine: Engine;
  let scene: Scene;
  before(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  
    engine.run();
    scene = engine.sceneManager.activeScene;
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
  });

  describe("destroy", () => {
    it("all destroy", () => {
      scene.createRootEntity("root1");
      scene.createRootEntity("root2");
      scene.createRootEntity("root3");
      scene.createRootEntity("root4");
      scene.createRootEntity("root5");
      scene.destroy();
      expect(scene.rootEntitiesCount).eq(0);
    });
  });
});
