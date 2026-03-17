import {
  Camera,
  Entity,
  PointerEventData,
  RenderTarget,
  Script,
  Sprite,
  Texture2D,
  TextureFormat
} from "@galacean/engine-core";
import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { CanvasRenderMode, Image, RectMask2D, Text, UICanvas, UIRenderer, UITransform } from "@galacean/engine-ui";
import { afterEach, describe, expect, it } from "vitest";

interface UIFixture {
  camera: Camera;
  canvasDOM: HTMLCanvasElement;
  canvasEntity: Entity;
  colorTexture?: Texture2D;
  engine: WebGLEngine;
  height: number;
  inputManager: WebGLEngine["inputManager"];
  renderTarget?: RenderTarget;
  root: Entity;
  width: number;
}

const fixtures: UIFixture[] = [];

describe("RectMask2D", () => {
  afterEach(() => {
    while (fixtures.length > 0) {
      const fixture = fixtures.pop()!;
      fixture.engine.destroy();
      fixture.canvasDOM.remove();
    }
  });

  it("should return false when mask size is zero", async () => {
    const fixture = await createUIFixture();
    const maskEntity = fixture.root.createChild("mask");
    const rectMask = maskEntity.addComponent(RectMask2D);
    const transform = maskEntity.transform as UITransform;
    transform.size.set(0, 100);
    const worldRect = new Vector4();

    expect(rectMask._getWorldRect(worldRect)).toBe(false);
  });

  it("should clamp negative softness values", async () => {
    const fixture = await createUIFixture();
    const rectMask = fixture.root.createChild("mask").addComponent(RectMask2D);

    rectMask.softness.set(-4, 6);
    expect(rectMask.softness.x).toBe(0);
    expect(rectMask.softness.y).toBe(6);

    rectMask.softness = new Vector2(5, -3);
    expect(rectMask.softness.x).toBe(5);
    expect(rectMask.softness.y).toBe(0);
  });

  it("should compute world rect from parent transform scale and translation", async () => {
    const fixture = await createUIFixture();
    const container = fixture.root.createChild("container");
    container.transform.setPosition(40, -30, 0);
    container.transform.setScale(2, 1.5, 1);

    const maskEntity = container.createChild("mask");
    const rectMask = maskEntity.addComponent(RectMask2D);
    const transform = maskEntity.transform as UITransform;
    transform.pivot.set(0, 0);
    transform.size.set(50, 40);
    const worldRect = new Vector4();

    expect(rectMask._getWorldRect(worldRect)).toBe(true);
    const canvasRect = getUIWorldRect(fixture.canvasEntity.transform as UITransform);
    expectVector4Close(worldRect, [canvasRect.x + 40, canvasRect.y - 30, canvasRect.x + 140, canvasRect.y + 30]);
  });

  it("should update contains result after transform changes", async () => {
    const fixture = await createUIFixture();
    const maskEntity = fixture.canvasEntity.createChild("mask");
    const rectMask = maskEntity.addComponent(RectMask2D);
    const transform = maskEntity.transform as UITransform;
    transform.size.set(100, 80);
    transform.setPosition(20, -10, 0);
    const initialWorldRect = new Vector4();
    rectMask._getWorldRect(initialWorldRect);

    expect(
      rectMask._containsWorldPoint(
        new Vector3((initialWorldRect.x + initialWorldRect.z) * 0.5, (initialWorldRect.y + initialWorldRect.w) * 0.5, 0)
      )
    ).toBe(true);
    expect(rectMask._containsWorldPoint(new Vector3(initialWorldRect.x - 5, initialWorldRect.y - 5, 0))).toBe(false);

    transform.setPosition(80, 0, 0);
    const movedWorldRect = new Vector4();
    rectMask._getWorldRect(movedWorldRect);

    expect(
      rectMask._containsWorldPoint(
        new Vector3((initialWorldRect.x + initialWorldRect.z) * 0.5, (initialWorldRect.y + initialWorldRect.w) * 0.5, 0)
      )
    ).toBe(false);
    expect(
      rectMask._containsWorldPoint(
        new Vector3((movedWorldRect.x + movedWorldRect.z) * 0.5, (movedWorldRect.y + movedWorldRect.w) * 0.5, 0)
      )
    ).toBe(true);
  });

  it("should only raycast within rect mask area", async () => {
    const fixture = await createUIFixture();
    const { clickScript, clickAtNormalizedPosition } = createRaycastFixture(fixture);

    clickScript.clickCount = 0;

    clickAtNormalizedPosition(0.5, 0.5);
    expect(clickScript.clickCount).toBe(1);

    clickAtNormalizedPosition(0.15, 0.15);
    expect(clickScript.clickCount).toBe(1);
  });

  it("should update raycast result when rect mask size changes", async () => {
    const fixture = await createUIFixture();
    const { clickScript, clickAtNormalizedPosition, rectMaskTransform } = createRaycastFixture(fixture);

    clickScript.clickCount = 0;

    rectMaskTransform.size.set(100, 100);
    clickAtNormalizedPosition(0.15, 0.15);
    expect(clickScript.clickCount).toBe(0);

    rectMaskTransform.size.set(300, 300);
    clickAtNormalizedPosition(0.15, 0.15);
    expect(clickScript.clickCount).toBe(1);
  });

  it("should update raycast result when rect mask enabled state changes", async () => {
    const fixture = await createUIFixture();
    const { clickScript, clickAtNormalizedPosition, rectMask, rectMaskTransform } = createRaycastFixture(fixture);

    rectMaskTransform.size.set(100, 100);
    clickScript.clickCount = 0;

    rectMask.enabled = false;
    clickAtNormalizedPosition(0.15, 0.15);
    expect(clickScript.clickCount).toBe(1);

    rectMask.enabled = true;
    clickScript.clickCount = 0;
    clickAtNormalizedPosition(0.15, 0.15);
    expect(clickScript.clickCount).toBe(0);
  });

  it("should upload nested rect mask intersection and hard clip state to image and text renderers", async () => {
    const fixture = await createUIFixture();
    const parentEntity = fixture.canvasEntity.createChild("parentMask");
    const parentTransform = parentEntity.transform as UITransform;
    parentTransform.size.set(180, 100);
    const parentMask = parentEntity.addComponent(RectMask2D);
    parentMask.softness.set(2, 3);

    const childEntity = parentEntity.createChild("childMask");
    const childTransform = childEntity.transform as UITransform;
    childTransform.size.set(130, 150);
    childTransform.setPosition(15, 15, 0);
    const childMask = childEntity.addComponent(RectMask2D);
    childMask.softness.set(7, 11);
    childMask.alphaClip = true;

    const imageEntity = childEntity.createChild("image");
    const imageTransform = imageEntity.transform as UITransform;
    imageTransform.size.set(160, 160);
    const image = imageEntity.addComponent(Image);
    image.sprite = createSolidSprite(fixture.engine);

    const textEntity = childEntity.createChild("text");
    const textTransform = textEntity.transform as UITransform;
    textTransform.size.set(120, 80);
    const text = textEntity.addComponent(Text);
    text.text = "Mask";
    text.fontSize = 40;

    renderFramesToTarget(fixture);

    const expectedRect = intersectWorldRects(parentMask, childMask);
    const expectedSoftness: [number, number, number, number] = [7, 3, 7, 3];
    assertRectMaskState(image, expectedRect, expectedSoftness, true);
    assertRectMaskState(text, expectedRect, expectedSoftness, true);
  });

  it("should clear clip softness and hard clip state when every mask becomes inactive", async () => {
    const fixture = await createUIFixture();
    const maskEntity = fixture.canvasEntity.createChild("mask");
    const maskTransform = maskEntity.transform as UITransform;
    maskTransform.size.set(160, 160);
    const rectMask = maskEntity.addComponent(RectMask2D);
    rectMask.softness.set(6, 4);
    rectMask.alphaClip = true;

    const imageEntity = maskEntity.createChild("image");
    const imageTransform = imageEntity.transform as UITransform;
    imageTransform.size.set(120, 120);
    const image = imageEntity.addComponent(Image);
    image.sprite = createSolidSprite(fixture.engine);

    renderFrames(fixture.engine);
    const worldRect = new Vector4();
    rectMask._getWorldRect(worldRect);
    assertRectMaskState(image, [worldRect.x, worldRect.y, worldRect.z, worldRect.w], [6, 4, 6, 4], true);

    rectMask.enabled = false;
    renderFrames(fixture.engine);

    expect(image.shaderData.getFloat(getRectClipEnabledProperty())).toBe(0);
    expect(image.shaderData.getFloat(getRectClipHardClipProperty())).toBe(0);
    expectVector4Close(image.shaderData.getVector4(getRectClipSoftnessProperty()), [0, 0, 0, 0]);
  });

  it("should keep translated child image visible after rect mask clipping", async () => {
    const fixture = await createUIFixture({ width: 256, height: 256 });
    const solidSprite = createSolidSprite(fixture.engine);

    const viewportEntity = fixture.canvasEntity.createChild("viewport");
    const viewportTransform = viewportEntity.transform as UITransform;
    viewportTransform.size.set(140, 140);
    viewportTransform.setPosition(50, -20, 0);

    const viewportBackground = viewportEntity.addComponent(Image);
    viewportBackground.sprite = solidSprite;
    viewportBackground.color.set(0.25, 0.25, 0.25, 1);

    const rectMask = viewportEntity.addComponent(RectMask2D);
    rectMask.alphaClip = true;

    const imageEntity = viewportEntity.createChild("image");
    const imageTransform = imageEntity.transform as UITransform;
    imageTransform.size.set(80, 80);
    imageTransform.setPosition(35, 25, 0);
    const image = imageEntity.addComponent(Image);
    image.sprite = solidSprite;
    image.color.set(1, 0, 0, 1);

    renderFrames(fixture.engine);

    const viewportRect = getUIWorldRect(viewportTransform);
    const imageRect = getUIWorldRect(imageTransform);
    const visibleImageRect = intersectRects(viewportRect, imageRect);

    const insideImage = sampleWorldPixel(
      fixture,
      (visibleImageRect.x + visibleImageRect.z) * 0.5,
      (visibleImageRect.y + visibleImageRect.w) * 0.5
    );
    const insideViewportBackground = sampleWorldPixel(
      fixture,
      (viewportRect.x + imageRect.x) * 0.5,
      (viewportRect.y + viewportRect.w) * 0.5
    );
    const outsideViewport = sampleWorldPixel(fixture, viewportRect.x - 20, viewportRect.w + 20);
    expect(insideImage[0]).toBeGreaterThan(220);
    expect(insideImage[1]).toBeLessThan(40);
    expect(insideImage[2]).toBeLessThan(40);

    expect(insideViewportBackground[0]).toBeGreaterThan(120);
    expect(Math.abs(insideViewportBackground[0] - insideViewportBackground[1])).toBeLessThan(10);
    expect(Math.abs(insideViewportBackground[1] - insideViewportBackground[2])).toBeLessThan(10);

    expect(outsideViewport[0]).toBeLessThan(20);
    expect(outsideViewport[1]).toBeLessThan(20);
    expect(outsideViewport[2]).toBeLessThan(20);
  });
});

