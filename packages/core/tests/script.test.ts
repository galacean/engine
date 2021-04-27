import { WebGLEngine } from "../../rhi-webgl/src/WebGLEngine";
import { Component, Entity, Script } from "../src/index";

describe("Script", () => {
  const engine = new WebGLEngine(document.createElement("canvas"));
  const scene = engine.sceneManager.activeScene;
  engine.run();

  beforeEach(() => {
    scene.createRootEntity("root");
  });

  describe("enabled", () => {
    it("enabled", () => {
      class TheScript extends Script {}
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype.onEnable = jest.fn();
      const component = entity.addComponent(TheScript);
      expect(component.enabled).toBeTruthy();
      expect(component.onEnable).toHaveBeenCalledTimes(1);
    });

    it("disabled", () => {
      class TheScript extends Script {}
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype.onDisable = jest.fn();
      const component = entity.addComponent(TheScript);
      component.enabled = false;
      expect(component.enabled).toBeFalsy();
      expect(component.onDisable).toHaveBeenCalledTimes(1);
    });

    it("not trigger", () => {
      class TheScript extends Script {}
      const parent = new Entity(engine, "parent");
      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.isActive = false;
      TheScript.prototype.onEnable = jest.fn();
      TheScript.prototype.onDisable = jest.fn();
      const component = child.addComponent(TheScript);
      component.enabled = true;
      expect(component.onEnable).toHaveBeenCalledTimes(0);
      component.enabled = false;
      expect(component.onDisable).toHaveBeenCalledTimes(0);
    });
  });

  describe("destroy", () => {
    it("onDisable", () => {
      class TheScript extends Script {}
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype.onDisable = jest.fn();
      const component = entity.addComponent(TheScript);
      component.destroy();
      expect(component.onDisable).toHaveBeenCalledTimes(1);
    });

    it("_onInActive", () => {
      class TheScript extends Script {}
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype._onInActive = jest.fn();
      const component = entity.addComponent(TheScript);
      component.destroy();
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });

    it("_onDestroy", () => {
      class TheScript extends Script {}
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype._onDestroy = jest.fn();
      const component = entity.addComponent(TheScript);
      component.destroy();
      expect(component._onDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe("awake", () => {
    it("normal", () => {
      class TheScript extends Script {}
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype.onAwake = jest.fn();
      const component = entity.addComponent(TheScript);
      expect(component.onAwake).toHaveBeenCalledTimes(1);
    });

    it("entity changeActive", () => {
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      entity.isActive = false;
      Script.prototype.onAwake = jest.fn();
      const component = entity.addComponent(Script);
      expect(component.onAwake).toHaveBeenCalledTimes(0);
      entity.isActive = true;
      expect(component.onAwake).toHaveBeenCalledTimes(1);
      entity.isActive = false;
      entity.isActive = true;
      expect(component.onAwake).toHaveBeenCalledTimes(1);
    });
  });

  describe("active", () => {
    it("onActive", () => {
      class TheScript extends Script {}
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype._onActive = jest.fn();
      const component = entity.addComponent(TheScript);
      expect(component._onActive).toHaveBeenCalledTimes(1);
    });

    it("onInActive", () => {
      class TheScript extends Script {}
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype._onInActive = jest.fn();
      const component = entity.addComponent(TheScript);
      entity.isActive = false;
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });

    it("inActiveHierarchy", () => {
      class TheScript extends Script {}
      const parent = new Entity(engine, "parent");
      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      TheScript.prototype._onInActive = jest.fn();
      const component = child.addComponent(TheScript);
      parent.isActive = false;
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });
  });

  describe("onStart", () => {
    it("normal", () => {
      class TheScript extends Script {
        onStart() {}
      }
      TheScript.prototype.onStart = jest.fn();
      const root = scene.getRootEntity();
      const component = root.addComponent(TheScript);
      engine.update();
      expect(component.onStart).toHaveBeenCalledTimes(1);
    });

    it("once", () => {
      class TheScript extends Script {
        onStart() {}
      }
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype.onStart = jest.fn();
      const component = entity.addComponent(TheScript);
      engine.update();
      engine.update();
      expect(component.onStart).toHaveBeenCalledTimes(1);
    });

    it("inActive", () => {
      class TheScript extends Script {
        onStart() {}
      }
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype.onStart = jest.fn();
      const component = entity.addComponent(TheScript);
      entity.isActive = false;
      engine.update();
      expect(component.onStart).toHaveBeenCalledTimes(0);
    });
  });

  describe("onUpdate", () => {
    it("normal", () => {
      class TheScript extends Script {
        onUpdate() {}
      }
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype.onUpdate = jest.fn();
      const component = entity.addComponent(TheScript);
      engine.update();
      engine.update();
      expect(component.onUpdate).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      class TheScript extends Script {
        onUpdate() {}
      }
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype.onUpdate = jest.fn();
      const component = entity.addComponent(TheScript);
      entity.isActive = false;
      engine.update();
      engine.update();
      expect(component.onUpdate).toHaveBeenCalledTimes(0);
    });
  });

  describe("onLateUpdate", () => {
    it("normal", () => {
      class TheScript extends Script {
        onLateUpdate() {}
      }
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype.onLateUpdate = jest.fn();
      const component = entity.addComponent(TheScript);
      engine.update();
      engine.update();
      expect(component.onLateUpdate).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      class TheScript extends Script {
        onLateUpdate() {}
      }
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TheScript.prototype.onLateUpdate = jest.fn();
      const component = entity.addComponent(TheScript);
      entity.isActive = false;
      engine.update();
      engine.update();
      expect(component.onLateUpdate).toHaveBeenCalledTimes(0);
    });
  });

  describe("onBeginRender", () => {
    it("normal", () => {
      class TestCamera extends Component {}
      class TheScript extends Script {
        onBeginRender() {}
      }
      TheScript.prototype.onBeginRender = jest.fn();
      const root = scene.getRootEntity();
      const component = root.addComponent(TheScript);
      const camera = root.addComponent(TestCamera);
      //@ts-ignore
      engine._componentsManager.callCameraOnBeginRender(camera);
      //@ts-ignore
      engine._componentsManager.callCameraOnBeginRender(camera);
      expect(component.onBeginRender).toHaveBeenCalledTimes(2);
    });
  });

  describe("onEndRender", () => {
    it("normal", () => {
      class TestCamera extends Component {}
      class TheScript extends Script {
        onEndRender() {}
      }
      TheScript.prototype.onEndRender = jest.fn();
      const root = scene.getRootEntity();
      const component = root.addComponent(TheScript);
      const camera = root.addComponent(TestCamera);
      //@ts-ignore
      engine._componentsManager.callCameraOnEndRender(camera);
      //@ts-ignore
      engine._componentsManager.callCameraOnEndRender(camera);
      expect(component.onEndRender).toHaveBeenCalledTimes(2);
    });
  });

  describe("onDestroy", () => {
    it("normal", () => {
      class TheScript extends Script {
        onDestroy() {}
      }
      TheScript.prototype.onDestroy = jest.fn();
      const root = scene.getRootEntity();
      const component = root.addComponent(TheScript);
      component.destroy();
      engine._componentsManager.callComponentDestory();
      expect(component.onDestroy).toHaveBeenCalledTimes(1);
    });
  });
});
