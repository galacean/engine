import { Entity, Transform } from "../src/index";
import { Vector3, Quaternion, Matrix } from "@alipay/o3-math";

describe("Transform", () => {
  describe("no parent", () => {
    it("constructor", () => {
      const node = new Entity();
      const transform = node.transform;
      expect(transform.position).toEqual(new Vector3());
      expect(transform.rotation).toEqual(new Vector3());
      expect(transform.rotationQuaternion).toEqual(new Quaternion());
      expect(transform.worldMatrix).toEqual(new Matrix());
      expect(transform.worldPosition).toEqual(new Vector3());
      expect(transform.worldRotation).toEqual(new Vector3());
    });

    it("set position", () => {
      const node = new Entity();
      const transform = node.transform;
      transform.position = new Vector3(10, 20, 30);
      arrayCloseTo(transform.position, new Vector3(10, 20, 30));
      arrayCloseTo(transform.worldPosition, new Vector3(10, 20, 30));
      arrayCloseTo(transform.localMatrix.elements, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
      arrayCloseTo(transform.worldMatrix.elements, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
    });

    it("set rotation", () => {
      const node = new Entity();
      const transform = node.transform;
      transform.rotation = new Vector3(10, 20, 30);
      arrayCloseTo(transform.worldRotation, new Vector3(10, 20, 30));
      arrayCloseTo(
        transform.rotationQuaternion,
        new Quaternion(0.12767944069578063, 0.14487812541736914, 0.2392983377447303, 0.9515485246437885)
      );
      arrayCloseTo(
        transform.worldRotationQuaternion,
        new Quaternion(0.12767944069578063, 0.14487812541736914, 0.2392983377447303, 0.9515485246437885)
      );
      arrayCloseTo(transform.localMatrix.elements, [
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
      arrayCloseTo(transform.worldMatrix.elements, [
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
    });

    it("set quat", () => {
      const node = new Entity();
      const transform = node.transform;
      transform.rotationQuaternion = new Quaternion(
        0.12767944069578063,
        0.14487812541736914,
        0.2392983377447303,
        0.9515485246437885
      );
      arrayCloseTo(transform.rotation, new Vector3(10, 20, 30));
      arrayCloseTo(transform.worldRotation, new Vector3(10, 20, 30));
      arrayCloseTo(
        transform.worldRotationQuaternion,
        new Quaternion(0.12767944069578063, 0.14487812541736914, 0.2392983377447303, 0.9515485246437885)
      );
      arrayCloseTo(transform.localMatrix.elements, [
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
      arrayCloseTo(transform.worldMatrix.elements, [
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
    });

    it("set scale", () => {
      const node = new Entity();
      const transform = node.transform;
      transform.scale = new Vector3(1, 2, 3);
      arrayCloseTo(transform.lossyWorldScale, new Vector3(1, 2, 3));
      arrayCloseTo(transform.localMatrix.elements, [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1]);
      arrayCloseTo(transform.worldMatrix.elements, [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1]);
    });

    it("set world position", () => {
      const node = new Entity();
      node.transform.worldPosition = new Vector3(10, 20, 30);
      arrayCloseTo(node.transform.position, new Vector3(10, 20, 30));
      arrayCloseTo(node.transform.localMatrix.elements, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
      arrayCloseTo(node.transform.worldMatrix.elements, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
    });

    it("set world rotation", () => {
      const node = new Entity();
      const transform = node.transform;
      transform.worldRotation = new Vector3(10, 20, 30);
      arrayCloseTo(transform.rotation, new Vector3(10, 20, 30));
      arrayCloseTo(
        transform.rotationQuaternion,
        new Quaternion(0.12767944069578063, 0.14487812541736914, 0.2392983377447303, 0.9515485246437885)
      );
      arrayCloseTo(
        transform.worldRotationQuaternion,
        new Quaternion(0.12767944069578063, 0.14487812541736914, 0.2392983377447303, 0.9515485246437885)
      );
      arrayCloseTo(transform.localMatrix.elements, [
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
      arrayCloseTo(transform.worldMatrix.elements, [
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
    });

    it("set world quat", () => {
      const node = new Entity();
      const transform = node.transform;
      transform.worldRotationQuaternion = new Quaternion(
        0.12767944069578063,
        0.14487812541736914,
        0.2392983377447303,
        0.9515485246437885
      );
      arrayCloseTo(transform.rotation, new Vector3(10, 20, 30));
      arrayCloseTo(
        transform.rotationQuaternion,
        new Quaternion(0.12767944069578063, 0.14487812541736914, 0.2392983377447303, 0.9515485246437885)
      );
      arrayCloseTo(transform.worldRotation, new Vector3(10, 20, 30));
      arrayCloseTo(transform.localMatrix.elements, [
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
      arrayCloseTo(transform.worldMatrix.elements, [
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        0,
        0,
        0,
        1
      ]);
    });

    it("set local matrix", () => {
      const node = new Entity();
      const transform = node.transform;
      transform.localMatrix = new Matrix(
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        10,
        20,
        30,
        1
      );
      arrayCloseTo(transform.position, new Vector3(10, 20, 30));
      arrayCloseTo(transform.worldPosition, new Vector3(10, 20, 30));
      arrayCloseTo(transform.rotation, new Vector3(10, 20, 30));
      arrayCloseTo(transform.worldRotation, new Vector3(10, 20, 30));
      arrayCloseTo(
        transform.rotationQuaternion,
        new Quaternion(0.12767944069578063, 0.14487812541736914, 0.2392983377447303, 0.9515485246437885)
      );
      arrayCloseTo(
        transform.worldRotationQuaternion,
        new Quaternion(0.12767944069578063, 0.14487812541736914, 0.2392983377447303, 0.9515485246437885)
      );
      arrayCloseTo(transform.worldMatrix.elements, [
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        10,
        20,
        30,
        1
      ]);
    });

    it("set world matrix", () => {
      const node = new Entity();
      const transform = node.transform;
      transform.worldMatrix = new Matrix(
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        10,
        20,
        30,
        1
      );
      arrayCloseTo(transform.position, new Vector3(10, 20, 30));
      arrayCloseTo(transform.worldPosition, new Vector3(10, 20, 30));
      arrayCloseTo(transform.rotation, new Vector3(10, 20, 30));
      arrayCloseTo(transform.worldRotation, new Vector3(10, 20, 30));
      arrayCloseTo(
        transform.rotationQuaternion,
        new Quaternion(0.12767944069578063, 0.14487812541736914, 0.2392983377447303, 0.9515485246437885)
      );
      arrayCloseTo(
        transform.worldRotationQuaternion,
        new Quaternion(0.12767944069578063, 0.14487812541736914, 0.2392983377447303, 0.9515485246437885)
      );
      arrayCloseTo(transform.localMatrix.elements, [
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        10,
        20,
        30,
        1
      ]);
    });

    it("get up, right, forward", () => {
      const node = new Entity();
      const up = new Vector3();
      const right = new Vector3();
      const forward = new Vector3();
      node.transform.getWorldUp(up);
      node.transform.getWorldRight(right);
      node.transform.getWorldForward(forward);
      arrayCloseTo(up, new Vector3(0, 1, 0));
      arrayCloseTo(right, new Vector3(1, 0, 0));
      arrayCloseTo(forward, new Vector3(0, 0, -1));
    });
  });

  describe("with parent", () => {
    it("set parent position, child position", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.transform.position = new Vector3(10, 20, 30);
      child.transform.position = new Vector3(10, 20, 30);
      arrayCloseTo(child.worldPosition, new Vector3(20, 40, 60));
    });

    it("set parent rotation, child rotation", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.transform.rotation = new Vector3(90, 0, 0);
      child.transform.rotation = new Vector3(90, 0, 0);
      arrayCloseTo(child.transform.worldRotation, new Vector3(0, 180, 180));
    });

    it("set parent rotation, child position", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.transform.rotation = new Vector3(90, 0, 0);
      child.transform.position = new Vector3(0, 0, 10);
      arrayCloseTo(child.worldPosition, new Vector3(0, -10, 0));
      arrayCloseTo(child.transform.worldRotation, new Vector3(90, 0, 0));
    });

    it("set parent scale, child position", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.scale = new Vector3(2, 2, 2);
      child.transform.position = new Vector3(0, 0, 10);
      arrayCloseTo(child.transform.worldPosition, new Vector3(0, 0, 20));
    });

    it("set parent position, rotation, scale,  child lossy world scale", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.scale = new Vector3(2, 2, 2);
      child.transform.rotation = new Vector3(60, 60, 60);
      arrayCloseTo(child.transform.lossyWorldScale, new Vector3(2, 2, 2));
    });

    it("set parent local matrix, child position", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      child.transform.position = new Vector3(0, 0, 10);
      parent.transform.localMatrix = new Matrix(
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        10,
        20,
        30,
        1
      );
      arrayCloseTo(
        child.transform.worldPosition,
        new Vector3(13.368241310119629, 18.263517379760742, 39.25416564941406)
      );
      arrayCloseTo(child.transform.worldRotation, new Vector3(10, 20, 30));
      arrayCloseTo(child.transform.lossyWorldScale, new Vector3(1, 1, 1));
    });

    it("set parent world matrix, child position", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      child.transform.position = new Vector3(0, 0, 10);
      parent.transform.worldMatrix = new Matrix(
        0.8434932827949524,
        0.49240386486053467,
        -0.21461017429828644,
        0,
        -0.4184120297431946,
        0.8528685569763184,
        0.31232455372810364,
        0,
        0.33682408928871155,
        -0.1736481785774231,
        0.9254165887832642,
        0,
        10,
        20,
        30,
        1
      );
      arrayCloseTo(
        child.transform.worldPosition,
        new Vector3(13.368241310119629, 18.263517379760742, 39.25416564941406)
      );
      arrayCloseTo(child.transform.worldRotation, new Vector3(10, 20, 30));
      arrayCloseTo(child.transform.lossyWorldScale, new Vector3(1, 1, 1));
    });

    it("set parent position, child world position", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.transform.position = new Vector3(10, 0, 0);
      child.transform.worldPosition = new Vector3(20, 10, 0);
      arrayCloseTo(child.transform.position, new Vector3(10, 10, 0));
    });

    it("set parent position, child world rotation", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.transform.position = new Vector3(10, 0, 0);
      child.transform.worldRotation = new Vector3(0, 90, 0);
      arrayCloseTo(child.transform.rotation, new Vector3(0, 90, 0));
    });

    it("set parent rotation, child world rotation", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.transform.rotation = new Vector3(0, 90, 0);
      child.transform.worldRotation = new Vector3(0, 100, 0);
      arrayCloseTo(child.transform.rotation, new Vector3(0, 10, 0));
    });

    it("set parent rotation, child world quat", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.transform.rotation = new Vector3(10, 20, 30);
      child.transform.worldRotationQuaternion = new Quaternion(
        0.12767944069578063,
        0.14487812541736914,
        0.2392983377447303,
        0.9515485246437885
      );
      arrayCloseTo(child.transform.rotation, new Vector3());
    });

    it("set parent local matrix, child world matrix", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.transform.localMatrix = new Matrix(
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
      );
      child.transform.worldMatrix = new Matrix(
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
      );
      arrayCloseTo(child.transform.position, new Vector3());
      arrayCloseTo(child.transform.rotation, new Vector3());
      arrayCloseTo(child.transform.scale, new Vector3(1, 1, 1));
    });
  });

  describe("func", () => {
    it("translate", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.transform.translate(new Vector3(10, 20, 30), false);
      child.transform.translate(new Vector3(10, 20, 30), true);
      arrayCloseTo(child.transform.position, new Vector3(10, 20, 30));
      child.transform.translate(new Vector3(10, 20, 30), false);
      arrayCloseTo(child.transform.position, new Vector3(0, 0, 0));
    });

    it("rotate", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      parent.transform.rotate(new Vector3(0, 0, 180), false);
      child.transform.rotate(new Vector3(0, 0, 45), true);
      arrayCloseTo(child.transform.rotation, new Vector3(0, 0, 45));
      child.transform.rotate(new Vector3(0, 0, 45), false);
      arrayCloseTo(child.transform.worldRotation, new Vector3(0, 0, -90));
    });

    it("rotateByAxis", () => {
      const parent = new Entity("parent");
      const child = new Entity("child");
      parent.addChild(child);
      child.transform.position = new Vector3(10, 0, 0);
      parent.transform.rotateByAxis(new Vector3(0, 0, 1), 90, true);
      arrayCloseTo(child.transform.worldPosition, new Vector3(0, 10, 0));
      child.transform.rotateByAxis(new Vector3(0, 0, 1), 180, false);
      arrayCloseTo(child.transform.worldPosition, new Vector3(0, 10, 0));
    });

    it("lookAt", () => {
      const node = new Entity();
      node.transform.position = new Vector3(0, 0, 1);
      node.transform.lookAt(new Vector3(), new Vector3(0, 1, 0));
      arrayCloseTo(node.transform.worldRotation, new Vector3(0, 0, 0));
    });
  });
});

function arrayCloseTo(arr1, arr2) {
  if (isFloat32Array(arr1)) {
    expect(arr1.length).toEqual(arr2.length);
    for (let i = 0; i < arr1.length; i++) {
      const m1 = arr1[i];
      const m2 = arr2[i];
      expect(m1).toBeCloseTo(m2);
    }
  } else {
    const keys1 = Object.keys(arr1);
    const keys2 = Object.keys(arr2);
    expect(keys1.length).toEqual(keys2.length);
    for (let i = 0; i < keys1.length; i++) {
      const key = keys1[i];
      const m1 = arr1[key];
      const m2 = arr2[key];
      expect(m1).toBeCloseTo(m2);
    }
  }
}

function isFloat32Array(arr) {
  if (Object.prototype.toString.call(arr) === "[object Float32Array]") return true;
  return false;
}
