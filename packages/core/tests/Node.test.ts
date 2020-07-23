import { Entity, Engine, Scene, Component } from "../src/index";
import { quat, mat4, vec3 } from "@alipay/o3-math";

class TestComponent extends Component {}

describe("Entity test", function () {
  it("case", () => {});
  describe("node lookat", () => {
    const node = new Entity();
    beforeEach(() => {
      // node.setModelMatrix(mat4.create());//transform负责，可删除
    });

    it("test lookAt", () => {
      //node.lookAt([0, -3, 0], [0, 1, 0]);// transform负责，可删除
    });

    it("test setRotationAngles", () => {
      //node.setRotationAngles(10, 20, 30);// transform负责，可删除
    });

    it("test set rotation", () => {
      const rotation = [];
      node.rotation = quat.fromEuler(rotation, 10, 20, 30);
    });
  });

  describe("node parent", () => {
    const node = new Entity();
    const parent = new Entity();
    parent.addChild(node);
    parent.position = Float32Array.from([10, 10, 33]);
    beforeEach(() => {
      // node.setModelMatrix(mat4.create());// transform负责，可删除
    });

    it("test setRotationAngles", () => {
      // node.setRotationAngles(10, 20, 30);// transform负责，可删除
    });

    it("test set rotation", () => {
      const rotation = [];
      node.rotation = quat.fromEuler(rotation, 10, 20, 30);
    });
  });
});

function testEqual(node, node2) {
  arrayCloseTo(node.worldPosition, node2.worldPosition);
  arrayCloseTo(node.scale, node2.scale);
  arrayCloseTo(node.position, node2.position);
  arrayCloseTo(node.rotation, node2.rotation);
  const m1 = node.getModelMatrix();
  const m2 = node2.getModelMatrix();
  arrayCloseTo(m1, m2);
}

function arrayCloseTo(arr1, arr2) {
  expect(arr1.length).toEqual(arr2.length);
  for (let i = 0; i < arr1.length; i++) {
    const m1 = arr1[i];
    const m2 = arr2[i];
    expect(m1).toBeCloseTo(m2);
  }
}

describe("Entity", () => {
  let engine = null;
  let scene = null;
  beforeEach(() => {
    engine = new Engine();
    scene = new Scene(engine);
    Entity._nodes.length = 0;
    Entity._nodes._elements.length = 0;
  });
  describe("Entity.findByName", () => {
    it("normal", () => {
      const node = new Entity("test1");
      const node2 = new Entity("test2");
      expect(Entity.findByName("test1")).toBe(node);
      expect(Entity.findByName("test2")).toBe(node2);
    });
    it("null", () => {
      const node = new Entity(null);
      const node2 = new Entity(null);
      const node3 = new Entity(undefined);
      const node4 = new Entity(undefined);
      expect(Entity.findByName(null)).toEqual(node);
      expect(Entity.findByName(undefined)).toEqual(node3);
    });
    it("not found", () => {
      const node = new Entity("test1");
      expect(Entity.findByName("test2")).toEqual(null);
    });
  });

  describe("Entity.findByPath", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      expect(Entity.findByPath("/parent", scene)).toBe(parent);
      expect(Entity.findByPath("/parent/child", scene)).toBe(child);
      expect(Entity.findByPath("parent", scene)).toBe(parent);
      expect(Entity.findByPath("parent/child", scene)).toBe(child);
    });
    it("not found", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      expect(Entity.findByPath("child", scene)).toEqual(null);
      expect(Entity.findByPath("parent/test", scene)).toEqual(null);
    });
  });

  describe("isActive", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
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
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      parent.isActive = true;
      child.isActive = true;
      expect(parent.isActiveInHierarchy).toBeTruthy();
      expect(child.isActiveInHierarchy).toBeTruthy();
    });

    it("child false", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      parent.isActive = true;
      child.isActive = false;
      expect(parent.isActiveInHierarchy).toBeTruthy();
      expect(child.isActiveInHierarchy).toBeFalsy();
    });

    it("parent false", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
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
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      child.parent = parent;
      expect(child.parent).toBe(parent);
    });

    it("null", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      child.parent = null;
      expect(child.parent).toBe(null);
    });

    it("change", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const parent2 = new Entity("parent");
      parent2.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      child.parent = parent2;
      expect(child.parent).toBe(parent2);
    });
  });

  describe("childCount", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      expect(parent.childCount).toEqual(1);
    });

    it("null", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      child.parent = null;
      expect(parent.childCount).toEqual(0);
    });

    it("change", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const parent2 = new Entity("parent");
      parent2.parent = scene.root;
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
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });

    it("change parent", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });
  });

  describe("scene", () => {
    it("normal", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      expect(child.scene).toBe(scene);
    });

    it("change parent", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });
  });

  describe("component", () => {
    it("addComponent getComponent", () => {
      const node = new Entity("node");
      node.parent = scene.root;
      const component = node.addComponent(TestComponent);
      expect(node.getComponent(TestComponent)).toBe(component);
    });

    it("addComponent getComponents", () => {
      const node = new Entity("node");
      node.parent = scene.root;
      const component = node.addComponent(TestComponent);
      const res = [];
      node.getComponents(TestComponent, res);
      expect(res[0]).toBe(component);
    });
  });

  describe("child", () => {
    it("addChild", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      parent.addChild(child);
      expect(child.parent).toBe(parent);
      expect(child.scene).toBe(scene);
    });

    it("removeChild", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      parent.removeChild(child);
      expect(child.parent).toEqual(null);
      expect(child.scene).toEqual(null);
    });

    it("getChild", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      const theChild = parent.getChild(0);
      expect(theChild).toBe(child);
    });

    it("getChild", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      const theChild = parent.getChild(0);
      expect(theChild).toBe(child);
    });

    it("findByName", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      const child2 = new Entity("child2");
      child2.parent = parent;
      expect(parent.findByName("child")).toBe(child);
      expect(parent.findByName("child2")).toBe(child2);
    });

    it("findByPath", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      const child2 = new Entity("child2");
      child2.parent = parent;
      expect(parent.findByPath("/child")).toBe(child);
      expect(parent.findByPath("child2")).toBe(child2);
    });

    it("clearChildren", () => {
      const parent = new Entity("parent");
      parent.parent = scene.root;
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
      parent.parent = scene.root;
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
      parent.parent = scene.root;
      const child = new Entity("child");
      child.parent = parent;
      child.destroy();
      expect(parent.childCount).toEqual(0);
    });
  });
});
