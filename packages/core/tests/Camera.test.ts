// @ts-nocheck
import { Camera, ClearFlags } from "../src/Camera";
import { Entity } from "../src/Entity";
import { Transform } from "../src/Transform";
import { Matrix, MathUtil, Vector2, Vector3, Vector4, Ray } from "@oasis-engine/math";
import { WebGLEngine } from "../../rhi-webgl/src";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("camera test", function () {
  let node: Entity;
  let camera: Camera;
  let identityMatrix: Matrix;
  beforeAll(() => {
    const engine = new WebGLEngine(canvasDOM);
    node = engine.sceneManager.activeScene.createRootEntity();
    camera = node.addComponent(Camera);
    // camera._onAwake();
    identityMatrix = new Matrix();
  });

  it("constructor", () => {
    expect(camera.aspectRatio).toEqual(1);
    expect(camera._renderPipeline).not.toBeUndefined();
    expect(camera.entity.transform.worldPosition).not.toBeUndefined();
    // TODO: deprecated
    expect(camera.viewport).toEqual({ x: 0, y: 0, z: 1, w: 1 });
    expect(camera.fieldOfView).toEqual(45);
    expect(camera.isOrthographic).toEqual(false);
  });

  it("camera awake without transform", () => {
    // const testNode = node.createChild("testNode");
    // const transform = testNode.getComponent(Transform);
    // transform.destroy();
    // expect(() => {
    //   const camera = testNode.addComponent(Camera);
    // }).toThrow();

    // const newTransform = testNode.addComponent(Transform);
    // testNode.addComponent(Camera);
    // expect(() => {
    //   newTransform.destroy();
    // }).toThrow();
  });

  it("perspective calculate", () => {
    camera.viewport = new Vector4(0, 0, 1, 1);
    camera.fieldOfView = 45;
    camera.nearClipPlane = 10;
    camera.farClipPlane = 100;
    const projectionMatrix = camera.projectionMatrix;
    const result = new Matrix();
    Matrix.perspective(MathUtil.degreeToRadian(45), 400 / 400, 10, 100, result);
    expect(projectionMatrix).toEqual(result);
  });

  it("custom projection", () => {
    camera.projectionMatrix = new Matrix();
    camera.fieldOfView = 60;
    expect(camera.projectionMatrix).toEqual(identityMatrix);
  });

  it("reset perspective", () => {
    camera.resetProjectionMatrix();
    camera.viewport = new Vector4(0, 0, 1, 1);
    camera.fieldOfView = 60;
    camera.nearClipPlane = 10;
    camera.farClipPlane = 100;
    const result = new Matrix();
    Matrix.perspective(MathUtil.degreeToRadian(60), 400 / 400, 10, 100, result);
    expect(camera.projectionMatrix).toEqual(result);
  });

  it("orth calculate", () => {
    camera.orthographicSize = 5;
    camera.isOrthographic = true;
    const projectionMatrix = camera.projectionMatrix;
    const width = (camera.orthographicSize * 400) / 400;
    const height = camera.orthographicSize;
    const result = new Matrix();
    Matrix.ortho(-width, width, -height, height, camera.nearClipPlane, camera.farClipPlane, result);
    expect(projectionMatrix).toEqual(result);
  });

  it("orth setting", () => {
    camera.projectionMatrix = new Matrix();
    expect(camera.projectionMatrix).toEqual(identityMatrix);
  });

  it("do not trigger dirty", () => {
    camera.resetProjectionMatrix();
    camera.orthographicSize = 5;
    // trigger calculate
    camera.projectionMatrix;
    //@ts-ignore
    camera._orthographicSize = 4;

    const width = (camera.orthographicSize * 400) / 400;
    const height = camera.orthographicSize;
    const result = new Matrix();
    Matrix.ortho(-width, width, -height, height, camera.nearClipPlane, camera.farClipPlane, result);

    expect(camera.projectionMatrix).not.toEqual(result);
  });

  it("screen to viewport point", () => {
    camera.viewport = new Vector4(0.5, 0.5, 0.5, 0.5);
    const out = camera.screenToViewportPoint(new Vector2(512, 512), new Vector2());
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
  });

  it("viewport to screen point", () => {
    camera.viewport = new Vector4(0.5, 0.5, 0.5, 0.5);
    const out = camera.viewportToScreenPoint(new Vector2(0.5, 0.5), new Vector2());
    expect(out.x).toBeCloseTo(1024 * 0.75);
    expect(out.y).toBeCloseTo(1024 * 0.75);
  });

  it("world to viewport", () => {
    camera.projectionMatrix = new Matrix(
      3.0807323455810547,
      0,
      0,
      0,
      0,
      1.7320458889007568,
      0,
      0,
      0,
      0,
      -1.001001000404358,
      -1,
      0,
      0,
      -0.10010010004043579,
      0
    );
    camera.entity.transform.worldMatrix = new Matrix();
    const out = camera.worldToViewportPoint(new Vector3(1, 1, 100), new Vector4());
    expect(out).toEqual({ x: 0.48459633827209475, y: 0.5086602294445037, z: 1.0020020014047624, w: -100 });
  });

  it("viewport to world", () => {
    camera.projectionMatrix = new Matrix(
      3.0807323455810547,
      0,
      0,
      0,
      0,
      1.7320458889007568,
      0,
      0,
      0,
      0,
      -1.001001000404358,
      -1,
      0,
      0,
      -0.10010010004043579,
      0
    );
    camera.entity.transform.worldMatrix = new Matrix();
    const out = camera.viewportToWorldPoint(new Vector3(0.48459633827209475, 0.4913397705554962, 1), new Vector3());
    arrayCloseTo([-1, 1, -100], [out.x, out.y, out.z]);
  });

  it("viewportToRay", () => {
    const mat = new Matrix(
      -1,
      0,
      0,
      0,
      0,
      0.9593654870986938,
      -0.28216633200645447,
      0,
      0,
      -0.28216633200645447,
      -0.9593654870986938,
      0,
      0,
      5,
      17,
      1
    );
    camera.entity.transform.worldMatrix = mat;
    const ray = camera.viewportPointToRay(new Vector2(0.4472140669822693, 0.4436090290546417), new Ray());

    arrayCloseTo(
      [ray.origin.x, ray.origin.y, ray.origin.z],
      Float32Array.from([0.0017142786925635912, 5.017240249493299, 17.047073454417177])
    );
    arrayCloseTo(
      [ray.direction.x, ray.direction.y, ray.direction.z],
      Float32Array.from([0.034176195559507606, 0.3437087947548518, 0.9384541821875192])
    );
  });

  it("test near clip plane and far clip plane", () => {
    camera.entity.transform.worldMatrix = new Matrix();
    camera.nearClipPlane = 10;
    camera.farClipPlane = 100;
    camera.resetProjectionMatrix();
    const nearClipPoint = camera.viewportToWorldPoint(new Vector3(0.5, 0.5, 0), new Vector3());
    const farClipPoint = camera.viewportToWorldPoint(new Vector3(0.5, 0.5, 1), new Vector3());
    expect(nearClipPoint.z).toBeCloseTo(-camera.nearClipPlane);
    expect(farClipPoint.z).toBeCloseTo(-camera.farClipPlane);
  });

  it("todo implemention", () => {
    camera.enableHDR = true;
    expect(camera.enableHDR).toBeFalsy();
  });
});

function arrayCloseTo(arr1: ArrayLike<number>, arr2: ArrayLike<number>) {
  const len = arr1.length;
  expect(len).toEqual(arr2.length);
  for (let i = 0; i < len; i++) {
    expect(arr1[i]).toBeCloseTo(arr2[i]);
  }
}