async function createUIFixture(
  options: { height?: number; width?: number; withRenderTarget?: boolean } = {}
): Promise<UIFixture> {
  const { width = 300, height = 300, withRenderTarget = false } = options;
  const body = document.getElementsByTagName("body")[0];
  const canvasDOM = document.createElement("canvas");
  canvasDOM.style.width = `${width}px`;
  canvasDOM.style.height = `${height}px`;
  body.appendChild(canvasDOM);

  const engine = await WebGLEngine.create({ canvas: canvasDOM });
  const webCanvas = engine.canvas;
  webCanvas.width = width;
  webCanvas.height = height;

  const scene = engine.sceneManager.scenes[0];
  scene.background.solidColor.set(0, 0, 0, 1);
  const root = scene.createRootEntity("root");

  const cameraEntity = root.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);

  let colorTexture: Texture2D = null;
  let renderTarget: RenderTarget = null;
  if (withRenderTarget) {
    colorTexture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, false, false);
    renderTarget = new RenderTarget(engine, width, height, colorTexture, TextureFormat.Depth24Stencil8, 1);
    camera.renderTarget = renderTarget;
  }

  const canvasEntity = root.createChild("canvas");
  const rootCanvas = canvasEntity.addComponent(UICanvas);
  rootCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  rootCanvas.referenceResolutionPerUnit = 1;
  rootCanvas.referenceResolution.set(width, height);

  const fixture: UIFixture = {
    camera,
    canvasDOM,
    canvasEntity,
    colorTexture,
    engine,
    height,
    inputManager: engine.inputManager,
    renderTarget,
    root,
    width
  };
  fixtures.push(fixture);
  return fixture;
}

