import { Node, Engine, Scene, NodeAbility } from "../src/index";
import { quat, mat4, vec3 } from "@alipay/o3-math";

class TestComponent extends NodeAbility {}

describe("Node test", function () {
  it("case", () => {});
  describe("node lookat", () => {
    const node = new Node();
    beforeEach(() => {
      node.setModelMatrix(mat4.create());
    });

    it("test lookAt", () => {
      node.lookAt([0, -3, 0], [0, 1, 0]);
    });

    it("test setRotationAngles", () => {
      node.setRotationAngles(10, 20, 30);
    });

    it("test set rotation", () => {
      const rotation = [];
      node.rotation = quat.fromEuler(rotation, 10, 20, 30);
    });
  });

  describe("node parent", () => {
    const node = new Node();
    const parent = new Node();
    parent.addChild(node);
    parent.position = Float32Array.from([10, 10, 33]);
    beforeEach(() => {
      node.setModelMatrix(mat4.create());
    });

    it("test setRotationAngles", () => {
      node.setRotationAngles(10, 20, 30);
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

describe("Node", () => {
  let engine = null;
  let scene = null;
  beforeEach(() => {
    engine = new Engine();
    scene = new Scene(engine);
    Node._nodes.length = 0;
    Node._nodes._elements.length = 0;
  });
  describe("Node.findByName", () => {
    it("normal", () => {
      const node = new Node(null, null, "test1");
      const node2 = new Node(null, null, "test2");
      expect(Node.findByName("test1")).toBe(node);
      expect(Node.findByName("test2")).toBe(node2);
    });
    it("null", () => {
      const node = new Node(null, null, null);
      const node2 = new Node(null, null, null);
      const node3 = new Node(null, null, undefined);
      const node4 = new Node(null, null, undefined);
      expect(Node.findByName(null)).toEqual(node);
      expect(Node.findByName(undefined)).toEqual(node3);
    });
    it("not found", () => {
      const node = new Node(null, null, "test1");
      expect(Node.findByName("test2")).toEqual(null);
    });
  });

  describe("Node.findByPath", () => {
    it("normal", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      expect(Node.findByPath("/parent", scene)).toBe(parent);
      expect(Node.findByPath("/parent/child", scene)).toBe(child);
      expect(Node.findByPath("parent", scene)).toBe(parent);
      expect(Node.findByPath("parent/child", scene)).toBe(child);
    });
    it("not found", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      expect(Node.findByPath("child", scene)).toEqual(null);
      expect(Node.findByPath("parent/test", scene)).toEqual(null);
    });
  });

  describe("isActive", () => {
    it("normal", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      parent.isActive = false;
      child.isActive = true;
      expect(parent.isActive).toBeFalsy();
      expect(child.isActive).toBeTruthy();
    });
  });

  describe("isActiveInHierarchy", () => {
    it("normal", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      parent.isActive = true;
      child.isActive = true;
      expect(parent.isActiveInHierarchy).toBeTruthy();
      expect(child.isActiveInHierarchy).toBeTruthy();
    });

    it("child false", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      parent.isActive = true;
      child.isActive = false;
      expect(parent.isActiveInHierarchy).toBeTruthy();
      expect(child.isActiveInHierarchy).toBeFalsy();
    });

    it("parent false", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      parent.isActive = false;
      child.isActive = true;
      expect(parent.isActiveInHierarchy).toBeFalsy();
      expect(child.isActiveInHierarchy).toBeFalsy();
    });
  });

  describe("parent", () => {
    it("normal", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, null, "child");
      child.parent = parent;
      expect(child.parent).toBe(parent);
    });

    it("null", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      child.parent = null;
      expect(child.parent).toBe(null);
    });

    it("change", () => {
      const parent = new Node(scene, scene.root, "parent");
      const parent2 = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      child.parent = parent2;
      expect(child.parent).toBe(parent2);
    });
  });

  describe("childCount", () => {
    it("normal", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      expect(parent.childCount).toEqual(1);
    });

    it("null", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      child.parent = null;
      expect(parent.childCount).toEqual(0);
    });

    it("change", () => {
      const parent = new Node(scene, scene.root, "parent");
      const parent2 = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      child.parent = parent2;
      expect(parent2.childCount).toEqual(1);
      expect(parent.childCount).toEqual(0);
    });
  });

  describe("scene", () => {
    it("normal", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });

    it("change parent", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(null, parent, "child");
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });
  });

  describe("scene", () => {
    it("normal", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });

    it("change parent", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(null, parent, "child");
      expect(parent.scene).toBe(scene);
      expect(child.scene).toBe(scene);
    });
  });

  describe("component", () => {
    it("addComponent getComponent", () => {
      const node = new Node(scene, scene.root, "node");
      const component = node.addComponent(TestComponent);
      expect(node.getComponent(TestComponent)).toBe(component);
    });

    it("addComponent getComponents", () => {
      const node = new Node(scene, scene.root, "node");
      const component = node.addComponent(TestComponent);
      const res = [];
      node.getComponents(TestComponent, res);
      expect(res[0]).toBe(component);
    });
  });

  describe("child", () => {
    it("addChild", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      expect(child.parent).toBe(parent);
      expect(child.scene).toBe(scene);
    });

    it("removeChild", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      parent.removeChild(child);
      expect(child.parent).toEqual(null);
      expect(child.scene).toEqual(null);
    });

    it("getChild", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      const theChild = parent.getChild(0);
      expect(theChild).toBe(child);
    });

    it("getChild", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      const theChild = parent.getChild(0);
      expect(theChild).toBe(child);
    });

    it("findByName", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      const child2 = new Node(scene, parent, "child2");
      expect(parent.findByName("child")).toBe(child);
      expect(parent.findByName("child2")).toBe(child2);
    });

    it("findByPath", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      const child2 = new Node(scene, parent, "child2");
      expect(parent.findByPath("/child")).toBe(child);
      expect(parent.findByPath("child2")).toBe(child2);
    });

    it("clearChildren", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      const child2 = new Node(scene, parent, "child2");
      parent.clearChildren();
      expect(parent.childCount).toEqual(0);
    });
  });

  describe("clone", () => {
    it("normal", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      const cloneParent = parent.clone();
      expect(cloneParent.childCount).toEqual(parent.childCount);
      expect(cloneParent.findByName("child").name).toEqual(child.name);
      expect(cloneParent.findByName("child")).toBe(cloneParent.getChild(0));
    });
  });

  describe("destroy", () => {
    it("normal", () => {
      const parent = new Node(scene, scene.root, "parent");
      const child = new Node(scene, parent, "child");
      child.destroy();
      expect(parent.childCount).toEqual(0);
    });
  });
});
