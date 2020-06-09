import { StandardCamera } from "../src/StandardCamera";
import { Camera } from "../src/Camera";
import { PerspectiveCamera } from "../src/PerspectiveCamera";
import { Node } from "@alipay/o3-core";
import { mat4, MathUtil } from "@alipay/o3-math";

describe("projection test", function() {
  let node: Node;
  let camera: StandardCamera;
  let oldCamera: PerspectiveCamera;
  let identityMatrix;
  beforeAll(() => {
    node = new Node();
    camera = node.createAbility(StandardCamera);
    oldCamera = node.createAbility(PerspectiveCamera);
    (oldCamera as any)._rhi = {
      canvas: {
        clientWidth: 375,
        clientHeight: 667,
        width: 750,
        height: 1334
      }
    };
    (oldCamera as any).viewport = [0, 0, 750, 1334];
    identityMatrix = mat4.create();
  });

  it("perspective calculate", () => {
    camera.viewportNormalized = [0, 0, 1, 1];
    camera.fieldOfView = 45;
    camera.nearClipPlane = 10;
    camera.farClipPlane = 100;
    const projectionMatrix = camera.projectionMatrix;
    const result = mat4.perspective(new Float32Array(16), MathUtil.toRadian(45), 400 / 400, 10, 100);
    expect(projectionMatrix).toEqual(result);
  });

  // it("perspective setting", () => {
  //   camera.projectionMatrix = mat4.create() as any;
  //   camera.fieldOfView = 60;
  //   expect(camera.projectionMatrix).toEqual(identityMatrix);
  // });

  // it("reset perspective", () => {
  //   camera.resetProjectionMatrix();
  //   camera.viewportNormalized = [0, 0, 1, 1];
  //   camera.fieldOfView = 60;
  //   camera.nearClipPlane = 10;
  //   camera.farClipPlane = 100;
  //   const result = mat4.perspective(new Float32Array(16), 60, 400 / 400, 10, 100);
  //   expect(camera.projectionMatrix).toEqual(result);
  // });

  // it("orth calculate", () => {
  //   camera.orthographicSize = 5;
  //   camera.isOrthographic = true;
  //   const projectionMatrix = camera.projectionMatrix;
  //   const width = (camera.orthographicSize * 400) / 400;
  //   const height = camera.orthographicSize;
  //   const result = mat4.ortho(new Float32Array(16), -width, width, -height, height, camera.nearClipPlane, camera.farClipPlane);
  //   expect(projectionMatrix).toEqual(result);
  // });

  // it("orth setting", () => {
  //   camera.projectionMatrix = mat4.create() as any;
  //   expect(camera.projectionMatrix).toEqual(identityMatrix);
  // });

  // it("do not trigger dirty", () => {
  //   camera.resetProjectionMatrix();
  //   camera.orthographicSize = 5;
  //   // trigger calculate
  //   camera.projectionMatrix;
  //   //@ts-ignore
  //   camera._orthographicSize = 4;

  //   const width = (camera.orthographicSize * 400) / 400;
  //   const height = camera.orthographicSize;
  //   const result = mat4.ortho(new Float32Array(16), -width, width, -height, height, camera.nearClipPlane, camera.farClipPlane);

  //   expect(camera.projectionMatrix).not.toEqual(result);
  // });

  // it("screen to viewport point", () => {
  //   camera.viewportNormalized = [0.5, 0.5, 0.5, 0.5];
  //   const out = camera.screenToViewportPoint([0.5, 0.5], [1, 1]);
  //   expect(out[0]).toBeCloseTo(0);
  //   expect(out[1]).toBeCloseTo(0);
  // });

  // it("viewport to screen point", () => {
  //   camera.viewportNormalized = [0.5, 0.5, 0.5, 0.5];
  //   const out = camera.viewportToScreenPoint([0.5, 0.5], [1, 1]);
  //   expect(out[0]).toBeCloseTo(0.75);
  //   expect(out[1]).toBeCloseTo(0.75);
  // });

  // it("world to viewport", () => {
  //   camera.projectionMatrix = [3.0807323455810547, 0, 0, 0, 0, 1.7320458889007568, 0, 0, 0, 0, -1.001001000404358, -1, 0, 0, -0.10010010004043579, 0];
  //   const out = camera.worldToViewportPoint([1, 1, 100], [0, 0, 0, 0]);
  //   expect(out).toEqual([0.48459633827209475, 0.5086602294445037, -100]);
  // });

  // it("world to screen", () => {
  //   camera.projectionMatrix = [3.0807323455810547, 0, 0, 0, 0, 1.7320458889007568, 0, 0, 0, 0, -1.001001000404358, -1, 0, 0, -0.10010010004043579, 0];
  //   const out = camera.worldToScreenPoint([1, 1, -100], [0, 0, 0, 0]);
  //   expect(out).toEqual([0.5154036617279053, 0.4913397705554962, 100]);
  // });

  // it("viewport to world", () => {
  //   camera.projectionMatrix = [3.0807409286499023, 0, 0, 0, 0, 1.7320507764816284, 0, 0, 0, 0, -1.0020020008087158, -1, 0, 0, -0.20020020008087158, 0];
  //   const out = camera.worldToViewportPoint([1, 1, -100], [0, 0, 0, 0]);
  //   const three = [out[0], out[1], out[3]] as any;
  //   const result = [0, 0, 0];
  //   console.time("calculate");
  //   for (let i = 0; i < 1000000; i++) {
  //     camera.viewportToWorldPoint(three, result as any);
  //   }
  //   console.timeEnd("calculate");

  //   console.time("calculate old");
  //   for (let i = 0; i < 1000000; i++) {
  //     oldCamera.screenToWorld(three, three[2]);
  //   }
  //   console.timeEnd("calculate old");

  //   console.time("new update");
  //   for (let i = 0; i < 1000000; i++) {
  //     camera.viewMatrix;
  //     camera.inverseViewMatrix;
  //   }
  //   console.timeEnd("new update");

  //   console.time("old update");
  //   for (let i = 0; i < 1000000; i++) {
  //     oldCamera.update(0);
  //   }
  //   console.timeEnd("old update");
  //   // result
  //   // expect()
  //   // console.log(hello);
  //   // console.log(out)
  // });
});
