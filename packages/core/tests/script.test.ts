import { Node, Script, Engine, Scene } from "../src/index";

describe("Script", () => {
  let engine = null;
  let scene = null;

  beforeEach(() => {
    engine = new Engine();
    scene = new Scene(engine);
    Node._nodes.length = 0;
    Node._nodes._elements.length = 0;
  });

  describe("enabled", () => {
    it("enabled", () => {
      class TheScript extends Script {}
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onEnable = jest.fn();
      const component = node.addComponent(TheScript);
      expect(component.enabled).toBeTruthy();
      expect(component.onEnable).toHaveBeenCalledTimes(1);
    });

    it("disabled", () => {
      class TheScript extends Script {}
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onDisable = jest.fn();
      const component = node.addComponent(TheScript);
      component.enabled = false;
      expect(component.enabled).toBeFalsy();
      expect(component.onDisable).toHaveBeenCalledTimes(1);
    });

    it("not trigger", () => {
      class TheScript extends Script {}
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
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
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onDisable = jest.fn();
      const component = node.addComponent(TheScript);
      component.destroy();
      expect(component.onDisable).toHaveBeenCalledTimes(1);
    });

    it("_onInActive", () => {
      class TheScript extends Script {}
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype._onInActive = jest.fn();
      const component = node.addComponent(TheScript);
      component.destroy();
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });

    it("_onDestroy", () => {
      class TheScript extends Script {}
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype._onDestroy = jest.fn();
      const component = node.addComponent(TheScript);
      component.destroy();
      expect(component._onDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe("awake", () => {
    it("normal", () => {
      class TheScript extends Script {}
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onAwake = jest.fn();
      const component = node.addComponent(TheScript);
      expect(component.onAwake).toHaveBeenCalledTimes(1);
    });

    it("node changeActive", () => {
      const node = new Node(scene, scene.root, "node");
      node.isActive = false;
      Script.prototype.onAwake = jest.fn();
      const component = node.addComponent(Script);
      expect(component.onAwake).toHaveBeenCalledTimes(0);
      node.isActive = true;
      expect(component.onAwake).toHaveBeenCalledTimes(1);
      node.isActive = false;
      node.isActive = true;
      expect(component.onAwake).toHaveBeenCalledTimes(1);
    });
  });

  describe("active", () => {
    it("onActive", () => {
      class TheScript extends Script {}
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype._onActive = jest.fn();
      const component = node.addComponent(TheScript);
      expect(component._onActive).toHaveBeenCalledTimes(1);
    });

    it("onInActive", () => {
      class TheScript extends Script {}
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype._onInActive = jest.fn();
      const component = node.addComponent(TheScript);
      node.isActive = false;
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });

    it("inActiveHierarchy", () => {
      class TheScript extends Script {}
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
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
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onStart = jest.fn();
      const component = node.addComponent(TheScript);
      scene.update(16.7);
      expect(component.onStart).toHaveBeenCalledTimes(1);
    });

    it("once", () => {
      class TheScript extends Script {
        onStart() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onStart = jest.fn();
      const component = node.addComponent(TheScript);
      scene.update(16.7);
      scene.update(16.7);
      expect(component.onStart).toHaveBeenCalledTimes(1);
    });

    it("inActive", () => {
      class TheScript extends Script {
        onStart() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onStart = jest.fn();
      const component = node.addComponent(TheScript);
      node.isActive = false;
      scene.update(16.7);
      expect(component.onStart).toHaveBeenCalledTimes(0);
    });
  });

  describe("onUpdate", () => {
    it("normal", () => {
      class TheScript extends Script {
        onUpdate() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onUpdate = jest.fn();
      const component = node.addComponent(TheScript);
      scene.update(16.7);
      scene.update(16.7);
      expect(component.onUpdate).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      class TheScript extends Script {
        onUpdate() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onUpdate = jest.fn();
      const component = node.addComponent(TheScript);
      node.isActive = false;
      scene.update(16.7);
      scene.update(16.7);
      expect(component.onUpdate).toHaveBeenCalledTimes(0);
    });
  });

  describe("onLateUpdate", () => {
    it("normal", () => {
      class TheScript extends Script {
        onLateUpdate() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onLateUpdate = jest.fn();
      const component = node.addComponent(TheScript);
      scene.update(16.7);
      scene.update(16.7);
      expect(component.onLateUpdate).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      class TheScript extends Script {
        onLateUpdate() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onLateUpdate = jest.fn();
      const component = node.addComponent(TheScript);
      node.isActive = false;
      scene.update(16.7);
      scene.update(16.7);
      expect(component.onLateUpdate).toHaveBeenCalledTimes(0);
    });
  });

  describe("onPreRender", () => {
    it("normal", () => {
      class TheScript extends Script {
        onPreRender() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onPreRender = jest.fn();
      const component = node.addComponent(TheScript);
      scene._componentsManager.callScriptOnPreRender();
      scene._componentsManager.callScriptOnPreRender();
      expect(component.onPreRender).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      class TheScript extends Script {
        onPreRender() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onPreRender = jest.fn();
      const component = node.addComponent(TheScript);
      node.isActive = false;
      scene._componentsManager.callScriptOnPreRender();
      scene._componentsManager.callScriptOnPreRender();
      expect(component.onPreRender).toHaveBeenCalledTimes(0);
    });
  });

  describe("onPostRender", () => {
    it("normal", () => {
      class TheScript extends Script {
        onPostRender() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onPostRender = jest.fn();
      const component = node.addComponent(TheScript);
      scene._componentsManager.callScriptOnPostRender();
      scene._componentsManager.callScriptOnPostRender();
      expect(component.onPostRender).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      class TheScript extends Script {
        onPostRender() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onPostRender = jest.fn();
      const component = node.addComponent(TheScript);
      node.isActive = false;
      scene._componentsManager.callScriptOnPostRender();
      scene._componentsManager.callScriptOnPostRender();
      expect(component.onPostRender).toHaveBeenCalledTimes(0);
    });
  });

  describe("onDestroy", () => {
    it("normal", () => {
      class TheScript extends Script {
        onDestroy() {}
      }
      const node = new Node(scene, scene.root, "node");
      TheScript.prototype.onDestroy = jest.fn();
      const component = node.addComponent(TheScript);
      component.destroy();
      scene._componentsManager.callComponentDestory();
      expect(component.onDestroy).toHaveBeenCalledTimes(1);
    });
  });
});