function createRaycastFixture(fixture: UIFixture) {
  class ClickScript extends Script {
    clickCount = 0;

    override onPointerClick(_eventData: PointerEventData): void {
      this.clickCount++;
    }
  }

  const rectMaskEntity = fixture.canvasEntity.createChild("rectMask");
  const rectMaskTransform = rectMaskEntity.transform as UITransform;
  rectMaskTransform.size.set(100, 100);
  const rectMask = rectMaskEntity.addComponent(RectMask2D);

  const imageEntity = rectMaskEntity.createChild("image");
  const imageTransform = imageEntity.transform as UITransform;
  imageTransform.size.set(300, 300);
  const image = imageEntity.addComponent(Image);
  image.sprite = createSolidSprite(fixture.engine);
  const clickScript = imageEntity.addComponent(ClickScript);

  let pointerId = 0;
  const clickAtNormalizedPosition = (x: number, y: number): void => {
    // @ts-ignore
    const { _pointerManager: pointerManager } = fixture.inputManager;
    const { _target: target } = pointerManager;
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + rect.width * x;
    const clientY = rect.top + rect.height * y;
    const id = ++pointerId;
    target.dispatchEvent(generatePointerEvent("pointerdown", id, clientX, clientY));
    fixture.engine.update();
    target.dispatchEvent(generatePointerEvent("pointerup", id, clientX, clientY));
    fixture.engine.update();
  };

  return { clickAtNormalizedPosition, clickScript, image, rectMask, rectMaskTransform };
}

