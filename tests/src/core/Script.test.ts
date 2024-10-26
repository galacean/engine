import { Camera, dependentComponents, DependentMode, Entity, Script } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);

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
      TestScript.prototype.onAwake = chai.spy(TestScript.prototype.onAwake);
      TestScript.prototype.onEnable = chai.spy(TestScript.prototype.onEnable);
      TestScript.prototype.onDisable = chai.spy(TestScript.prototype.onDisable);

      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      engine.run();

      const entity = new Entity(engine);
      rootEntity.addChild(entity);
      const testScript = entity.addComponent(TestScript);

      expect(testScript.onAwake).to.have.been.called.exactly(1);
      expect(testScript.onEnable).to.have.been.called.exactly(1);
      expect(testScript.onDisable).to.have.been.called.exactly(0);
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
      ParentScript.prototype.onAwake = chai.spy(ParentScript.prototype.onAwake);
      ParentScript.prototype.onEnable = chai.spy(ParentScript.prototype.onEnable);
      ParentScript.prototype.onDisable = chai.spy(ParentScript.prototype.onDisable);

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
      ChildScript.prototype.onAwake = chai.spy(ChildScript.prototype.onAwake);
      ChildScript.prototype.onEnable = chai.spy(ChildScript.prototype.onEnable);
      ChildScript.prototype.onDisable = chai.spy(ChildScript.prototype.onDisable);

      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      engine.run();

      const parent = new Entity(engine);
      const parentScript = parent.addComponent(ParentScript);

      const child = parent.createChild("child");
      const childScript = child.addComponent(ChildScript);

      rootEntity.addChild(parent);

      expect(parentScript.onAwake).to.have.been.called.exactly(1);
      expect(parentScript.onEnable).to.have.been.called.exactly(1);
      expect(parentScript.onDisable).to.have.been.called.exactly(0);

      expect(childScript.onAwake).to.have.been.called.exactly(0);
      expect(childScript.onEnable).to.have.been.called.exactly(0);
      expect(childScript.onDisable).to.have.been.called.exactly(0);
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
      TestScript.prototype.onAwake = chai.spy(TestScript.prototype.onAwake);
      TestScript.prototype.onEnable = chai.spy(TestScript.prototype.onEnable);
      TestScript.prototype.onDisable = chai.spy(TestScript.prototype.onDisable);

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

      expect(script.onAwake).to.have.been.called.exactly(1);
      expect(script.onEnable).to.have.been.called.exactly(2);
      expect(script.onDisable).to.have.been.called.exactly(2);
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
      Script1.prototype.onUpdate = chai.spy(Script1.prototype.onUpdate);
      Script2.prototype.onUpdate = chai.spy(Script2.prototype.onUpdate);
      Script3.prototype.onUpdate = chai.spy(Script3.prototype.onUpdate);
      engine.update();
      engine.update();
      engine.update();
      expect(script1.onUpdate).to.have.been.called.exactly(1);
      expect(script2.onUpdate).to.have.been.called.exactly(1);
      expect(script3.onUpdate).to.have.been.called.exactly(3);
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

      Script1.prototype.onStart = chai.spy(Script1.prototype.onStart);
      Script2.prototype.onStart = chai.spy(Script2.prototype.onStart);

      const entity1 = scene.createRootEntity("1");
      const script1 = entity1.addComponent(Script1);
      engine.update();
      expect(script1.onStart).to.have.been.called.exactly(1);
      const script2 = entity1.getComponent(Script2);
      expect(script2.onStart).to.have.been.called.exactly(0);
      engine.update();
      expect(script1.onStart).to.have.been.called.exactly(1);
      expect(script2.onStart).to.have.been.called.exactly(1);
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
      TestScript.prototype.onAwake = chai.spy(TestScript.prototype.onAwake);
      TestScript.prototype.onEnable = chai.spy(TestScript.prototype.onEnable);
      TestScript.prototype.onUpdate = chai.spy(TestScript.prototype.onUpdate);
      TestScript.prototype.onDisable = chai.spy(TestScript.prototype.onDisable);
      TestScript.prototype.onDestroy = chai.spy(TestScript.prototype.onDestroy);

      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      engine.run();

      const entity = rootEntity.createChild("entity");
      const script = entity.addComponent(TestScript);

      engine.destroy();

      expect(script.onAwake).to.have.been.called.exactly(1);
      expect(script.onEnable).to.have.been.called.exactly(1);
      expect(script.onUpdate).to.have.been.called.exactly(0);
      expect(script.onDisable).to.have.been.called.exactly(1);
      expect(script.onDestroy).to.have.been.called.exactly(1);
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
      TestScript.prototype.onAwake = chai.spy(TestScript.prototype.onAwake);
      TestScript.prototype.onEnable = chai.spy(TestScript.prototype.onEnable);
      TestScript.prototype.onUpdate = chai.spy(TestScript.prototype.onUpdate);
      TestScript.prototype.onDisable = chai.spy(TestScript.prototype.onDisable);
      TestScript.prototype.onDestroy = chai.spy(TestScript.prototype.onDestroy);

      const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity("root");
      engine.run();

      const entity = rootEntity.createChild("entity");
      const script = entity.addComponent(TestScript);

      setTimeout(() => {
        expect(script.onAwake).to.have.been.called.exactly(1);
        expect(script.onEnable).to.have.been.called.exactly(1);
        expect(script.onUpdate).to.have.been.called.exactly(1);
        expect(script.onDisable).to.have.been.called.exactly(1);
        expect(script.onDestroy).to.have.been.called.exactly(1);
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
      }).throw(`Should add Camera1 before adding CheckScript`);

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
