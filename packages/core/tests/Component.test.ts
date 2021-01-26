import { WebGLEngine } from "../../rhi-webgl/src";
import { Entity, Component, Engine, Scene } from "../src/index";

class TestComponent extends Component {}

describe("Component", () => {
  const getContext = jest.fn().mockReturnValue({
    canvas: { width: 1024, height: 1024 },
    getParameter: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    colorMask: jest.fn(),
    depthMask: jest.fn(),
    blendFunc: jest.fn(),
    cullFace: jest.fn(),
    frontFace: jest.fn(),
    depthFunc: jest.fn(),
    depthRange: jest.fn(),
    polygonOffset: jest.fn(),
    stencilFunc: jest.fn(),
    stencilMask: jest.fn(),
    getExtension: jest.fn(),
    bindFramebuffer: jest.fn(),
    viewport: jest.fn(),
    clearColor: jest.fn(),
    clear: jest.fn()
  });

  const canvasDOM = document.createElement("canvas");
  canvasDOM.getContext = getContext;

  const engine: Engine = new Engine({ width: 1024, height: 1024 }, { init: jest.fn(), canIUse: jest.fn() });
  const scene = engine.sceneManager.activeScene;
  const root = new Entity(engine, "root");
  //@ts-ignore
  scene.addRootEntity(root);
  engine.run();
  beforeEach(() => {
    //@ts-ignore
    Entity._entitys.length = 0;
    //@ts-ignore
    Entity._entitys._elements.length = 0;
  });

  describe("enabled", () => {
    it("enabled", () => {
      const entity = new Entity(engine, "entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
      TestComponent.prototype._onEnable = jest.fn();
      const component = entity.addComponent(TestComponent);
      expect(component.enabled).toBeTruthy();
      expect(component._onEnable).toHaveBeenCalledTimes(1);
    });

    it("disabled", () => {
      const entity = new Entity(engine, "entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
      TestComponent.prototype._onDisable = jest.fn();
      const component = entity.addComponent(TestComponent);
      component.enabled = false;
      expect(component.enabled).toBeFalsy();
      expect(component._onDisable).toHaveBeenCalledTimes(1);
    });

    it("not trigger", () => {
      const parent = new Entity(engine, "parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
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
      const entity = new Entity(engine, "entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
      const component = entity.addComponent(TestComponent);
      expect(component.entity).toBe(entity);
    });

    it("scene", () => {
      const entity = new Entity(engine, "entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
      const component = entity.addComponent(TestComponent);
      expect(component.scene).toBe(scene);
    });
  });

  describe("destroy", () => {
    it("normal", () => {
      const entity = new Entity(engine, "entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
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
      const entity = new Entity(engine, "entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
      TestComponent.prototype._onAwake = jest.fn();
      const component = entity.addComponent(TestComponent);
      expect(component._onAwake).toHaveBeenCalledTimes(1);
    });

    it("entity changeActive", () => {
      const entity = new Entity(engine, "entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
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
      const entity = new Entity(engine, "entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
      TestComponent.prototype._onActive = jest.fn();
      const component = entity.addComponent(TestComponent);
      expect(component._onActive).toHaveBeenCalledTimes(1);
    });

    it("onInActive", () => {
      const entity = new Entity(engine, "entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
      TestComponent.prototype._onInActive = jest.fn();
      const component = entity.addComponent(TestComponent);
      entity.isActive = false;
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });

    it("inActiveHierarchy", () => {
      const parent = new Entity(engine, "parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      TestComponent.prototype._onInActive = jest.fn();
      const component = child.addComponent(TestComponent);
      parent.isActive = false;
      expect(component._onInActive).toHaveBeenCalledTimes(1);
    });
  });
});
