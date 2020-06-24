import { Node } from "../src/Node";
import { quat, mat4, vec3 } from "@alipay/o3-math";

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
