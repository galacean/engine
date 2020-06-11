import { Node } from "../src/Node";
import { Node2 } from "../src/Node2";
import { quat, mat4 } from "@alipay/o3-math";
import { ADefaultCamera } from "../../default-camera/src/ADefaultCamera";

describe.only("Node test", function() {
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
    // parent.rotateByAngles(10, 20, 30);
    // parent2.rotateByAngles(10, 20, 30);
    parent.position = Float32Array.from([10, 10, 33]);
    parent2.position = Float32Array.from([10, 10, 33]);
    beforeEach(() => {
      node.setModelMatrix(mat4.create());
      node2.setModelMatrix(mat4.create());
    });

    it.only("test lookAt", () => {
      // const mat1 = node.lookAt([0, -3, 0], [0, 1, 0]);
      // const mat2 = node2.lookAt([0, -3, 0], [0, 1, 0]);
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
});

function testEqual(node, node2) {
  // arrayCloseTo(node.worldPosition, node2.worldPosition);
  // arrayCloseTo(node.scale, node2.scale);
  // arrayCloseTo(node.position, node2.position);
  // arrayCloseTo(node.rotation, node2.rotation);
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
