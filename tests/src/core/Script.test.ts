import { Entity, Script } from "@oasis-engine/core";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);

describe("Scene", () => {
  const engine = new WebGLEngine(document.createElement("canvas"));
  engine.run();

  describe("onEnable/onDisable/onAwake", () => {
    it("Add script to Entity", () => {
      class TestScript extends Script {
        onAwake() {
          console.log("ParentScript___onAwake");
        }
        onEnable() {
          console.log("ParentScript___onEnable");
        }

        onDisable() {
          console.log("ParentScript___onDisable");
        }
      }
      TestScript.prototype.onAwake = chai.spy(TestScript.prototype.onAwake);
      TestScript.prototype.onEnable = chai.spy(TestScript.prototype.onEnable);
      TestScript.prototype.onDisable = chai.spy(TestScript.prototype.onDisable);

      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity();

      const testEntity = new Entity(engine);
      rootEntity.addChild(testEntity);

      const testScript = testEntity.addComponent(TestScript);

      expect(testScript.onAwake).to.have.been.called.exactly(1);
      expect(testScript.onEnable).to.have.been.called.exactly(1);
      expect(testScript.onDisable).to.have.been.called.exactly(0);
    });

    it("Parent onAwakeb call inAtive child", () => {
      class ParentScript extends Script {
        onAwake() {
          console.log("ParentScript___onAwake");
          const child = this.entity.findByName("child");
          child.isActive = false;
        }
        onEnable() {
          console.log("ParentScript___onEnable");
        }

        onDisable() {
          console.log("ParentScript___onDisable");
        }
        onUpdate() {
          console.log("ParentScript___onUpdate");
        }

        onLateUpdate() {
          console.log("ParentScript___onLateUpdate");
        }

        onDestroy() {
          console.log("ParentScript___onDestroy");
        }
      }
      ParentScript.prototype.onAwake = chai.spy(ParentScript.prototype.onAwake);
      ParentScript.prototype.onEnable = chai.spy(ParentScript.prototype.onEnable);
      ParentScript.prototype.onDisable = chai.spy(ParentScript.prototype.onDisable);

      class ChildScript extends Script {
        onAwake() {
          console.log("ChildScript___onAwake");
        }
        onEnable() {
          console.log("ChildScript___onEnable");
        }

        onDisable() {
          console.log("ChildScript___onDisable");
        }

        onUpdate() {
          console.log("ChildScript___onUpdate");
          this.engine.destroy();
        }

        onLateUpdate() {
          console.log("ChildScript___onLateUpdate");
        }

        onDestroy() {
          console.log("ChildScript___onDestroy");
        }
      }
      ChildScript.prototype.onAwake = chai.spy(ChildScript.prototype.onAwake);
      ChildScript.prototype.onEnable = chai.spy(ChildScript.prototype.onEnable);
      ChildScript.prototype.onDisable = chai.spy(ChildScript.prototype.onDisable);

      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity();

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

    it("Entity isActive = true after script call enabled = false", () => {
      class TestScript extends Script {
        onAwake() {
          console.log("TestScript___onAwake");
        }
        onEnable() {
          console.log("TestScript___onEnable");
        }

        onDisable() {
          console.log("TestScript___onDisable");
        }

        onDestroy() {
          console.log("TestScript___onDestroy");
        }
      }
      TestScript.prototype.onAwake = chai.spy(TestScript.prototype.onAwake);
      TestScript.prototype.onEnable = chai.spy(TestScript.prototype.onEnable);
      TestScript.prototype.onDisable = chai.spy(TestScript.prototype.onDisable);

      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity();

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
  });
});
