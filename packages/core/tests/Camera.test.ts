import { Camera, ClearFlags } from "../src/Camera";
import { Entity } from "../src/Entity";
import { Transform } from "../src/Transform";
import { mat4, MathUtil, vec2, vec3 } from "@alipay/o3-math";

describe("camera test", function () {
  let node: Entity;
  let camera: Camera;
  let identityMatrix;
  beforeAll(() => {
    node = new Entity();
    camera = node.addComponent(Camera);
    camera._onAwake();
    identityMatrix = mat4.create();
  });

  it("constructor", () => {
    expect(camera.aspectRatio).toEqual(1);
    expect(camera._renderPipeline).not.toBeUndefined();
    expect(camera.entity.transform.worldPosition).not.toBeUndefined();
    // TODO: deprecated
    expect(camera.backgroundColor).toEqual([0.25, 0.25, 0.25, 1]);
    expect(camera.viewport).toEqual([0, 0, 1, 1]);
    expect(camera.fieldOfView).toEqual(45);
    expect(camera.isOrthographic).toEqual(false);
  });

  it("camera awake without transform", () => {
    const testNode = new Entity("testNode");
    const transform = testNode.getComponent(Transform);
    transform.destroy();
    expect(() => {
      const camera = testNode.addComponent(Camera);
    }).toThrow();

    const newTransform = testNode.addComponent(Transform);
    testNode.addComponent(Camera);
    expect(() => {
      newTransform.destroy();
    }).toThrow();
  });

  it("perspective calculate", () => {
    camera.viewport = [0, 0, 1, 1];
    camera.fieldOfView = 45;
    camera.nearClipPlane = 10;
    camera.farClipPlane = 100;
    const projectionMatrix = camera.projectionMatrix;
    const result = mat4.perspective(new Float32Array(16), MathUtil.toRadian(45), 400 / 400, 10, 100);
    expect(projectionMatrix).toEqual(result);
  });

  it("custom projection", () => {
    camera.projectionMatrix = mat4.create() as any;
    camera.fieldOfView = 60;
    expect(camera.projectionMatrix).toEqual(identityMatrix);
  });

  it("reset perspective", () => {
    camera.resetProjectionMatrix();
    camera.viewport = [0, 0, 1, 1];
    camera.fieldOfView = 60;
    camera.nearClipPlane = 10;
    camera.farClipPlane = 100;
    const result = mat4.perspective(new Float32Array(16), MathUtil.toRadian(60), 400 / 400, 10, 100);
    expect(camera.projectionMatrix).toEqual(result);
  });

  it("orth calculate", () => {
    camera.orthographicSize = 5;
    camera.isOrthographic = true;
    const projectionMatrix = camera.projectionMatrix;
    const width = (camera.orthographicSize * 400) / 400;
    const height = camera.orthographicSize;
    const result = mat4.ortho(
      new Float32Array(16),
      -width,
      width,
      -height,
      height,
      camera.nearClipPlane,
      camera.farClipPlane
    );
    expect(projectionMatrix).toEqual(result);
  });

  it("orth setting", () => {
    camera.projectionMatrix = mat4.create() as any;
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
    const result = mat4.ortho(
      new Float32Array(16),
      -width,
      width,
      -height,
      height,
      camera.nearClipPlane,
      camera.farClipPlane
    );

    expect(camera.projectionMatrix).not.toEqual(result);
  });

  it("screen to viewport point", () => {
    camera.viewport = [0.5, 0.5, 0.5, 0.5];
    const out = camera.screenToViewportPoint([0.5, 0.5], [1, 1]);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
  });

  it("viewport to screen point", () => {
    camera.viewport = [0.5, 0.5, 0.5, 0.5];
    const out = camera.viewportToScreenPoint([0.5, 0.5], [1, 1]);
    expect(out[0]).toBeCloseTo(0.75);
    expect(out[1]).toBeCloseTo(0.75);
  });

  it("world to viewport", () => {
    camera.projectionMatrix = [
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
    ];
    camera.entity.transform.worldMatrix = mat4.create();
    const out = camera.worldToViewportPoint([1, 1, 100], [0, 0, 0, 0]);
    expect(out).toEqual([0.48459633827209475, 0.4913397705554962, 1, 100]);
  });

  it("viewport to world", () => {
    camera.projectionMatrix = [
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
    ];
    camera.entity.transform.worldMatrix = mat4.create();
    const out = camera.viewportToWorldPoint([0.48459633827209475, 0.4913397705554962, 1], [0, 0, 0]);
    arrayCloseTo([1, 1, 100], out as any);
  });

  it("viewportToRay", () => {
    const mat = Float32Array.from([
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
    ]);
    camera.entity.transform.worldMatrix = mat;
    const ray = camera.viewportPointToRay(vec2.set(vec2.create(), 0.4472140669822693, 0.4436090290546417), {
      origin: vec3.create() as any,
      direction: vec3.create() as any
    });
    arrayCloseTo(ray.origin as any, Float32Array.from([-0.0017142787110060453, 4.989009380340576, 16.95108985900879]));
    arrayCloseTo(
      ray.direction as any,
      Float32Array.from([-0.037305865436792374, -0.21910282969474792, -0.970811665058136])
    );
  });

  it("test near clip plane and far clip plane", () => {
    camera.entity.transform.worldMatrix = mat4.create();
    camera.nearClipPlane = 10;
    camera.farClipPlane = 100;
    camera.resetProjectionMatrix();
    const nearClipPoint = camera.viewportToWorldPoint([0.5, 0.5, 0], [0, 0, 0]);
    const farClipPoint = camera.viewportToWorldPoint([0.5, 0.5, 1], [0, 0, 0]);
    expect(nearClipPoint[2]).toBeCloseTo(camera.nearClipPlane);
    expect(farClipPoint[2]).toBeCloseTo(camera.farClipPlane);
  });

  it("todo implemention", () => {
    expect(() => {
      camera.enableHDR;
    }).toThrow();
    expect(() => {
      camera.enableHDR = true;
    }).toThrow();
    expect(() => {
      camera.renderTarget;
    }).toThrow();
    expect(() => {
      camera.renderTarget = {};
    }).toThrow();
    expect(() => {
      camera.viewport = [0, 0, 1, 1];
    }).toThrow();
    expect(() => {
      camera.backgroundSky;
    }).toThrow();
    expect(() => {
      camera.clearFlags = ClearFlags.DepthSky;
    }).toThrow();
    expect(() => {
      camera.clearFlags;
    }).toThrow();
    // expect(camera.enableHDR).rejects.toThrow('not implemention')
  });
});

function arrayCloseTo(arr1: ArrayLike<number>, arr2: ArrayLike<number>) {
  const len = arr1.length;
  expect(len).toEqual(arr2.length);
  for (let i = 0; i < len; i++) {
    expect(arr1[i]).toBeCloseTo(arr2[i]);
  }
}
