import { Node, NodeAbility, Engine, Scene } from "../src/index";

class TestComponent extends NodeAbility {}

describe("Component", () => {
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
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype._onEnable = jest.fn();
      const component = node.addComponent(TestComponent);
      expect(component.enabled).toBeTruthy();
      expect(component._onEnable).toHaveBeenCalledTimes(1);
    });

    it("disabled", () => {
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype._onDisable = jest.fn();
      const component = node.addComponent(TestComponent);
      component.enabled = false;
      expect(component.enabled).toBeFalsy();
      expect(component._onDisable).toHaveBeenCalledTimes(1);
    });

    it("not trigger", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      parent.isActive = false;
      TestComponent.prototype._onEnable = jest.fn();
      TestComponent.prototype._onDisable = jest.fn();
      const component = child.addComponent(TestComponent);
      component.enabled = true;
      expect(component._onEnable).toHaveBeenCalledTimes(0);
      component.enabled = false;
      expect(component._onDisable).toHaveBeenCalledTimes(0);
    });
  });

  describe("node scene", () => {
    it("node", () => {
      const node = new Node(scene, scene.root, "node");
      const component = node.addComponent(TestComponent);
      expect(component.node).toBe(node);
    });

    it("scene", () => {
      const node = new Node(scene, scene.root, "node");
      const component = node.addComponent(TestComponent);
      expect(component.scene).toBe(scene);
    });
  });

  describe("destroy", () => {
    it("normal", () => {
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype._onDisable = jest.fn();
      TestComponent.prototype._onInActive = jest.fn();
      TestComponent.prototype._onDestroy = jest.fn();
      const component = node.addComponent(TestComponent);
      component.destroy();
      expect(component._onDisable).toHaveBeenCalledTimes(1);
      expect(component._onInActive).toHaveBeenCalledTimes(1);
      expect(component._onDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe("awake", () => {
    it("normal", () => {
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype._onAwake = jest.fn();
      const component = node.addComponent(TestComponent);
      expect(component._onAwake).toHaveBeenCalledTimes(1);
    });

    it("node changeActive", () => {
      const node = new Node(scene, scene.root, "node");
      node.isActive = false;
      TestComponent.prototype._onAwake = jest.fn();
      const component = node.addComponent(TestComponent);
      expect(component._onAwake).toHaveBeenCalledTimes(0);
      node.isActive = true;
      expect(component._onAwake).toHaveBeenCalledTimes(1);
      node.isActive = false;
      node.isActive = true;
      expect(component._onAwake).toHaveBeenCalledTimes(1);
    });
  });

  describe("active", () => {
    it("onActive", () => {
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype._onActive = jest.fn();
      const component = node.addComponent(TestComponent);
      expect(component._onActive).toHaveBeenCalledTimes(1);
    });

    it("onInActive", () => {
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype._onInActive = jest.fn();
      const component = node.addComponent(TestComponent);
      node.isActive = false;
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });

    it("inActiveHierarchy", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      TestComponent.prototype._onInActive = jest.fn();
      const component = child.addComponent(TestComponent);
      parent.isActive = false;
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });
  });
});
