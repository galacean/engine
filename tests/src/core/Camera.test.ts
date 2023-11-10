import { Camera, CameraClearFlags, Entity, Layer } from "@galacean/engine-core";
import { Matrix, Ray, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("camera test", function () {
  const canvasDOM = new OffscreenCanvas(256, 256);
  let rootEntity: Entity;
  let camera: Camera;
  let identityMatrix: Matrix = new Matrix();

  before(async function () {
    this.timeout(10000);
    const engine = await WebGLEngine.create({ canvas: canvasDOM });
    rootEntity = engine.sceneManager.scenes[0].createRootEntity();
    camera = rootEntity.addComponent(Camera);
  });

  it("constructor", () => {
    // Test default values
    expect(camera.aspectRatio).to.eq(1);
    expect(camera.entity.transform.worldPosition).not.to.be.undefined;
    expect(camera.viewport).to.deep.include(new Vector4(0, 0, 1, 1).toJSON());
    expect(camera.fieldOfView).to.eq(45);
    expect(camera.isOrthographic).to.eq(false);

    // Test set renderTarget values
    camera.renderTarget = null;
    expect(camera.renderTarget).to.eq(null);

    // Test that _renderPipeline is not undefined
    expect(camera["_renderPipeline"]).not.to.be.undefined;
  });

  it("private property value", () => {
    // Test nearClipPlane
    const nearClipPlane = 0.1;
    const expectedNearClipPlane = nearClipPlane * 100;
    expect(camera.nearClipPlane).to.eq(nearClipPlane);
    camera.nearClipPlane = expectedNearClipPlane;
    expect(camera.nearClipPlane).to.eq(expectedNearClipPlane);
    camera.nearClipPlane = nearClipPlane;

    // Test farClipPlane
    const farClipPlane = 100;
    const expectedFarClipPlane = farClipPlane * 0.1;
    expect(camera.farClipPlane).to.eq(farClipPlane);
    camera.farClipPlane = expectedFarClipPlane;
    expect(camera.farClipPlane).to.eq(expectedFarClipPlane);
    camera.farClipPlane = farClipPlane;

    // Test fieldOfView
    const fieldOfView = 45;
    const expectedFieldOfView = fieldOfView + 15;
    expect(camera.fieldOfView).to.eq(fieldOfView);
    camera.fieldOfView = expectedFieldOfView;
    expect(camera.fieldOfView).to.eq(expectedFieldOfView);

    // Test aspectRatio
    const expectedAspectRatio = parseFloat((16 / 9).toFixed(2));
    expect(camera.aspectRatio).not.to.be.undefined;
    camera.aspectRatio = expectedAspectRatio;
    expect(camera.aspectRatio).to.eq(expectedAspectRatio);

    // Test viewport
    const originViewPort = new Vector4(0, 0, 1, 1);
    const expectedViewPort = new Vector4(0, 1, 0, 1);
    expect(camera.viewport).to.deep.include(originViewPort.toJSON());
    camera.viewport = expectedViewPort;
    expect(camera.viewport).to.deep.include(expectedViewPort.toJSON());
    camera.viewport = originViewPort;

    // Test orthographicSize
    const orthographicSize = 10;
    const expectedOrthographicSize = orthographicSize * 0.5;
    expect(camera.orthographicSize).to.eq(orthographicSize);
    camera.orthographicSize = expectedOrthographicSize;
    expect(camera.orthographicSize).to.eq(expectedOrthographicSize);
    camera.orthographicSize = orthographicSize;

    // Test ReplacementShader
    camera.resetReplacementShader();
    expect(camera["_replacementShader"]).to.eq(null);
    expect(camera["_replacementSubShaderTag"]).to.eq(null);
  });

  it("static void function", () => {
    // Test that restore the automatic calculation of projection matrix.
    camera.resetProjectionMatrix();
    expect(camera["_isProjMatSetting"]).to.eq(false);

    // Test that restore the automatic calculation of the aspect ratio.
    camera.resetAspectRatio();
    expect(camera["_customAspectRatio"]).to.be.undefined;
  });

  it("enable HDR", () => {
    // origin method has not been implemented

    // get enableHDR
    expect(camera.enableHDR).to.eq(false);
    // set enableHDR
    camera.enableHDR = true;
    expect(camera.enableHDR).to.eq(false);
  });

  it("view matrix", () => {
    // Test that view matrix is identity matrix when camera is at origin
    camera.entity.transform.setWorldPosition(0, 0, 0);
    expect(camera.viewMatrix).to.deep.eq(identityMatrix);

    // Test that view matrix is correct when camera is moved
    Matrix.invert(camera.entity.transform.worldMatrix, identityMatrix);
    expect(camera.viewMatrix).to.deep.eq(identityMatrix);
  });

  it("culling mask", () => {
    // Test default culling mask
    expect(camera.cullingMask).to.eq(Layer.Everything);

    // Test setting culling mask
    camera.cullingMask = Layer.Layer3;
    expect(camera.cullingMask).to.eq(Layer.Layer3);
  });

  it("clear flags", () => {
    // Test default clear flags
    expect(camera.clearFlags).to.eq(CameraClearFlags.All);

    // Test setting clear flags
    camera.clearFlags = CameraClearFlags.Color;
    expect(camera.clearFlags).to.eq(CameraClearFlags.Color);
  });

  it("world to viewport point", () => {
    // Test that world point to viewport point works correctly
    const worldPoint = new Vector3(512, 512, 512);
    const viewportPoint = camera.worldToViewportPoint(worldPoint, new Vector3());
    const expectedworldPoint = camera.viewportToWorldPoint(viewportPoint, new Vector3());
    expect(worldPoint.x).to.be.closeTo(expectedworldPoint.x, 0.1, "Result x should match expected value");
    expect(worldPoint.y).to.be.closeTo(expectedworldPoint.y, 0.1, "Result y should match expected value");
  });

  it("viewport to world point, while isOrthographic = false", () => {
    // Test that viewport point to world point works correctly, while camera.isOrthographic = false
    const viewportPoint = new Vector3(0, 0, 30);
    const worldPoint = camera.viewportToWorldPoint(viewportPoint, new Vector3());
    const expectedviewportPoint = camera.worldToViewportPoint(worldPoint, new Vector3());
    expect(viewportPoint.z).to.be.closeTo(expectedviewportPoint.z, 0.1, "Result z should match expected value");
  });

  it("viewport to world point, while isOrthographic = true", () => {
    // Test that viewport point to world point works correctly, while camera.isOrthographic = true
    camera.isOrthographic = true;
    const viewportPoint = new Vector3(0, 0, -512);
    const worldPoint = camera.viewportToWorldPoint(viewportPoint, new Vector3());
    const expectedviewportPoint = camera.worldToViewportPoint(worldPoint, new Vector3());
    expect(viewportPoint.z).to.be.closeTo(expectedviewportPoint.z, 0.0001, "Result z should match expected value");
    camera.isOrthographic = false;
  });

  it("viewport point to ray", () => {
    // Test that viewport point to ray works correctly
    const viewportPoint = new Vector2(0.5, 0.5);
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const direction = camera.viewportPointToRay(viewportPoint, ray);
    expect(ray).to.deep.eq(direction);
  });

  it("screen point to ray", () => {
    // Test that screen point to ray works correctly
    const screenPoint = new Vector2(0.5, 0.5);
    const ray = new Ray(new Vector3(0, 1, 1), new Vector3(0, 1, 0));
    const direction = camera.screenPointToRay(screenPoint, ray);
    expect(ray).to.deep.eq(direction);
  });

  it("screen to viewport point", () => {
    // Test that screen to viewport point works correctly
    const screenPoint = new Vector3(0, 0, 512);
    const viewport = camera.screenToViewportPoint(screenPoint, new Vector3());
    expect(viewport).to.deep.eq(screenPoint);
  });

  it("viewport to screen point", () => {
    // Test that viewport to screen point works correctly
    const viewportPoint = new Vector3(0, 0, 512);
    const screenPoint = camera.viewportToScreenPoint(viewportPoint, new Vector3());
    expect(screenPoint).to.deep.eq(viewportPoint);
  });

  it("screen to world point", () => {
    // Test that screen to world point works correctly
    const screenPoint = new Vector3(512, 512, 512);
    const worldPoint = camera.screenToWorldPoint(screenPoint, new Vector3());
    const expectedScreenPoint = camera.worldToScreenPoint(worldPoint, new Vector3());
    expect(screenPoint.x).to.be.closeTo(expectedScreenPoint.x, 0.1, "Result x should match expected value");
    expect(screenPoint.y).to.be.closeTo(expectedScreenPoint.y, 0.1, "Result y should match expected value");
  });

  it("world to screen point", () => {
    // Test that world to screen point works correctly
    const worldPoint = new Vector3(0, 0, 512);
    const screenPoint = camera.worldToScreenPoint(worldPoint, new Vector3());
    const expectedworldPoint = camera.screenToWorldPoint(screenPoint, new Vector3());
    expect(worldPoint.z).to.be.closeTo(expectedworldPoint.z, 0.1, "Result z should match expected value");
  });

  it("precision of viewportPointToRay", () => {
    camera.farClipPlane = 1000000000;
    camera.nearClipPlane = 0.1;
    const ray = camera.viewportPointToRay(new Vector2(0.5, 0.5), new Ray());
    expect(ray.direction.x).not.to.be.NaN;
    expect(ray.direction.y).not.to.be.NaN;
    expect(Math.abs(ray.direction.z)).not.eq(Infinity);
  });

  /*
    Attention:
    Below methods will change the default view of current Camera. 
    If executed in advance, it will affect the expected results of other test cases, 
    so it should be placed at the end of the test case execution.
  */
  it("projection matrix", () => {
    // Test perspective projection matrix
    camera.aspectRatio = 2;
    camera.fieldOfView = 60;
    Matrix.perspective((60 * Math.PI) / 180, 2, camera.nearClipPlane, camera.farClipPlane, camera.viewMatrix);
    expect(camera.projectionMatrix).to.deep.eq(camera.viewMatrix);

    // Test orthographic projection matrix
    camera.orthographicSize = 5;
    Matrix.ortho(
      -camera.orthographicSize,
      camera.orthographicSize,
      -camera.orthographicSize,
      camera.orthographicSize,
      camera.nearClipPlane,
      camera.farClipPlane,
      camera.viewMatrix
    );
    const projectionMatrix = camera.projectionMatrix.elements;
    const viewMatrix = camera.viewMatrix.elements;
    //No matter the value of orthographicSize changes, the following equation is always true.
    expect(projectionMatrix[1] + viewMatrix[1]).to.eq(0);
    expect(projectionMatrix[2] + viewMatrix[2]).to.eq(0);
    expect(projectionMatrix[3] + viewMatrix[3]).to.eq(0);
    expect(projectionMatrix[4] + viewMatrix[4]).to.eq(0);
    expect(projectionMatrix[5]).to.be.closeTo(projectionMatrix[0] * 2, 0.1, "Result should match expected value");
    expect(projectionMatrix[6] + viewMatrix[6]).to.eq(0);
    expect(projectionMatrix[7] + viewMatrix[7]).to.eq(0);
    expect(projectionMatrix[8] + viewMatrix[8]).to.eq(0);
    expect(projectionMatrix[9] + viewMatrix[9]).to.eq(0);
    expect(projectionMatrix[10]).to.eq(viewMatrix[14]);
    expect(projectionMatrix[11]).to.eq(-viewMatrix[15]);
    expect(projectionMatrix[12]).to.eq(-viewMatrix[12]);
    expect(projectionMatrix[13]).to.eq(-viewMatrix[13]);
    expect(projectionMatrix[14] - projectionMatrix[0]).to.be.closeTo(
      viewMatrix[14],
      0.1,
      "Result should match expected value"
    );
    expect(projectionMatrix[15]).to.eq(viewMatrix[11]);

    // Test reset projection matrix
    camera.projectionMatrix = camera.viewMatrix;
    expect(camera.projectionMatrix).to.deep.eq(camera.viewMatrix);
  });

  it("destroy test", () => {
    camera.destroy();
  });
});
