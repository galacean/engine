import { Entity, Script } from "@oasis-engine/core";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);

describe("Scene", () => {
  const engine = new WebGLEngine(document.createElement("canvas"));
  engine.run();

  describe("onEnable/onDisable/onAwake", () => {
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
      }

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
      }

      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity();

      const parent = new Entity(engine);
      const parentScript = parent.addComponent(ParentScript);
      parentScript.onAwake = chai.spy(parentScript.onAwake);
      parentScript.onEnable = chai.spy(parentScript.onEnable);
      parentScript.onDisable = chai.spy(parentScript.onDisable);

      const child = parent.createChild("child");
      const childScript = child.addComponent(ChildScript);
      childScript.onAwake = chai.spy(childScript.onAwake);
      childScript.onEnable = chai.spy(childScript.onEnable);
      childScript.onDisable = chai.spy(childScript.onDisable);

      rootEntity.addChild(parent);

      expect(parentScript.onAwake).to.have.been.called.exactly(1);
      expect(parentScript.onEnable).to.have.been.called.exactly(1);
      expect(parentScript.onDisable).to.have.been.called.exactly(0);

      expect(childScript.onAwake).to.have.been.called.exactly(0);
      expect(childScript.onEnable).to.have.been.called.exactly(0);
      expect(childScript.onDisable).to.have.been.called.exactly(0);
    });
  });
});