function createSolidSprite(engine: WebGLEngine, rgba: [number, number, number, number] = [255, 255, 255, 255]): Sprite {
  const texture = new Texture2D(engine, 1, 1);
  texture.setPixelBuffer(new Uint8Array(rgba));
  return new Sprite(engine, texture);
}

function renderFrames(engine: WebGLEngine, frameCount: number = 3): void {
  for (let i = 0; i < frameCount; i++) {
    engine.update();
  }
  // @ts-ignore
  engine._hardwareRenderer._gl.finish();
}

function renderFramesToTarget(fixture: UIFixture, frameCount: number = 3): void {
  renderFrames(fixture.engine, frameCount);
  fixture.camera.render();
  // @ts-ignore
  fixture.engine._hardwareRenderer._gl.finish();
}

function sampleWorldPixel(fixture: UIFixture, worldX: number, worldY: number): Uint8Array {
  if (fixture.colorTexture) {
    return sampleTexturePixel(fixture.colorTexture, fixture.width, fixture.height, worldX, worldY);
  }

  const x = Math.min(Math.max(Math.round(worldX), 0), fixture.width - 1);
  const y = Math.min(Math.max(Math.round(worldY), 0), fixture.height - 1);
  const buffer = new Uint8Array(4);
  // @ts-ignore
  const gl = fixture.engine._hardwareRenderer._gl;
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
  return buffer;
}

