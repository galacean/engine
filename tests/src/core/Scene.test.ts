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
      expect(scene.isActive).eq(true);
      scene.isActive = false;
      expect(scene.isActive).eq(false);

      engine.sceneManager.addScene(scene);
      expect(scene["_isActiveInEngine"]).eq(false);
      scene.isActive = true;
      expect(scene["_isActiveInEngine"]).eq(true);

      engine.sceneManager.removeScene(scene);
      expect(scene["_isActiveInEngine"]).eq(false);
      engine.sceneManager.addScene(scene);
      expect(scene["_isActiveInEngine"]).eq(true);
      engine.sceneManager.removeScene(scene);
    });

    it("The second scene destroy", () => {
      const scene = new Scene(engine);
      engine.sceneManager.addScene(scene);

      scene.destroy();
      expect(engine.sceneManager.scenes.length).eq(1);
    });
  });

  describe("destroy", () => {
    it("drains remaining pending destroys and resets frame state when an earlier queued destroy throws", () => {
      class ThrowingDestroyScript extends Script {
        override onDestroy(): void {
          throw new Error("queued-destroy-boom");
        }
      }
      class TrackingDestroyScript extends Script {
        destroyedCount = 0;
        override onDestroy(): void {
          this.destroyedCount++;
        }
      }
      class QueueDestroysScript extends Script {
        targets: Script[] = [];
        triggered = false;
        override onUpdate(): void {
          if (this.triggered) return;
          this.triggered = true;
          for (const target of this.targets) {
            target.destroy();
          }
        }
      }

      const testScene = new Scene(engine);
      engine.sceneManager.addScene(testScene);
      try {
        const root = testScene.createRootEntity("pending-destroy-root");
        const throwing = root.addComponent(ThrowingDestroyScript);
        const survivor = root.addComponent(TrackingDestroyScript);
        const driver = root.addComponent(QueueDestroysScript);
        driver.targets = [throwing, survivor];

        expect(() => engine.update()).toThrow("queued-destroy-boom");
        expect(throwing.destroyed).toBe(true);
        expect(throwing.pendingDestroy).toBe(false);
        expect(survivor.destroyed).toBe(true);
        expect(survivor.pendingDestroy).toBe(false);
        expect(survivor.destroyedCount).toBe(1);
        expect((engine as any)._frameInProcess).toBe(false);

        // Subsequent immediate destroy works cleanly (not stuck in deferred frame mode)
        const followUp = testScene.createRootEntity("follow-up");
        followUp.destroy();
        expect(followUp.destroyed).toBe(true);
      } finally {
        testScene.destroy();
      }
    });

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

    it("still invokes Script.onDestroy when Script.onDisable throws during destroy", () => {
      class ThrowingDisableScript extends Script {
        onDestroyCalled = false;
        override onDisable(): void {
          throw new Error("script-disable-boom");
        }
        override onDestroy(): void {
          this.onDestroyCalled = true;
        }
      }

      const testScene = new Scene(engine);
      engine.sceneManager.addScene(testScene);
      try {
        const entity = testScene.createRootEntity("script-disable-root");
        const script = entity.addComponent(ThrowingDisableScript);
        expect(() => script.destroy()).toThrow("script-disable-boom");
        expect(script.destroyed).toBe(true);
        expect(script.onDestroyCalled).toBe(true);
      } finally {
        testScene.destroy();
      }
    });

    it("preserves firstError in Engine.update when both pending destroy and deferred Engine.destroy throw, and finishes Engine.destroy across remaining scenes", async () => {
      class ThrowingPendingScript extends Script {
        override onDestroy(): void {
          throw new Error("first-pending-error");
        }
      }
      class ThrowingScene1Script extends Script {
        override onDestroy(): void {
          throw new Error("scene1-destroy-error");
        }
      }
      class TrackingScene2Script extends Script {
        destroyedFlag = false;
        override onDestroy(): void {
          this.destroyedFlag = true;
        }
      }
      class FrameDriverScript extends Script {
        target!: Script;
        triggered = false;
        override onUpdate(): void {
          if (this.triggered) return;
          this.triggered = true;
          this.target.destroy();
          this.engine.destroy();
        }
      }

      // Case A: Engine.update() pending destroy throws firstError AND deferred _destroy() also throws
      const tempEngineA = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const sceneA1 = tempEngineA.sceneManager.scenes[0];
      const sceneA2 = new Scene(tempEngineA);
      tempEngineA.sceneManager.addScene(sceneA2);

      const entityA1 = sceneA1.createRootEntity("a1");
      const pendingThrow = entityA1.addComponent(ThrowingPendingScript);
      entityA1.addComponent(ThrowingScene1Script);
      const driver = entityA1.addComponent(FrameDriverScript);
      driver.target = pendingThrow;

      const entityA2 = sceneA2.createRootEntity("a2");
      const trackA2 = entityA2.addComponent(TrackingScene2Script);

      expect(() => tempEngineA.update()).toThrow("first-pending-error");
      expect((tempEngineA as any)._frameInProcess).toBe(false);
      expect(tempEngineA.destroyed).toBe(true);
      expect(sceneA1.destroyed).toBe(true);
      expect(sceneA2.destroyed).toBe(true);
      expect(trackA2.destroyedFlag).toBe(true);
      expect(tempEngineA.sceneManager._allCreatedScenes.length).toBe(0);

      // Case B: Direct Engine.destroy() with 2 scenes where scene 1 throws -> scene 2 and engine still tear down cleanly
      const tempEngineB = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const sceneB1 = tempEngineB.sceneManager.scenes[0];
      const sceneB2 = new Scene(tempEngineB);
      tempEngineB.sceneManager.addScene(sceneB2);

      sceneB1.createRootEntity("b1").addComponent(ThrowingScene1Script);
      const trackB2 = sceneB2.createRootEntity("b2").addComponent(TrackingScene2Script);

      expect(() => tempEngineB.destroy()).toThrow("scene1-destroy-error");
      expect(tempEngineB.destroyed).toBe(true);
      expect(sceneB1.destroyed).toBe(true);
      expect(sceneB2.destroyed).toBe(true);
      expect(trackB2.destroyedFlag).toBe(true);
      expect(tempEngineB.sceneManager._allCreatedScenes.length).toBe(0);
    });

    it("drains pending destroys in Engine.update finally when onUpdate throws", () => {
      class TrackingDestroyScript extends Script {
        onDestroyCount = 0;
        override onDestroy(): void {
          this.onDestroyCount++;
        }
      }
      class ThrowingDestroyScript extends Script {
        override onDestroy(): void {
          throw new Error("secondary-destroy-error");
        }
      }
      class ThrowAfterQueueScript extends Script {
        targets: Script[] = [];
        triggered = false;
        override onUpdate(): void {
          if (this.triggered) return;
          this.triggered = true;
          for (const target of this.targets) {
            target.destroy();
          }
          throw new Error("update-boom");
        }
      }

      const testScene = new Scene(engine);
      engine.sceneManager.addScene(testScene);
      try {
        const root = testScene.createRootEntity("update-throw-root");
        const throwingDestroy = root.addComponent(ThrowingDestroyScript);
        const survivor = root.addComponent(TrackingDestroyScript);
        const driver = root.addComponent(ThrowAfterQueueScript);
        driver.targets = [throwingDestroy, survivor];

        // Primary onUpdate error is preserved while pending destroys still drain before update returns
        expect(() => engine.update()).toThrow("update-boom");
        expect(throwingDestroy.destroyed).toBe(true);
        expect(throwingDestroy.pendingDestroy).toBe(false);
        expect(survivor.destroyed).toBe(true);
        expect(survivor.pendingDestroy).toBe(false);
        expect(survivor.onDestroyCount).toBe(1);
        expect((engine as any)._pendingDestroyObjects.length).toBe(0);
        expect((engine as any)._frameInProcess).toBe(false);
      } finally {
        testScene.destroy();
      }
    });

    it("preserves list-vs-scene ownership invariant when onDisable relocates or reparents during addRootEntity/removeRootEntity", () => {
      // Case A: Moving [r1, r2] from active Scene A -> inactive Scene B where r1.onDisable calls sceneC.addRootEntity(r1)
      const sceneA = new Scene(engine, "sceneA");
      const sceneB = new Scene(engine, "sceneB"); // inactive
      const sceneC = new Scene(engine, "sceneC");
      engine.sceneManager.addScene(sceneA);
      engine.sceneManager.addScene(sceneC);

      try {
        const r1 = sceneA.createRootEntity("r1");
        const r2 = sceneA.createRootEntity("r2");
        r1.addComponent(
          class extends Script {
            override onDisable(): void {
              sceneC.addRootEntity(r1);
            }
          }
        );

        // Fail-fast index bounds validation before onDisable runs
        expect(() => sceneB.addRootEntity(5, r1)).toThrow(/out of child list bounds/);
        expect(sceneA.rootEntities).toEqual([r1, r2]);
        expect(r1.scene).toBe(sceneA);
        expect(sceneB.rootEntities).toEqual([]);
        expect(sceneC.rootEntities).toEqual([]);

        // Relocating r1 inside onDisable must not evict innocent sibling r2 or leave r1 in both B and C
        expect(() => sceneB.addRootEntity(r1)).toThrow();
        expect(sceneC.rootEntities).toEqual([r1]);
        expect(r1.scene).toBe(sceneC);
        expect(r1.siblingIndex).toBe(0);
        expect(sceneA.rootEntities).toEqual([r2]);
        expect(r2.scene).toBe(sceneA);
        expect(r2.siblingIndex).toBe(0);
        expect(sceneB.rootEntities).toEqual([]);

        sceneA.destroy();
        sceneB.destroy();
        sceneC.destroy();
        expect(sceneA.destroyed).toBe(true);
        expect(sceneB.destroyed).toBe(true);
        expect(sceneC.destroyed).toBe(true);
      } finally {
        if (!sceneA.destroyed) sceneA.destroy();
        if (!sceneB.destroyed) sceneB.destroy();
        if (!sceneC.destroyed) sceneC.destroy();
      }

      // Case B: removeRootEntity when onDisable relocates root to another scene or reparents it within the same scene
      const sceneD = new Scene(engine, "sceneD");
      const sceneE = new Scene(engine, "sceneE");
      engine.sceneManager.addScene(sceneD);
      engine.sceneManager.addScene(sceneE);
      try {
        const d1 = sceneD.createRootEntity("d1");
        const d2 = sceneD.createRootEntity("d2");
        d1.addComponent(
          class extends Script {
            override onDisable(): void {
              sceneE.addRootEntity(d1);
            }
          }
        );
        expect(() => sceneD.removeRootEntity(d1)).toThrow();
        expect(sceneE.rootEntities).toEqual([d1]);
        expect(d1.scene).toBe(sceneE);
        expect(sceneD.rootEntities).toEqual([d2]);
        expect(d2.scene).toBe(sceneD);
        expect(d2.siblingIndex).toBe(0);

        const d3 = sceneD.createRootEntity("d3");
        const inactiveHolder = sceneD.createRootEntity("inactiveHolder");
        inactiveHolder.isActive = false;
        d3.addComponent(
          class extends Script {
            override onDisable(): void {
              inactiveHolder.addChild(d3);
            }
          }
        );
        // Reparenting d3 within sceneD during removeRootEntity must NOT wipe d3.scene to null
        expect(() => sceneD.removeRootEntity(d3)).not.toThrow();
        expect(d3.parent).toBe(inactiveHolder);
        expect(inactiveHolder.children).toEqual([d3]);
        expect(d3.scene).toBe(sceneD);
        expect(sceneD.rootEntities).toEqual([d2, inactiveHolder]);

        sceneD.destroy();
        sceneE.destroy();
        expect(sceneD.destroyed).toBe(true);
        expect(sceneE.destroyed).toBe(true);
      } finally {
        if (!sceneD.destroyed) sceneD.destroy();
        if (!sceneE.destroyed) sceneE.destroy();
      }
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
