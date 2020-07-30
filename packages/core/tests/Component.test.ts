import { Entity, Component, Engine, Scene } from "../src/index";

class TestComponent extends Component {}

describe("Component", () => {
  let engine = null;
  let scene = null;
  beforeEach(() => {
    engine = new Engine();
    scene = new Scene(engine);
    Entity._nodes.length = 0;
    Entity._nodes._elements.length = 0;
  });

  describe("enabled", () => {
    it("enabled", () => {
      const entity = new Entity("entity");
      entity.parent = scene.root;
      TestComponent.prototype._onEnable = jest.fn();
      const component = entity.addComponent(TestComponent);
      expect(component.enabled).toBeTruthy();
      expect(component._onEnable).toHaveBeenCalledTimes(1);
    });

    it("disabled", () => {
      const entity = new Entity("entity");
      entity.parent = scene.root;
      TestComponent.prototype._onDisable = jest.fn();
      const component = entity.addComponent(TestComponent);
      component.enabled = false;
      expect(component.enabled).toBeFalsy();
      expect(component._onDisable).toHaveBeenCalledTimes(1);
    });

    it("not trigger", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
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

  describe("entity scene", () => {
    it("entity", () => {
      const entity = new Entity("entity");
      entity.parent = scene.root;
      const component = entity.addComponent(TestComponent);
      expect(component.entity).toBe(entity);
    });

    it("scene", () => {
      const entity = new Entity("entity");
      entity.parent = scene.root;
      const component = entity.addComponent(TestComponent);
      expect(component.scene).toBe(scene);
    });
  });

  describe("destroy", () => {
    it("normal", () => {
      const entity = new Entity("entity");
      entity.parent = scene.root;
      TestComponent.prototype._onDisable = jest.fn();
      TestComponent.prototype._onInActive = jest.fn();
      TestComponent.prototype._onDestroy = jest.fn();
      const component = entity.addComponent(TestComponent);
      component.destroy();
      expect(component._onDisable).toHaveBeenCalledTimes(1);
      expect(component._onInActive).toHaveBeenCalledTimes(1);
      expect(component._onDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe("awake", () => {
    it("normal", () => {
      const entity = new Entity("entity");
      entity.parent = scene.root;
      TestComponent.prototype._onAwake = jest.fn();
      const component = entity.addComponent(TestComponent);
      expect(component._onAwake).toHaveBeenCalledTimes(1);
    });

    it("entity changeActive", () => {
      const entity = new Entity("entity");
      entity.parent = scene.root;
      entity.isActive = false;
      TestComponent.prototype._onAwake = jest.fn();
      const component = entity.addComponent(TestComponent);
      expect(component._onAwake).toHaveBeenCalledTimes(0);
      entity.isActive = true;
      expect(component._onAwake).toHaveBeenCalledTimes(1);
      entity.isActive = false;
      entity.isActive = true;
      expect(component._onAwake).toHaveBeenCalledTimes(1);
    });
  });

  describe("active", () => {
    it("onActive", () => {
      const entity = new Entity("entity");
      entity.parent = scene.root;
      TestComponent.prototype._onActive = jest.fn();
      const component = entity.addComponent(TestComponent);
      expect(component._onActive).toHaveBeenCalledTimes(1);
    });

    it("onInActive", () => {
      const entity = new Entity("entity");
      entity.parent = scene.root;
      TestComponent.prototype._onInActive = jest.fn();
      const component = entity.addComponent(TestComponent);
      entity.isActive = false;
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });

    it("inActiveHierarchy", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      parent.parent = child;
      TestComponent.prototype._onInActive = jest.fn();
      const component = child.addComponent(TestComponent);
      parent.isActive = false;
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });
  });
});
