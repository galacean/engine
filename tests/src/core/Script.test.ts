import { Entity, Script } from "@oasis-engine/core";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { expect } from "chai";

class ChildScript extends Script {
  onAwake() {
    console.log("ChildScript___onAwake");
    const child = this.entity.findByName("child");
    child.isActive = false;
  }
  onEnable() {
    console.log("ChildScript___onEnable");
  }

  onDisable() {
    console.log("ChildScript___onDisable");
  }
}

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

describe("Scene", () => {
  const engine = new WebGLEngine(document.createElement("canvas"));
  const scene = engine.sceneManager.activeScene;
  engine.run();
  beforeEach(() => {
    scene.createRootEntity("root");
  });

  describe("onEnable/onDisable/onAwake", () => {
    it("sibling index", () => {
      const scene = engine.sceneManager.activeScene;
      const rootEntity = scene.createRootEntity();

      const parent = new Entity(engine);
      const parentScript = parent.addComponent(ParentScript);
    
      const child = parent.createChild("child");
      const childScript = child.addComponent(ChildScript);

      rootEntity.addChild(parent);

      // expect( parentScript.onAwake).to.have.been.calledOnce;
    });
  });
});
