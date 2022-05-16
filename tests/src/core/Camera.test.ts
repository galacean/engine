import { MathUtil, Matrix, Ray, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { Camera, Entity } from "@oasis-engine/core";
import { expect } from "chai";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("camera test", function () {
  let node: Entity;
  let camera: Camera;
  let identityMatrix: Matrix;
  before(() => {
    const engine = new WebGLEngine(canvasDOM);
    node = engine.sceneManager.activeScene.createRootEntity();
    camera = node.addComponent(Camera);
    // camera._onAwake();
    identityMatrix = new Matrix();
  });

  it("constructor", () => {
    expect(camera.aspectRatio).to.eq(1);
    // @ts-ignore
    expect(camera._renderPipeline).not.to.be.undefined;
    expect(camera.entity.transform.worldPosition).not.to.be.undefined;
    expect(camera.viewport).to.deep.eq(new Vector4(0, 0, 1, 1));
    expect(camera.fieldOfView).to.eq(45);
    expect(camera.isOrthographic).to.eq(false);
  });
});

function arrayCloseTo(arr1: ArrayLike<number>, arr2: ArrayLike<number>) {
  const len = arr1.length;
  // expect(len).toEqual(arr2.length);
  // for (let i = 0; i < len; i++) {
  //   expect(arr1[i]).toBeCloseTo(arr2[i]);
  // }
}
