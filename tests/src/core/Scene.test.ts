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

        // Re-entrant addRootEntity(r1) into sceneC inside onDisable fails fast without mutating lists or evicting r2
        expect(() => sceneB.addRootEntity(r1)).toThrow();
        expect(sceneC.rootEntities).toEqual([]);
        expect(sceneB.rootEntities).toEqual([r1]);
        expect(r1.scene).toBe(sceneB);
        expect(r1.siblingIndex).toBe(0);
        expect(sceneA.rootEntities).toEqual([r2]);
        expect(r2.scene).toBe(sceneA);
        expect(r2.siblingIndex).toBe(0);

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

      // Case B: removeRootEntity when onDisable attempts re-entrant addRootEntity or reparents into inactive holder
      const sceneD = new Scene(engine, "sceneD");
      const sceneE = new Scene(engine, "sceneE");
      engine.sceneManager.addScene(sceneD);
      engine.sceneManager.addScene(sceneE);
      try {
        const d1 = sceneD.createRootEntity("d1");
        const d2 = sceneD.createRootEntity("d2");
        let d1SiblingDisables = 0;
        let d1Updates = 0;
        d1.addComponent(
          class extends Script {
            override onDisable(): void {
              sceneE.addRootEntity(d1);
            }
          }
        );
        d1.addComponent(
          class extends Script {
            override onDisable(): void {
              d1SiblingDisables++;
            }
            override onUpdate(): void {
              d1Updates++;
            }
          }
        );
        expect(() => sceneD.removeRootEntity(d1)).toThrow();
        expect(sceneE.rootEntities).toEqual([]);
        expect(d1.scene).toBeNull();
        expect(d1SiblingDisables).toBe(1);
        expect(sceneD.rootEntities).toEqual([d2]);
        expect(d2.scene).toBe(sceneD);
        expect(d2.siblingIndex).toBe(0);
        engine.update();
        expect(d1Updates).toBe(0);

        // Same-scene reattach during removeRootEntity also fails fast and drains sibling scripts
        const dSame = sceneD.createRootEntity("dSame");
        let dSameDisables = 0;
        let dSameUpdates = 0;
        dSame.addComponent(
          class extends Script {
            override onDisable(): void {
              sceneD.addRootEntity(dSame);
            }
          }
        );
        dSame.addComponent(
          class extends Script {
            override onDisable(): void {
              dSameDisables++;
            }
            override onUpdate(): void {
              dSameUpdates++;
            }
          }
        );
        expect(() => sceneD.removeRootEntity(dSame)).toThrow();
        expect(sceneD.rootEntities).toEqual([d2]);
        expect(dSame.scene).toBeNull();
        expect(dSameDisables).toBe(1);
        engine.update();
        expect(dSameUpdates).toBe(0);

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

      // Case C: addRootEntity when onDisable destroys destination scene cancels transfer AND restores active state in source scene
      const sceneF = new Scene(engine, "sceneF");
      const sceneG = new Scene(engine, "sceneG"); // inactive
      engine.sceneManager.addScene(sceneF);
      try {
        const f1 = sceneF.createRootEntity("f1");
        let enableInSceneCount = 0;
        let f1Updates = 0;
        f1.addComponent(
          class extends Script {
            override _onEnableInScene(): void {
              super._onEnableInScene();
              enableInSceneCount++;
            }
            override onDisable(): void {
              if (!sceneG.destroyed) {
                sceneG.destroy();
              }
            }
            override onUpdate(): void {
              f1Updates++;
            }
          }
        );
        expect(enableInSceneCount).toBe(1);
        expect(() => sceneG.addRootEntity(f1)).not.toThrow();
        expect(sceneG.destroyed).toBe(true);
        expect(sceneG.rootEntities).toEqual([]);
        expect(f1.scene).toBe(sceneF);
        expect(sceneF.rootEntities).toEqual([f1]);
        expect(f1.isActiveInHierarchy).toBe(true);
        expect(enableInSceneCount).toBe(2);
        engine.update();
        expect(f1Updates).toBe(1);

        sceneF.destroy();
        expect(sceneF.destroyed).toBe(true);
      } finally {
        if (!sceneF.destroyed) sceneF.destroy();
        if (!sceneG.destroyed) sceneG.destroy();
      }

      // Case D: mergeScenes stops immediately when onDisable destroys destScene, keeping all roots active & updating in sourceScene
      const mergeSrc = new Scene(engine, "mergeSrc");
      const mergeDst = new Scene(engine, "mergeDst"); // inactive
      engine.sceneManager.addScene(mergeSrc);
      try {
        const mr1 = mergeSrc.createRootEntity("mr1");
        const mr2 = mergeSrc.createRootEntity("mr2");
        let mr1Updates = 0;
        let mr2Updates = 0;
        mr1.addComponent(
          class extends Script {
            override onDisable(): void {
              if (!mergeDst.destroyed) {
                mergeDst.destroy();
              }
            }
            override onUpdate(): void {
              mr1Updates++;
            }
          }
        );
        mr2.addComponent(
          class extends Script {
            override onUpdate(): void {
              mr2Updates++;
            }
          }
        );

        expect(() => engine.sceneManager.mergeScenes(mergeSrc, mergeDst)).not.toThrow();
        expect(mergeDst.destroyed).toBe(true);
        expect(mergeDst.rootEntities).toEqual([]);
        expect(mergeSrc.rootEntities).toEqual([mr1, mr2]);
        expect(mr1.scene).toBe(mergeSrc);
        expect(mr2.scene).toBe(mergeSrc);
        expect(mr1.isActiveInHierarchy).toBe(true);
        expect(mr2.isActiveInHierarchy).toBe(true);
        engine.update();
        expect(mr1Updates).toBe(1);
        expect(mr2Updates).toBe(1);

        // Merging into an already-destroyed destScene is a clean no-op
        expect(() => engine.sceneManager.mergeScenes(mergeSrc, mergeDst)).not.toThrow();
        expect(mergeSrc.rootEntities).toEqual([mr1, mr2]);

        mergeSrc.destroy();
        expect(mergeSrc.destroyed).toBe(true);
      } finally {
        if (!mergeSrc.destroyed) mergeSrc.destroy();
        if (!mergeDst.destroyed) mergeDst.destroy();
      }

      // Case E: Re-entrant self-removal inside onDisable drains sibling scripts (no leaked updates next frame)
      const selfRmScene = new Scene(engine, "selfRmScene");
      const selfRmTarget = new Scene(engine, "selfRmTarget"); // inactive
      engine.sceneManager.addScene(selfRmScene);
      try {
        // E1: removeRootEntity(e1) where Script1 calls removeRootEntity(e1) again
        const e1 = selfRmScene.createRootEntity("e1");
        let s1Disabled = 0;
        let s2Disabled = 0;
        let s1Updates = 0;
        let s2Updates = 0;
        e1.addComponent(
          class extends Script {
            override onDisable(): void {
              s1Disabled++;
              selfRmScene.removeRootEntity(e1);
            }
            override onUpdate(): void {
              s1Updates++;
            }
          }
        );
        e1.addComponent(
          class extends Script {
            override onDisable(): void {
              s2Disabled++;
            }
            override onUpdate(): void {
              s2Updates++;
            }
          }
        );

        expect(() => selfRmScene.removeRootEntity(e1)).not.toThrow();
        expect(e1.scene).toBeNull();
        expect(selfRmScene.rootEntities).toEqual([]);
        expect(s1Disabled).toBe(1);
        expect(s2Disabled).toBe(1);
        engine.update();
        expect(s1Updates).toBe(0);
        expect(s2Updates).toBe(0);

        // E2: Cross-operation addRootEntity(e2) -> Script1.onDisable calls selfRmScene.removeRootEntity(e2)
        const e2 = selfRmScene.createRootEntity("e2");
        const sibling = selfRmScene.createRootEntity("sibling");
        let e2s1Disabled = 0;
        let e2s2Disabled = 0;
        let e2s1Updates = 0;
        let e2s2Updates = 0;
        e2.addComponent(
          class extends Script {
            override onDisable(): void {
              e2s1Disabled++;
              selfRmScene.removeRootEntity(e2);
            }
            override onUpdate(): void {
              e2s1Updates++;
            }
          }
        );
        e2.addComponent(
          class extends Script {
            override onDisable(): void {
              e2s2Disabled++;
            }
            override onUpdate(): void {
              e2s2Updates++;
            }
          }
        );

        expect(() => selfRmTarget.addRootEntity(e2)).not.toThrow();
        expect(e2.scene).toBeNull();
        expect(selfRmScene.rootEntities).toEqual([sibling]);
        expect(sibling.siblingIndex).toBe(0);
        expect(selfRmTarget.rootEntities).toEqual([]);
        expect(e2s1Disabled).toBe(1);
        expect(e2s2Disabled).toBe(1);
        engine.update();
        expect(e2s1Updates).toBe(0);
        expect(e2s2Updates).toBe(0);

        selfRmScene.destroy();
        selfRmTarget.destroy();
      } finally {
        if (!selfRmScene.destroyed) selfRmScene.destroy();
        if (!selfRmTarget.destroyed) selfRmTarget.destroy();
      }

      // Case F: removeRootEntity during onEnable fails fast without half-detaching root
      const enableRmScene = new Scene(engine, "enableRmScene");
      engine.sceneManager.addScene(enableRmScene);
      try {
        const root = enableRmScene.createRootEntity("enable-rm-root");
        root.isActive = false;
        let updates = 0;
        root.addComponent(
          class extends Script {
            override onEnable(): void {
              enableRmScene.removeRootEntity(root);
            }
            override onUpdate(): void {
              updates++;
            }
          }
        );
        expect(() => {
          root.isActive = true;
        }).toThrow();
        expect(root.isActiveInHierarchy).toBe(true);
        expect(root.scene).toBe(enableRmScene);
        expect(enableRmScene.rootEntities).toContain(root);
        engine.update();
        expect(updates).toBe(1);
        enableRmScene.destroy();
      } finally {
        if (!enableRmScene.destroyed) enableRmScene.destroy();
      }

      // Case G: cancelAndThrow (both sync destroy+throw AND in-frame pendingDestroy destination) restores source entity active & updating
      for (const asRoot of [true, false]) {
        for (const inFrame of [false, true]) {
          const src = new Scene(engine, `cancel-src-${asRoot}-${inFrame}`);
          const dst = new Scene(engine, `cancel-dst-${asRoot}-${inFrame}`);
          engine.sceneManager.addScene(src);
          try {
            const target = asRoot ? null : dst.createRootEntity("target");
            const moving = src.createRootEntity("moving");
            let updates = 0;
            let pendingObserved: boolean | undefined;
            let armed = true;
            const move = () => (target ? target.addChild(moving) : dst.addRootEntity(moving));
            moving.addComponent(
              class extends Script {
                override onDisable(): void {
                  if (!armed) return;
                  armed = false;
                  const owner = target ?? dst;
                  owner.destroy();
                  pendingObserved = owner.pendingDestroy;
                  if (!inFrame) {
                    throw new Error("stop transfer");
                  }
                }
                override onUpdate(): void {
                  updates++;
                  if (inFrame && updates === 1) {
                    move();
                  }
                }
              }
            );

            if (inFrame) {
              expect(() => engine.update()).not.toThrow();
              expect(pendingObserved).toBe(true);
            } else {
              expect(() => move()).toThrow("stop transfer");
              expect(pendingObserved).toBe(false);
            }
            expect(moving.destroyed).toBe(false);
            expect(moving.isActiveInHierarchy).toBe(true);
            expect(src.rootEntities).toContain(moving);
            engine.update();
            expect(updates).toBe(inFrame ? 2 : 1);
          } finally {
            if (!src.destroyed) src.destroy();
            if (!dst.destroyed) dst.destroy();
          }
        }
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