function sampleTexturePixel(
  texture: Texture2D,
  width: number,
  height: number,
  pixelX: number,
  pixelY: number
): Uint8Array {
  const x = Math.min(Math.max(Math.round(pixelX), 0), width - 1);
  const y = Math.min(Math.max(Math.round(pixelY), 0), height - 1);
  const buffer = new Uint8Array(4);
  texture.getPixelBuffer(x, y, 1, 1, 0, buffer);
  return buffer;
}

function assertRectMaskState(
  renderer: UIRenderer,
  expectedRect: [number, number, number, number],
  expectedSoftness: [number, number, number, number],
  expectedHardClip: boolean
): void {
  expect(renderer.shaderData.getFloat(getRectClipEnabledProperty())).toBe(1);
  expect(renderer.shaderData.getFloat(getRectClipHardClipProperty())).toBe(expectedHardClip ? 1 : 0);
  expectVector4Close(renderer.shaderData.getVector4(getRectClipRectProperty()), expectedRect);
  expectVector4Close(renderer.shaderData.getVector4(getRectClipSoftnessProperty()), expectedSoftness);
}

function expectVector4Close(vector: Vector4, expected: [number, number, number, number]): void {
  expect(vector.x).toBeCloseTo(expected[0], 4);
  expect(vector.y).toBeCloseTo(expected[1], 4);
  expect(vector.z).toBeCloseTo(expected[2], 4);
  expect(vector.w).toBeCloseTo(expected[3], 4);
}

function getUIWorldRect(transform: UITransform): Vector4 {
  const { x: width, y: height } = transform.size;
  const { x: pivotX, y: pivotY } = transform.pivot;
  const left = -width * pivotX;
  const right = width * (1 - pivotX);
  const bottom = -height * pivotY;
  const top = height * (1 - pivotY);

  const worldMatrix = transform.worldMatrix;
  const corner0 = new Vector3(left, bottom, 0);
  const corner1 = new Vector3(left, top, 0);
  const corner2 = new Vector3(right, bottom, 0);
  const corner3 = new Vector3(right, top, 0);
  Vector3.transformCoordinate(corner0, worldMatrix, corner0);
  Vector3.transformCoordinate(corner1, worldMatrix, corner1);
  Vector3.transformCoordinate(corner2, worldMatrix, corner2);
  Vector3.transformCoordinate(corner3, worldMatrix, corner3);

  return new Vector4(
    Math.min(corner0.x, corner1.x, corner2.x, corner3.x),
    Math.min(corner0.y, corner1.y, corner2.y, corner3.y),
    Math.max(corner0.x, corner1.x, corner2.x, corner3.x),
    Math.max(corner0.y, corner1.y, corner2.y, corner3.y)
  );
}

function intersectWorldRects(maskA: RectMask2D, maskB: RectMask2D): [number, number, number, number] {
  const rectA = new Vector4();
  const rectB = new Vector4();
  maskA._getWorldRect(rectA);
  maskB._getWorldRect(rectB);
  const rect = intersectRects(rectA, rectB);
  return [rect.x, rect.y, rect.z, rect.w];
}

function intersectRects(rectA: Vector4, rectB: Vector4): Vector4 {
  return new Vector4(
    Math.max(rectA.x, rectB.x),
    Math.max(rectA.y, rectB.y),
    Math.min(rectA.z, rectB.z),
    Math.min(rectA.w, rectB.w)
  );
}

function getRectClipEnabledProperty() {
  // @ts-ignore
  return UIRenderer._rectClipEnabledProperty;
}

function getRectClipHardClipProperty() {
  // @ts-ignore
  return UIRenderer._rectClipHardClipProperty;
}

function getRectClipRectProperty() {
  // @ts-ignore
  return UIRenderer._rectClipRectProperty;
}

function getRectClipSoftnessProperty() {
  // @ts-ignore
  return UIRenderer._rectClipSoftnessProperty;
}

function generatePointerEvent(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
  button: number = 0,
  buttons: number = 1
) {
  return new PointerEvent(type, { pointerId, clientX, clientY, button, buttons });
}
