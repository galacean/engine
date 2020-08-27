import { WebGLEngine } from "../../rhi-webgl/src";
import { Entity, Component } from "../src/index";
class TestComponent extends Component {}

describe("Entity", () => {
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

  const engine = new WebGLEngine(canvasDOM);
  const scene = engine.sceneManager.activeScene;
  scene.createRootEntity("root");
  engine.run();
  beforeEach(() => {
    Entity._entitys.length = 0;
    Entity._entitys._elements.length = 0;
  });
  describe("Entity.findByName", () => {
    it("normal", () => {
      const entity = new Entity("test1");
      const entity2 = new Entity("test2");
      expect(Entity.findByName("test1")).toBe(entity);
      expect(Entity.findByName("test2")).toBe(entity2);
    });
    it("null", () => {
      const entity = new Entity(null);
      const entity2 = new Entity(undefined);
      expect(Entity.findByName(null)).toEqual(entity);
      expect(Entity.findByName(undefined)).toEqual(entity2);
    });
    it("not found", () => {
      const entity = new Entity("test1");
      expect(Entity.findByName("test2")).toEqual(null);
    });
  });

  describe("Entity.findByPath", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      //@ts-ignore
      expect(Entity.findByPath("root/parent", scene)).toBe(parent);
      //@ts-ignore
      expect(Entity.findByPath("root/parent/child", scene)).toBe(child);
      //@ts-ignore
      expect(Entity.findByPath("root/parent", scene)).toBe(parent);
      //@ts-ignore
      expect(Entity.findByPath("root/parent/child", scene)).toBe(child);
    });
    it("not found", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      //@ts-ignore
      expect(Entity.findByPath("child", scene)).toEqual(null);
      //@ts-ignore
      expect(Entity.findByPath("parent/test", scene)).toEqual(null);
    });
  });

  describe("isActive", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      parent.isActive = false;
      child.isActive = true;
      expect(parent.isActive).toBeFalsy();
      expect(child.isActive).toBeTruthy();
    });
  });

  describe("isActiveInHierarchy", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      parent.isActive = true;
      child.isActive = true;
      expect(parent.isActiveInHierarchy).toBeTruthy();
      expect(child.isActiveInHierarchy).toBeTruthy();
    });

    it("child false", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      parent.isActive = true;
      child.isActive = false;
      expect(parent.isActiveInHierarchy).toBeTruthy();
      expect(child.isActiveInHierarchy).toBeFalsy();
    });

    it("parent false", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      parent.isActive = false;
      child.isActive = true;
      expect(parent.isActiveInHierarchy).toBeFalsy();
      expect(child.isActiveInHierarchy).toBeFalsy();
    });
  });

  describe("parent", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      child.parent = parent;
      expect(child.parent).toBe(parent);
    });

    it("null", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      child.parent = null;
      expect(child.parent).toBe(null);
    });

    it("change", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const parent2 = new Entity("parent");
      //@ts-ignore
      parent2.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      child.parent = parent2;
      expect(child.parent).toBe(parent2);
    });
  });

  describe("childCount", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      expect(parent.childCount).toEqual(1);
    });

    it("null", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      child.parent = null;
      expect(parent.childCount).toEqual(0);
    });

    it("change", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const parent2 = new Entity("parent");
      //@ts-ignore
      parent2.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      child.parent = parent2;
      expect(parent2.childCount).toEqual(1);
      expect(parent.childCount).toEqual(0);
    });
  });

  describe("scene", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });

    it("change parent", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });
  });

  describe("scene", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      expect(child.scene).toBe(scene);
    });

    it("change parent", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });
  });

  describe("component", () => {
    it("addComponent getComponent", () => {
      const entity = new Entity("entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
      const component = entity.addComponent(TestComponent);
      expect(entity.getComponent(TestComponent)).toBe(component);
    });

    it("addComponent getComponents", () => {
      const entity = new Entity("entity");
      //@ts-ignore
      entity.parent = scene.getRootEntity();
      const component = entity.addComponent(TestComponent);
      const res = [];
      entity.getComponents(TestComponent, res);
      expect(res[0]).toBe(component);
    });
  });

  describe("child", () => {
    it("addChild", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      parent.addChild(child);
      expect(child.parent).toBe(parent);
      expect(child.scene).toBe(scene);
    });

    it("removeChild", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      parent.removeChild(child);
      expect(child.parent).toEqual(null);
      expect(child.scene).toEqual(null);
    });

    it("getChild", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      const theChild = parent.getChild(0);
      expect(theChild).toBe(child);
    });

    it("getChild", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      const theChild = parent.getChild(0);
      expect(theChild).toBe(child);
    });

    it("findByName", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      const child2 = new Entity("child2");
      child2.parent = parent;
      expect(parent.findByName("child")).toBe(child);
      expect(parent.findByName("child2")).toBe(child2);
    });

    it("findByPath", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      const child2 = new Entity("child2");
      child2.parent = parent;
      expect(parent.findByPath("/child")).toBe(child);
      expect(parent.findByPath("child2")).toBe(child2);
    });

    it("clearChildren", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      const child2 = new Entity("child2");
      child2.parent = parent;
      parent.clearChildren();
      expect(parent.childCount).toEqual(0);
    });
  });

  describe("clone", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      const cloneParent = parent.clone();
      expect(cloneParent.childCount).toEqual(parent.childCount);
      expect(cloneParent.findByName("child").name).toEqual(child.name);
      expect(cloneParent.findByName("child")).toBe(cloneParent.getChild(0));
    });
  });

  describe("destroy", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      //@ts-ignore
      parent.parent = scene.getRootEntity();
      const child = new Entity("child");
      child.parent = parent;
      child.destroy();
      expect(parent.childCount).toEqual(0);
    });
  });
});
