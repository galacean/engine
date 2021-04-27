import { WebGLEngine } from "../../rhi-webgl/src/WebGLEngine";
import { Entity, Component } from "../src/index";
class TestComponent extends Component {}

describe("Entity", () => {
  const engine = new WebGLEngine(document.createElement("canvas"));
  const scene = engine.sceneManager.activeScene;
  engine.run();
  beforeEach(() => {
    scene.createRootEntity("root");
  });

  describe("scene.findByPath", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;

      expect(scene.findEntityByPath("root/parent")).toBe(parent);

      expect(scene.findEntityByPath("root/parent/child")).toBe(child);
    });
    it("not found", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;

      expect(scene.findEntityByPath("child")).toEqual(null);

      expect(scene.findEntityByPath("parent/test")).toEqual(null);
    });
  });

  describe("isActive", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.isActive = false;
      child.isActive = true;
      expect(parent.isActive).toBeFalsy();
      expect(child.isActive).toBeTruthy();
    });
  });

  describe("isActiveInHierarchy", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.isActive = true;
      child.isActive = true;
      expect(parent.isActiveInHierarchy).toBeTruthy();
      expect(child.isActiveInHierarchy).toBeTruthy();
    });

    it("child false", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.isActive = true;
      child.isActive = false;
      expect(parent.isActiveInHierarchy).toBeTruthy();
      expect(child.isActiveInHierarchy).toBeFalsy();
    });

    it("parent false", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.isActive = false;
      child.isActive = true;
      expect(parent.isActiveInHierarchy).toBeFalsy();
      expect(child.isActiveInHierarchy).toBeFalsy();
    });
  });

  describe("parent", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.parent = parent;
      expect(child.parent).toBe(parent);
    });

    it("null", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.parent = null;
      expect(child.parent).toBe(null);
    });

    it("change", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const parent2 = new Entity(engine, "parent");

      parent2.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.parent = parent2;
      expect(child.parent).toBe(parent2);
    });
  });

  describe("childCount", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      expect(parent.childCount).toEqual(1);
    });

    it("null", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.parent = null;
      expect(parent.childCount).toEqual(0);
    });

    it("change", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const parent2 = new Entity(engine, "parent");

      parent2.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.parent = parent2;
      expect(parent2.childCount).toEqual(1);
      expect(parent.childCount).toEqual(0);
    });
  });

  describe("scene", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });

    it("change parent", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });
  });

  describe("scene", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      expect(child.scene).toBe(scene);
    });

    it("change parent", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });
  });

  describe("component", () => {
    it("addComponent getComponent", () => {
      const entity = new Entity(engine, "entity");

      entity.parent = scene.getRootEntity();
      const component = entity.addComponent(TestComponent);
      expect(entity.getComponent(TestComponent)).toBe(component);
    });

    it("addComponent getComponents", () => {
      const entity = new Entity(engine, "entity");

      entity.parent = scene.getRootEntity();
      const component = entity.addComponent(TestComponent);
      const res = [];
      entity.getComponents(TestComponent, res);
      expect(res[0]).toBe(component);
    });
  });

  describe("child", () => {
    it("addChild", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.addChild(child);
      expect(child.parent).toBe(parent);
      expect(child.scene).toBe(scene);
    });

    it("removeChild", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.removeChild(child);
      expect(child.parent).toEqual(null);
      expect(child.scene).toEqual(null);
    });

    it("getChild", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const theChild = parent.getChild(0);
      expect(theChild).toBe(child);
    });

    it("getChild", () => {
      const parent = new Entity(engine, "parent");
      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const theChild = parent.getChild(0);
      expect(theChild).toBe(child);
    });

    it("findByName", () => {
      const parent = new Entity(engine, "parent");
      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const child2 = new Entity(engine, "child2");
      child2.parent = parent;
      expect(parent.findByName("child")).toBe(child);
      expect(parent.findByName("child2")).toBe(child2);
    });

    it("findByPath", () => {
      const parent = new Entity(engine, "parent");
      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const child2 = new Entity(engine, "child2");
      child2.parent = parent;
      expect(parent.findByPath("/child")).toBe(child);
      expect(parent.findByPath("child2")).toBe(child2);
    });

    it("clearChildren", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const child2 = new Entity(engine, "child2");
      child2.parent = parent;
      parent.clearChildren();
      expect(parent.childCount).toEqual(0);
    });
  });

  describe("clone", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const cloneParent = parent.clone();
      expect(cloneParent.childCount).toEqual(parent.childCount);
      expect(cloneParent.findByName("child").name).toEqual(child.name);
      expect(cloneParent.findByName("child")).toBe(cloneParent.getChild(0));
    });
  });

  describe("destroy", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.destroy();
      expect(parent.childCount).toEqual(0);
    });
  });
});
