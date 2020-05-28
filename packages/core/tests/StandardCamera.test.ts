import { StandardCamera } from "../src/StandardCamera";
import { Node } from "../src/Node";
import { mat4 } from "@alipay/o3-math";

describe("projection test", function() {
  let node: Node;
  let camera: StandardCamera;
  let identityMatrix;
  beforeAll(() => {
    node = new Node();
    camera = node.createAbility(StandardCamera);
    identityMatrix = mat4.create();
  });

  it("perspective calculate", () => {
    camera.viewport = [0, 0, 400, 400];
    camera.fieldOfView = 45;
    camera.nearClipPlane = 10;
    camera.farClipPlane = 100;
    const projectionMatrix = camera.projectionMatrix;
    const result = mat4.perspective(new Float32Array(16), 45, 400 / 400, 10, 100);
    expect(projectionMatrix).toEqual(result);
  });

  it("perspective setting", () => {
    camera.projectionMatrix = mat4.create() as any;
    camera.fieldOfView = 60;
    expect(camera.projectionMatrix).toEqual(identityMatrix);
  });

  it("reset perspective", () => {
    camera.resetProjectionMatrix();
    camera.viewport = [0, 0, 400, 400];
    camera.fieldOfView = 60;
    camera.nearClipPlane = 10;
    camera.farClipPlane = 100;
    const result = mat4.perspective(new Float32Array(16), 60, 400 / 400, 10, 100);
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
});
