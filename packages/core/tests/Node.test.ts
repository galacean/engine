import { Node } from "../src/Node";
import { Node2 } from "../src/Node2";
import { quat, mat4, vec3 } from "@alipay/o3-math";

describe("Node test", function() {
  describe("node lookat", () => {
    const node = new Node();
    const node2 = new Node2();
    beforeEach(() => {
      node.setModelMatrix(mat4.create());
      node2.setModelMatrix(mat4.create());
    });

    it("test lookAt", () => {
      node.lookAt([0, -3, 0], [0, 1, 0]);
      node2.lookAt([0, -3, 0], [0, 1, 0]);
      testEqual(node, node2);
    });

    it("test setRotationAngles", () => {
      node.setRotationAngles(10, 20, 30);
      node2.setRotationAngles(10, 20, 30);
      testEqual(node, node2);
    });

    it("test set rotation", () => {
      const rotation = [];
      node.rotation = quat.fromEuler(rotation, 10, 20, 30);
      node2.rotation = quat.fromEuler(rotation, 10, 20, 30);
      testEqual(node, node2);
    });
  });

  describe("node parent", () => {
    const node = new Node();
    const node2 = new Node2();
    const parent = new Node();
    const parent2 = new Node2();
    parent.addChild(node);
    parent2.addChild(node2);
    parent.position = Float32Array.from([10, 10, 33]);
    parent2.position = Float32Array.from([10, 10, 33]);
    beforeEach(() => {
      node.setModelMatrix(mat4.create());
      node2.setModelMatrix(mat4.create());
    });

    it("test setRotationAngles", () => {
      node.setRotationAngles(10, 20, 30);
      node2.setRotationAngles(10, 20, 30);
      testEqual(node, node2);
    });

    it("test set rotation", () => {
      const rotation = [];
      node.rotation = quat.fromEuler(rotation, 10, 20, 30);
      node2.rotation = quat.fromEuler(rotation, 10, 20, 30);
      // testEqual(node, node2);
    });
  });

  describe("测试旋转node", () => {
    const parent = new Node();
    parent.rotateByAngles(-16, 0, 0);
    parent.position = [0, 0, 0];
    parent.scale = [0.8, 0.8, 0.8];

    const child = parent.createChild("child");
    child.position = [0, -3, 0];
  });

  describe("测试旋转node2", () => {
    const parent = new Node2(null, null, "parent");
    parent.rotateByAngles(-16, 0, 0);
    parent.position = [0, 0, 0];
    parent.scale = [0.8, 0.8, 0.8];

    const child = parent.createChild("child");
    child.rotateByAngles(0, 180, 0);
    child.position = [0, -3, 0];
    child.scale = [0.3, 0.3, 1];

    child.getModelMatrix();
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
