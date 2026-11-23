import { BackgroundMode, Engine, Entity, Scene, Script, TextureFormat, Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("Scene", () => {
  let engine: Engine;
  let scene: Scene;
  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });

    engine.run();
    scene = engine.sceneManager.scenes[0];
    scene.background.mode = BackgroundMode.Texture;
    const texture2D = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8_UNorm, false);
    texture2D.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
    scene.background.texture = texture2D;
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
      engine.sceneManager.addScene(0, scene);
      expect(engine.sceneManager.scenes.length).eq(2);

      engine.sceneManager.removeScene(scene);
      expect(engine.sceneManager.scenes.length).eq(1);
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

  describe("MultiScene isActive test", () => {
    it("Add and remove", () => {
      const scene = new Scene(engine);
      const root = scene.createRootEntity();
      expect(scene.isActive).eq(true);
      scene.isActive = false;
      expect(scene.isActive).eq(false);

      engine.sceneManager.addScene(scene);
      expect(root.isActiveInHierarchy).eq(false);
      scene.isActive = true;
      expect(root.isActiveInHierarchy).eq(true);

      engine.sceneManager.removeScene(scene);
      expect(root.isActiveInHierarchy).eq(false);
      engine.sceneManager.addScene(scene);
      expect(root.isActiveInHierarchy).eq(true);
      scene.destroy();
    });

    it("lets a newly attached child's onAwake deactivate the scene", () => {
      const scene = new Scene(engine);
      engine.sceneManager.addScene(scene);
      const parent = scene.createRootEntity();
      const child = new Entity(engine);
      const callbacks: string[] = [];
      child.addComponent(
        class extends Script {
          override onAwake(): void {
            scene.isActive = false;
            callbacks.push("awake");
          }

          override onEnable(): void {
            callbacks.push("enable");
          }
        }
      );
      try {
        parent.addChild(child);
        expect([scene.isActive, parent.isActiveInHierarchy, child.isActiveInHierarchy]).toEqual([false, false, false]);
        expect(callbacks).toEqual(["awake"]);
      } finally {
        scene.destroy();
      }
    });

    it("stops activating other roots when an awake entity becomes a child and deactivates the scene", () => {
      const scene = new Scene(engine);
      scene.isActive = false;
      engine.sceneManager.addScene(scene);
      const untouched = scene.createRootEntity();
      const mover = scene.createRootEntity();
      const parent = scene.createRootEntity();
      mover.addComponent(
        class extends Script {
          override onAwake(): void {
            parent.addChild(this.entity);
            scene.isActive = false;
          }
        }
      );
      try {
        scene.isActive = true;
        expect(mover.parent).toBe(parent);
        expect(scene.isActive).toBe(false);
        expect([untouched, mover, parent].map((entity) => entity.isActiveInHierarchy)).toEqual([false, false, false]);
      } finally {
        scene.destroy();
      }
    });

    it("deactivates remaining roots when a root onDisable throws", () => {
      const scene = new Scene(engine);
      engine.sceneManager.addScene(scene);
      const earlierRoot = scene.createRootEntity();
      const error = new Error("onDisable failed");
      class ThrowingScript extends Script {
        override onDisable(): void {
          throw error;
        }
      }
      scene.createRootEntity().addComponent(ThrowingScript);

      try {
        expect(() => (scene.isActive = false)).toThrow(error);
        expect(earlierRoot.isActiveInHierarchy).toBe(false);
      } finally {
        scene.destroy();
      }
    });

    it("preserves scene and root activation when onDisable tries to reactivate the scene", () => {
      const scene = new Scene(engine);
      engine.sceneManager.addScene(scene);
      const first = scene.createRootEntity();
      class ReactivatingScript extends Script {
        override onDisable(): void {
          scene.isActive = true;
        }
      }
      const last = scene.createRootEntity();
      last.addComponent(ReactivatingScript);

      try {
        expect(() => (scene.isActive = false)).toThrow();
        expect([scene.isActive, first.isActiveInHierarchy, last.isActiveInHierarchy]).toEqual([false, false, false]);
      } finally {
        scene.destroy();
      }
    });

    it.each([true, false])(
      "keeps scene membership consistent when a root reverses scene registration (%s)",
      (adding) => {
        const manager = engine.sceneManager;
        const scene = new Scene(engine);
        if (!adding) manager.addScene(scene);
        const first = scene.createRootEntity();
        const last = scene.createRootEntity();
        let armed = true;
        last.addComponent(
          class extends Script {
            override onEnable(): void {
              if (armed && adding) manager.removeScene(scene);
            }

            override onDisable(): void {
              if (armed && !adding) manager.addScene(scene);
            }
          }
        );

        try {
          expect(() => (adding ? manager.addScene(scene) : manager.removeScene(scene))).toThrow();
          expect(manager.scenes.includes(scene)).toBe(adding);
          expect(first.isActiveInHierarchy).toBe(adding);
          expect(last.isActiveInHierarchy).toBe(adding);
        } finally {
          armed = false;
          scene.destroy();
        }
      }
    );

    it("deactivates remaining roots when a root onDisable removes earlier roots", () => {
      const scene = new Scene(engine);
      engine.sceneManager.addScene(scene);
      const first = scene.createRootEntity();
      const second = scene.createRootEntity();
      const remaining = scene.createRootEntity();
      class RemovingScript extends Script {
        override onDisable(): void {
          scene.removeRootEntity(first);
          scene.removeRootEntity(second);
        }
      }
      scene.createRootEntity().addComponent(RemovingScript);

      try {
        scene.isActive = false;
        expect(remaining.isActiveInHierarchy).toBe(false);
        expect(first.scene).toBeNull();
        expect(second.scene).toBeNull();
      } finally {
        scene.destroy();
      }
    });

    it("The second scene destroy", () => {
      const scene = new Scene(engine);
      engine.sceneManager.addScene(scene);

      scene.destroy();
      expect(engine.sceneManager.scenes.length).eq(1);
    });
  });

  describe("destroy", () => {
    it("finishes tearing down remaining root entities and scene resources when a child Script.onDestroy throws", () => {
      class ThrowingChildScript extends Script {
        override onDestroy(): void {
          throw new Error("child-script-boom");
        }
      }
      class CleanScript extends Script {
        destroyedFlag = false;
        override onDestroy(): void {
          this.destroyedFlag = true;
        }
      }

      const testScene = new Scene(engine);
      engine.sceneManager.addScene(testScene);
      const root1 = testScene.createRootEntity("root1");
      const badChild = root1.createChild("bad-child");
      badChild.addComponent(ThrowingChildScript);
      const goodSibling = root1.createChild("good-sibling");
      const siblingScript = goodSibling.addComponent(CleanScript);

      const root2 = testScene.createRootEntity("root2");
      const root2Script = root2.addComponent(CleanScript);

      expect(() => testScene.destroy()).toThrow("child-script-boom");
      expect(testScene.destroyed).toBe(true);
      expect(testScene.rootEntitiesCount).toBe(0);
      expect(engine.sceneManager._allCreatedScenes.includes(testScene)).toBe(false);
      expect(badChild.destroyed).toBe(true);
      expect(goodSibling.destroyed).toBe(true);
      expect(siblingScript.destroyedFlag).toBe(true);
      expect(root1.destroyed).toBe(true);
      expect(root2.destroyed).toBe(true);
      expect(root2Script.destroyedFlag).toBe(true);
    });

    it("validates addRootEntity index bounds up front and ignores destroyed targets", () => {
      const sceneA = new Scene(engine, "sceneA");
      const sceneB = new Scene(engine, "sceneB");
      engine.sceneManager.addScene(sceneA);

      try {
        const r1 = sceneA.createRootEntity("r1");
        const r2 = sceneA.createRootEntity("r2");

        expect(() => sceneB.addRootEntity(5, r1)).toThrow(/out of child list bounds/);
        expect(sceneA.rootEntities).toEqual([r1, r2]);
        expect(r1.scene).toBe(sceneA);
        expect(sceneB.rootEntities).toEqual([]);

        sceneB.destroy();
        expect(() => engine.sceneManager.mergeScenes(sceneA, sceneB)).not.toThrow();
        expect(sceneA.rootEntities).toEqual([r1, r2]);
      } finally {
        if (!sceneA.destroyed) sceneA.destroy();
        if (!sceneB.destroyed) sceneB.destroy();
      }
    });

    it("keeps a single root owner if a disable callback attempts to move the same root again", () => {
      const source = new Scene(engine, "source");
      const target = new Scene(engine, "target");
      const redirected = new Scene(engine, "redirected");
      engine.sceneManager.addScene(source);
      const moving = source.createRootEntity("moving");
      const sentinel = source.createRootEntity("sentinel");
      moving.addComponent(
        class extends Script {
          override onDisable(): void {
            redirected.addRootEntity(this.entity);
          }
        }
      );

      expect(() => target.addRootEntity(moving)).toThrow(/lifecycle callbacks/);
      expect(source.rootEntities.map((entity) => entity.name)).toEqual([sentinel.name]);
      expect(target.rootEntities.map((entity) => entity.name)).toEqual([moving.name]);
      expect(redirected.rootEntitiesCount).toBe(0);
      expect(moving.scene === target).toBe(true);

      redirected.destroy();
      target.destroy();
      source.destroy();
    });

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
