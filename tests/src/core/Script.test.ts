import { Camera, dependentComponents, DependentMode, Entity, Script } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { vi, describe, expect, it } from "vitest";

describe("Script", () => {
  describe("onEnable/onDisable/onAwake", () => {
    it("Add script to Entity", async () => {
      class TestScript extends Script {
        onAwake() {
          // console.log("onAwake");
        }

        onEnable() {
          // console.log("onEnable");
        }

        onDisable() {
          // console.log("onDisable");
        }
      }
      TestScript.prototype.onAwake = vi.fn(TestScript.prototype.onAwake);
      TestScript.prototype.onEnable = vi.fn(TestScript.prototype.onEnable);
      TestScript.prototype.onDisable = vi.fn(TestScript.prototype.onDisable);

      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      engine.run();

      const entity = new Entity(engine);
      rootEntity.addChild(entity);
      const testScript = entity.addComponent(TestScript);

      expect(testScript.onAwake).toHaveBeenCalledOnce();
      expect(testScript.onEnable).toHaveBeenCalledOnce();
      expect(testScript.onDisable).not.toHaveBeenCalled();
    });

    it("Parent onAwake call inAtive child", async () => {
      class ParentScript extends Script {
        onAwake() {
          // console.log("ParentScript_onAwake");
          const child = this.entity.findByName("child");
          child.isActive = false;
        }
        onEnable() {
          // console.log("ParentScript_onEnable");
        }

        onDisable() {
          // console.log("ParentScript_onDisable");
        }
        onUpdate() {
          // console.log("ParentScript_onUpdate");
        }

        onLateUpdate() {
          // console.log("ParentScript_onLateUpdate");
        }

        onDestroy() {
          // console.log("ParentScript_onDestroy");
        }
      }
      ParentScript.prototype.onAwake = vi.fn(ParentScript.prototype.onAwake);
      ParentScript.prototype.onEnable = vi.fn(ParentScript.prototype.onEnable);
      ParentScript.prototype.onDisable = vi.fn(ParentScript.prototype.onDisable);

      class ChildScript extends Script {
        onAwake() {
          // console.log("ChildScript_onAwake");
        }
        onEnable() {
          // console.log("ChildScript_onEnable");
        }

        onDisable() {
          // console.log("ChildScript_onDisable");
        }

        onUpdate() {
          // console.log("ChildScript_onUpdate");
          this.engine.destroy();
        }

        onLateUpdate() {
          // console.log("ChildScript_onLateUpdate");
        }

        onDestroy() {
          // console.log("ChildScript_onDestroy");
        }
      }
      ChildScript.prototype.onAwake = vi.fn(ChildScript.prototype.onAwake);
      ChildScript.prototype.onEnable = vi.fn(ChildScript.prototype.onEnable);
      ChildScript.prototype.onDisable = vi.fn(ChildScript.prototype.onDisable);

      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      engine.run();

      const parent = new Entity(engine);
      const parentScript = parent.addComponent(ParentScript);

      const child = parent.createChild("child");
      const childScript = child.addComponent(ChildScript);

      rootEntity.addChild(parent);

      expect(parentScript.onAwake).toHaveBeenCalledOnce();
      expect(parentScript.onEnable).toHaveBeenCalledOnce();
      expect(parentScript.onDisable).not.toHaveBeenCalled();

      expect(childScript.onAwake).not.toHaveBeenCalled();
      expect(childScript.onEnable).not.toHaveBeenCalled();
      expect(childScript.onDisable).not.toHaveBeenCalled();
    });

    it("Entity isActive = true after script call enabled = false", async () => {
      class TestScript extends Script {
        onAwake() {
          // console.log("TestScript_onAwake");
        }
        onEnable() {
          // console.log("TestScript_onEnable");
        }

        onDisable() {
          // console.log("TestScript_onDisable");
        }

        onDestroy() {
          // console.log("TestScript_onDestroy");
        }
      }
      TestScript.prototype.onAwake = vi.fn(TestScript.prototype.onAwake);
      TestScript.prototype.onEnable = vi.fn(TestScript.prototype.onEnable);
      TestScript.prototype.onDisable = vi.fn(TestScript.prototype.onDisable);

      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      engine.run();

      const entity = rootEntity.createChild("entity");
      const script = entity.addComponent(TestScript);

      entity.isActive = false;
      script.enabled = false;
      entity.isActive = true;
      script.enabled = true;
      entity.isActive = false;

      expect(script.onAwake).toHaveBeenCalledOnce();
      expect(script.onEnable).toHaveBeenCalledTimes(2);
      expect(script.onDisable).toHaveBeenCalledTimes(2);
    });

    it("Script delete in the main loop", async () => {
      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;

      class Script1 extends Script {
        onUpdate(deltaTime: number): void {}
      }
      class Script2 extends Script {
        onUpdate(deltaTime: number): void {}
      }
      const entity1 = scene.createRootEntity("1");
      const script1 = entity1.addComponent(Script1);
      const entity2 = scene.createRootEntity("2");
      const script2 = entity2.addComponent(Script2);
      class Script3 extends Script {
        onUpdate(deltaTime: number): void {
          if (!entity1.destroyed) {
            entity1.destroy();
          } else {
            entity2.destroy();
          }
        }
      }
      const entity3 = scene.createRootEntity("0");
      const script3 = entity3.addComponent(Script3);
      Script1.prototype.onUpdate = vi.fn(Script1.prototype.onUpdate);
      Script2.prototype.onUpdate = vi.fn(Script2.prototype.onUpdate);
      Script3.prototype.onUpdate = vi.fn(Script3.prototype.onUpdate);
      engine.update();
      engine.update();
      engine.update();
      expect(script1.onUpdate).toHaveBeenCalledOnce();
      expect(script2.onUpdate).toHaveBeenCalledOnce();
      expect(script3.onUpdate).toHaveBeenCalledTimes(3);
    });

    it("Script add in script's onStart", async () => {
      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      class Script1 extends Script {
        onStart(): void {
          entity1.addComponent(Script2);
        }
      }
      class Script2 extends Script {
        onStart(): void {}
      }

      Script1.prototype.onStart = vi.fn(Script1.prototype.onStart);
      Script2.prototype.onStart = vi.fn(Script2.prototype.onStart);

      const entity1 = scene.createRootEntity("1");
      const script1 = entity1.addComponent(Script1);
      engine.update();
      expect(script1.onStart).toHaveBeenCalledOnce();
      const script2 = entity1.getComponent(Script2);
      expect(script2.onStart).not.toHaveBeenCalled();
      engine.update();
      expect(script1.onStart).toHaveBeenCalledOnce();
      expect(script2.onStart).toHaveBeenCalledOnce();
    });

    it("Engine destroy outside the main loop", async () => {
      class TestScript extends Script {
        onAwake() {
          // console.log("TestScript_onAwake");
        }

        onEnable() {
          // console.log("TestScript_onEnable");
        }

        onUpdate() {
          // console.log("TestScript_onUpdate");
        }

        onDisable() {
          // console.log("TestScript_onDisable");
        }

        onDestroy() {
          // console.log("TestScript_onDestroy");
        }
      }
      TestScript.prototype.onAwake = vi.fn(TestScript.prototype.onAwake);
      TestScript.prototype.onEnable = vi.fn(TestScript.prototype.onEnable);
      TestScript.prototype.onUpdate = vi.fn(TestScript.prototype.onUpdate);
      TestScript.prototype.onDisable = vi.fn(TestScript.prototype.onDisable);
      TestScript.prototype.onDestroy = vi.fn(TestScript.prototype.onDestroy);

      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      engine.run();

      const entity = rootEntity.createChild("entity");
      const script = entity.addComponent(TestScript);

      engine.destroy();

      expect(script.onAwake).toHaveBeenCalledOnce();
      expect(script.onEnable).toHaveBeenCalledOnce();
      expect(script.onUpdate).not.toHaveBeenCalled();
      expect(script.onDisable).toHaveBeenCalledOnce();
      expect(script.onDestroy).toHaveBeenCalledOnce();
    });

    it("Engine destroy inside the main loop", async () => {
      class TestScript extends Script {
        onAwake() {
          // console.log("TestScript_onAwake");
        }

        onEnable() {
          // console.log("TestScript_onEnable");
        }

        onDisable() {
          // console.log("TestScript_onDisable");
        }

        onUpdate() {
          // console.log("TestScript_onUpdate");
          engine.destroy();
        }

        onDestroy() {
          // console.log("TestScript_onDestroy");
        }
      }
      TestScript.prototype.onAwake = vi.fn(TestScript.prototype.onAwake);
      TestScript.prototype.onEnable = vi.fn(TestScript.prototype.onEnable);
      TestScript.prototype.onUpdate = vi.fn(TestScript.prototype.onUpdate);
      TestScript.prototype.onDisable = vi.fn(TestScript.prototype.onDisable);
      TestScript.prototype.onDestroy = vi.fn(TestScript.prototype.onDestroy);

      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      engine.run();

      const entity = rootEntity.createChild("entity");
      const script = entity.addComponent(TestScript);

      setTimeout(() => {
        expect(script.onAwake).toHaveBeenCalledOnce();
        expect(script.onEnable).toHaveBeenCalledOnce();
        expect(script.onUpdate).toHaveBeenCalledOnce();
        expect(script.onDisable).toHaveBeenCalledOnce();
        expect(script.onDestroy).toHaveBeenCalledOnce();
      }, 1000);
    });

    it("Enable Disable components", async () => {
      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      class KKK extends Script {
        cmdStr = "";
        onEnable(): void {
          this.cmdStr += "A";
        }
        onDisable(): void {
          this.cmdStr += "D";
        }
      }
      const root = new Entity(engine);
      const kkk = root.addComponent(KKK);
      root.addComponent(
        class extends Script {
          onEnable(): void {
            kkk.enabled = false;
            kkk.enabled = true;
          }
        }
      );
      engine.sceneManager.activeScene.addRootEntity(root);
      expect(kkk.cmdStr[0]).to.eql("A");
    });

    it("Dependent components", async () => {
      @dependentComponents(Camera, DependentMode.CheckOnly)
      class CheckScript extends Script {}

      @dependentComponents(Camera, DependentMode.AutoAdd)
      class AutoAddScript extends Script {}

      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      engine.run();

      const entity1 = rootEntity.createChild("entity");
      expect(() => {
        entity1.addComponent(CheckScript);
      }).throw(`Should add Camera before adding CheckScript`);

      const entity2 = rootEntity.createChild("entity");
      entity2.addComponent(AutoAddScript);
      const camera = entity2.getComponent(Camera);
      expect(camera).to.not.null;
    });

    it("remove entity", async () => {
      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      const entity = rootEntity.createChild("entity");
      entity.addComponent(Script);
      rootEntity.removeChild(entity);
      expect(() => {
        engine.update();
      }).to.not.throw();
    });

    it("script order", async () => {
      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      const entity = rootEntity.createChild("entity");
      let tag: string;
      entity.addComponent(
        class extends Script {
          onUpdate(deltaTime: number): void {
            tag = "script1";
          }
        }
      );
      entity.addComponent(
        class extends Script {
          onUpdate(deltaTime: number): void {
            tag = "script2";
          }
        }
      );
      engine.update();
      expect(tag).to.equal("script2");

      rootEntity.removeChild(entity);
      rootEntity.addChild(entity);
      engine.update();
      expect(tag).to.equal("script2");
    });
  });
});
