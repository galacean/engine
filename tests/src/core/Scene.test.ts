import { Entity, Script } from "@oasis-engine/core";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { expect } from "chai";

class TestComponent extends Script {}

describe("Scene", () => {
  const engine = new WebGLEngine(document.createElement("canvas"));
  const scene = engine.sceneManager.activeScene;
  engine.run();
  beforeEach(() => {
    scene.createRootEntity("root");
  });

  describe("rootEntities", () => {
    it("sibling index", () => {
      scene.addRootEntity(new Entity(engine, "child0"));
      scene.addRootEntity(new Entity(engine, "child2"));
      scene.addRootEntity(new Entity(engine, "child3"));
      scene.addRootEntity(1, new Entity(engine, "child1"));

      expect(scene.rootEntities[0].siblingIndex).eq(0);
      expect(scene.rootEntities[1].siblingIndex).eq(1);
      expect(scene.rootEntities[2].siblingIndex).eq(2);
      expect(scene.rootEntities[3].siblingIndex).eq(3);

      scene.rootEntities[2].siblingIndex = 0;
      expect(scene.rootEntities[0].siblingIndex).eq(0);
      expect(scene.rootEntities[1].siblingIndex).eq(1);
      expect(scene.rootEntities[2].siblingIndex).eq(2);
      expect(scene.rootEntities[3].siblingIndex).eq(3);

      scene.rootEntities[1].siblingIndex = 3;
      expect(scene.rootEntities[0].siblingIndex).eq(0);
      expect(scene.rootEntities[1].siblingIndex).eq(1);
      expect(scene.rootEntities[2].siblingIndex).eq(2);
      expect(scene.rootEntities[3].siblingIndex).eq(3);
    });
  });
});
