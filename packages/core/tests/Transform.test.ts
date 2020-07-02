import { Node, Transform } from "../src/index";
import { vec3, quat, mat4 } from "@alipay/o3-math";

describe.only("Transform", () => {
  describe("no parent", () => {
    it("constructor", () => {
      const node = new Node();
      const transform = node.transform;
      expect(transform.position).toEqual(vec3.create());
      expect(transform.rotation).toEqual(vec3.create());
      expect(transform.rotationQuaternion).toEqual(quat.create());
      expect(transform.worldMatrix).toEqual(mat4.create());
      expect(transform.worldPosition).toEqual(vec3.create());
      expect(transform.worldRotation).toEqual(vec3.create());
    });

    it("set position", () => {
      const node = new Node();
      const transform = node.transform;
      transform.position = [10, 20, 30];
      arrayCloseTo(transform.position, [10, 20, 30]);
      arrayCloseTo(transform.worldPosition, [10, 20, 30]);
      arrayCloseTo(transform.localMatrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
      arrayCloseTo(transform.localMatrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
    });

    it("set rotation", () => {
      const node = new Node();
      const transform = node.transform;
      transform.rotation = [10, 20, 30];
      arrayCloseTo(transform.worldRotation, [10, 20, 30]);
      arrayCloseTo(transform.rotationQuaternion, [
        0.03813457489013672,
        0.18930785357952118,
        0.23929834365844727,
        0.9515485167503357
      ]);
      arrayCloseTo(transform.worldRotationQuaternion, [
        0.03813457489013672,
        0.18930785357952118,
        0.23929834365844727,
        0.9515485167503357
      ]);
      arrayCloseTo(transform.localMatrix, [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.4409696161746979,
        0.882564127445221,
        0.16317591071128845,
        0,
        0.3785223066806793,
        0.018028315156698227,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
      arrayCloseTo(transform.worldMatrix, [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.4409696161746979,
        0.882564127445221,
        0.16317591071128845,
        0,
        0.3785223066806793,
        0.018028315156698227,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
    });

    it("set quat", () => {
      const node = new Node();
      const transform = node.transform;
      transform.rotationQuaternion = [
        0.03813457489013672,
        0.18930785357952118,
        0.23929834365844727,
        0.9515485167503357
      ];
      arrayCloseTo(transform.rotation, [10, 20, 30]);
      arrayCloseTo(transform.worldRotation, [10, 20, 30]);
      arrayCloseTo(transform.worldRotationQuaternion, [
        0.03813457489013672,
        0.18930785357952118,
        0.23929834365844727,
        0.9515485167503357
      ]);
      arrayCloseTo(transform.localMatrix, [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.4409696161746979,
        0.882564127445221,
        0.16317591071128845,
        0,
        0.3785223066806793,
        0.018028315156698227,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
      arrayCloseTo(transform.worldMatrix, [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.4409696161746979,
        0.882564127445221,
        0.16317591071128845,
        0,
        0.3785223066806793,
        0.018028315156698227,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
    });

    it("set scale", () => {
      const node = new Node();
      const transform = node.transform;
      transform.scale = [1, 2, 3];
      arrayCloseTo(transform.lossyWorldScale, [1, 2, 3]);
      arrayCloseTo(transform.localMatrix, [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1]);
      arrayCloseTo(transform.worldMatrix, [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1]);
    });

    it("set world position", () => {
      const node = new Node();
      const transform = node.transform;
      transform.worldPosition = [10, 20, 30];
      arrayCloseTo(transform.position, [10, 20, 30]);
      arrayCloseTo(transform.localMatrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
      arrayCloseTo(transform.localMatrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
    });

    it("set world rotation", () => {
      const node = new Node();
      const transform = node.transform;
      transform.worldRotation = [10, 20, 30];
      arrayCloseTo(transform.rotation, [10, 20, 30]);
      arrayCloseTo(transform.rotationQuaternion, [
        0.03813457489013672,
        0.18930785357952118,
        0.23929834365844727,
        0.9515485167503357
      ]);
      arrayCloseTo(transform.worldRotationQuaternion, [
        0.03813457489013672,
        0.18930785357952118,
        0.23929834365844727,
        0.9515485167503357
      ]);
      arrayCloseTo(transform.localMatrix, [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.4409696161746979,
        0.882564127445221,
        0.16317591071128845,
        0,
        0.3785223066806793,
        0.018028315156698227,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
      arrayCloseTo(transform.worldMatrix, [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.4409696161746979,
        0.882564127445221,
        0.16317591071128845,
        0,
        0.3785223066806793,
        0.018028315156698227,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
    });

    it("set world quat", () => {
      const node = new Node();
      const transform = node.transform;
      transform.worldRotationQuaternion = [
        0.03813457489013672,
        0.18930785357952118,
        0.23929834365844727,
        0.9515485167503357
      ];
      arrayCloseTo(transform.rotation, [10, 20, 30]);
      arrayCloseTo(transform.rotationQuaternion, [
        0.03813457489013672,
        0.18930785357952118,
        0.23929834365844727,
        0.9515485167503357
      ]);
      arrayCloseTo(transform.worldRotation, [10, 20, 30]);
      arrayCloseTo(transform.localMatrix, [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.4409696161746979,
        0.882564127445221,
        0.16317591071128845,
        0,
        0.3785223066806793,
        0.018028315156698227,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
      arrayCloseTo(transform.worldMatrix, [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.4409696161746979,
        0.882564127445221,
        0.16317591071128845,
        0,
        0.3785223066806793,
        0.018028315156698227,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
    });

    it("set local matrix", () => {
      const node = new Node();
      const transform = node.transform;
      transform.localMatrix = [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.8819392323493958,
        1.765128254890442,
        0.3263518214225769,
        0,
        1.1355668306350708,
        0.05408494547009468,
        2.776249647140503,
        0,
        10,
        20,
        30,
        1
      ];
      arrayCloseTo(transform.position, [10, 20, 30]);
      arrayCloseTo(transform.worldPosition, [10, 20, 30]);
      arrayCloseTo(transform.rotation, [10, 20, 30]);
      arrayCloseTo(transform.worldRotation, [10, 20, 30]);
      arrayCloseTo(transform.rotationQuaternion, [
        0.03813457489013672,
        0.18930783867835999,
        0.23929834365844727,
        0.9515485167503357
      ]);
      arrayCloseTo(transform.worldRotationQuaternion, [
        0.03813457489013672,
        0.18930783867835999,
        0.23929834365844727,
        0.9515485167503357
      ]);
      arrayCloseTo(transform.worldMatrix, [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.8819392323493958,
        1.765128254890442,
        0.3263518214225769,
        0,
        1.1355668306350708,
        0.05408494547009468,
        2.776249647140503,
        0,
        10,
        20,
        30,
        1
      ]);
    });

    it("set world matrix", () => {
      const node = new Node();
      const transform = node.transform;
      transform.worldMatrix = [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.8819392323493958,
        1.765128254890442,
        0.3263518214225769,
        0,
        1.1355668306350708,
        0.05408494547009468,
        2.776249647140503,
        0,
        10,
        20,
        30,
        1
      ];
      arrayCloseTo(transform.position, [10, 20, 30]);
      arrayCloseTo(transform.worldPosition, [10, 20, 30]);
      arrayCloseTo(transform.rotation, [10, 20, 30]);
      arrayCloseTo(transform.worldRotation, [10, 20, 30]);
      arrayCloseTo(transform.rotationQuaternion, [
        0.03813457489013672,
        0.18930783867835999,
        0.23929834365844727,
        0.9515485167503357
      ]);
      arrayCloseTo(transform.worldRotationQuaternion, [
        0.03813457489013672,
        0.18930783867835999,
        0.23929834365844727,
        0.9515485167503357
      ]);
      arrayCloseTo(transform.localMatrix, [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.8819392323493958,
        1.765128254890442,
        0.3263518214225769,
        0,
        1.1355668306350708,
        0.05408494547009468,
        2.776249647140503,
        0,
        10,
        20,
        30,
        1
      ]);
    });

    it("get up, right, forward", () => {
      const node = new Node();
      const up = vec3.create();
      const right = vec3.create();
      const forward = vec3.create();
      node.transform.getWorldUp(up);
      node.transform.getWorldRight(right);
      node.transform.getWorldForward(forward);
      arrayCloseTo(up, [0, 1, 0]);
      arrayCloseTo(right, [1, 0, 0]);
      arrayCloseTo(forward, [0, 0, 1]);
    });
  });

  describe("with parent", () => {
    it("set parent position, child position", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.transform.position = [10, 20, 30];
      child.transform.position = [10, 20, 30];
      arrayCloseTo(child.worldPosition, [20, 40, 60]);
    });

    it("set parent rotation, child rotation", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.transform.rotation = [90, 0, 0];
      child.transform.rotation = [90, 0, 0];
      arrayCloseTo(child.transform.worldRotation, [180, 0, 0]);
    });

    it("set parent rotation, child position", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.transform.rotation = [90, 0, 0];
      child.transform.position = [0, 0, 10];
      arrayCloseTo(child.worldPosition, [0, -10, 0]);
      arrayCloseTo(child.transform.worldRotation, [90, 0, 0]);
    });

    it("set parent scale, child position", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.scale = [2, 2, 2];
      child.transform.position = [0, 0, 10];
      arrayCloseTo(child.transform.worldPosition, [0, 0, 20]);
    });

    it("set parent local matrix, child position", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      child.transform.position = [0, 0, 10];
      parent.transform.localMatrix = [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.8819392323493958,
        1.765128254890442,
        0.3263518214225769,
        0,
        1.1355668306350708,
        0.05408494547009468,
        2.776249647140503,
        0,
        10,
        20,
        30,
        1
      ];
      arrayCloseTo(child.transform.worldPosition, [21.355669021606445, 20.540849685668945, 57.76249694824219]);
      arrayCloseTo(child.transform.worldRotation, [10, 20, 30]);
      arrayCloseTo(child.transform.lossyWorldScale, [0.813797652721405, 1.765128254890442, 2.776249647140503]);
    });

    it("set parent world matrix, child position", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      child.transform.position = [0, 0, 10];
      parent.transform.worldMatrix = [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.8819392323493958,
        1.765128254890442,
        0.3263518214225769,
        0,
        1.1355668306350708,
        0.05408494547009468,
        2.776249647140503,
        0,
        10,
        20,
        30,
        1
      ];
      arrayCloseTo(child.transform.worldPosition, [21.355669021606445, 20.540849685668945, 57.76249694824219]);
      arrayCloseTo(child.transform.worldRotation, [10, 20, 30]);
      arrayCloseTo(child.transform.lossyWorldScale, [0.813797652721405, 1.765128254890442, 2.776249647140503]);
    });

    it("set parent position, child world position", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.transform.position = [10, 0, 0];
      child.transform.worldPosition = [20, 10, 0];
      arrayCloseTo(child.transform.position, [10, 10, 0]);
    });

    it("set parent position, child world rotation", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.transform.position = [10, 0, 0];
      child.transform.worldRotation = [0, 90, 0];
      arrayCloseTo(child.transform.rotation, [0, 90, 0]);
    });

    it("set parent rotation, child world rotation", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.transform.rotation = [0, 90, 0];
      child.transform.worldRotation = [0, 100, 0];
      arrayCloseTo(child.transform.rotation, [0, 10, 0]);
    });

    it("set parent rotation, child world quat", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.transform.rotation = [10, 20, 30];
      child.transform.worldRotationQuaternion = [
        0.03813457489013672,
        0.18930785357952118,
        0.23929834365844727,
        0.9515485167503357
      ];
      arrayCloseTo(child.transform.rotation, [0, 0, 0]);
    });

    it("set parent local matrix, child world matrix", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.transform.localMatrix = [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.8819392323493958,
        1.765128254890442,
        0.3263518214225769,
        0,
        1.1355668306350708,
        0.05408494547009468,
        2.776249647140503,
        0,
        10,
        20,
        30,
        1
      ];
      child.transform.worldMatrix = [
        0.813797652721405,
        0.46984630823135376,
        -0.3420201241970062,
        0,
        -0.8819392323493958,
        1.765128254890442,
        0.3263518214225769,
        0,
        1.1355668306350708,
        0.05408494547009468,
        2.776249647140503,
        0,
        10,
        20,
        30,
        1
      ];
      arrayCloseTo(child.transform.position, [0, 0, 0]);
      arrayCloseTo(child.transform.rotation, [0, 0, 0]);
      arrayCloseTo(child.transform.scale, [1, 1, 1]);
    });
  });

  describe("func", () => {
    it("translate", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.transform.translate([10, 20, 30], false);
      child.transform.translate([10, 20, 30], true);
      arrayCloseTo(child.transform.position, [10, 20, 30]);
      child.transform.translate([10, 20, 30], false);
      arrayCloseTo(child.transform.position, [20, 40, 60]);
    });

    it("rotate", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      parent.transform.rotate([0, 0, 180], false);
      child.transform.rotate([0, 0, 45], true);
      arrayCloseTo(child.transform.rotation, [0, 0, 45]);
      child.transform.rotate([0, 0, 45], false);
      arrayCloseTo(child.transform.worldRotation, [0, 0, -90]);
    });

    it("rotateByAxis", () => {
      const parent = new Node(null, null, "parent");
      const child = new Node(null, null, "child");
      parent.addChild(child);
      child.transform.position = [10, 0, 0];
      parent.transform.rotateByAxis([0, 0, 1], 90, true);
      console.log(child.transform.worldPosition);
      arrayCloseTo(child.transform.worldPosition, [0, 10, 0]);

      child.transform.rotateByAxis([0, 0, 1], 180, false);
      console.log(child.transform.worldPosition);
    });

    it.only("lookAt", () => {
      const node = new Node();
      node.transform.position = [0, 0, 1];
      node.transform.lookAt([0, 0, 0], [0, 1, 0]);
    });
  });
});

function arrayCloseTo(arr1, arr2) {
  expect(arr1.length).toEqual(arr2.length);
  for (let i = 0; i < arr1.length; i++) {
    const m1 = arr1[i];
    const m2 = arr2[i];
    expect(m1).toBeCloseTo(m2);
  }
}
