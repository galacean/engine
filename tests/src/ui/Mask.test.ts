import { PointerEventData, Script, Sprite, SpriteMaskInteraction, SpriteMaskLayer, Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { CanvasRenderMode, Image, Mask, UICanvas, UITransform } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

describe("Mask", async () => {
  const body = document.getElementsByTagName("body")[0];
  const canvasDOM = document.createElement("canvas");
  canvasDOM.style.width = "18px";
  canvasDOM.style.height = "18px";
  body.appendChild(canvasDOM);

  const engine = await WebGLEngine.create({ canvas: canvasDOM });
  const webCanvas = engine.canvas;
  webCanvas.width = 300;
  webCanvas.height = 300;
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");
  const inputManager = engine.inputManager;

  const canvasEntity = root.createChild("canvas");
  const rootCanvas = canvasEntity.addComponent(UICanvas);
  rootCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  rootCanvas.referenceResolutionPerUnit = 50;
  rootCanvas.referenceResolution.set(300, 300);

  class ClickScript extends Script {
    clickCount = 0;

    override onPointerClick(_eventData: PointerEventData): void {
      ++this.clickCount;
    }
  }

  const imageEntity = canvasEntity.createChild("image");
  const image = imageEntity.addComponent(Image);
  (<UITransform>imageEntity.transform).size.set(300, 300);
  const clickScript = imageEntity.addComponent(ClickScript);

  const maskEntity = canvasEntity.createChild("mask");
  const mask = maskEntity.addComponent(Mask);
  (<UITransform>maskEntity.transform).size.set(100, 100);
  mask.sprite = createSolidSprite(engine);

  let pointerId = 0;
  const clickAtNormalizedPosition = (x: number, y: number): void => {
    // @ts-ignore
    const { _pointerManager: pointerManager } = inputManager;
    const { _target: target } = pointerManager;
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + rect.width * x;
    const clientY = rect.top + rect.height * y;
    const id = ++pointerId;
    target.dispatchEvent(generatePointerEvent("pointerdown", id, clientX, clientY));
    engine.update();
    target.dispatchEvent(generatePointerEvent("pointerup", id, clientX, clientY));
    engine.update();
  };

  it("should only raycast the inside area for VisibleInsideMask", () => {
    image.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    clickScript.clickCount = 0;

    clickAtNormalizedPosition(0.15, 0.15);
    expect(clickScript.clickCount).toBe(0);

    clickAtNormalizedPosition(0.5, 0.5);
    expect(clickScript.clickCount).toBe(1);
  });

  it("should only raycast the outside area for VisibleOutsideMask", () => {
    image.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    clickScript.clickCount = 0;

    clickAtNormalizedPosition(0.5, 0.5);
    expect(clickScript.clickCount).toBe(0);

    clickAtNormalizedPosition(0.15, 0.15);
    expect(clickScript.clickCount).toBe(1);
  });

  it("should update raycast result when mask influence layer changes", () => {
    image.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    clickScript.clickCount = 0;

    mask.influenceLayers = SpriteMaskLayer.Layer1;
    clickAtNormalizedPosition(0.5, 0.5);
    expect(clickScript.clickCount).toBe(0);

    mask.influenceLayers = SpriteMaskLayer.Layer0;
    clickAtNormalizedPosition(0.5, 0.5);
    expect(clickScript.clickCount).toBe(1);
  });

  it("should use mask sprite alpha for raycast visibility", () => {
    image.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    mask.sprite = createCircleSprite(engine, 256);
    mask.alphaCutoff = 0.1;
    clickScript.clickCount = 0;

    // Inside mask rect but outside circle alpha.
    clickAtNormalizedPosition(0.37, 0.37);
    expect(clickScript.clickCount).toBe(0);

    // Circle center should still hit.
    clickAtNormalizedPosition(0.5, 0.5);
    expect(clickScript.clickCount).toBe(1);
  });
});

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

function createCircleSprite(engine: WebGLEngine, size: number): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create canvas 2d context.");
  }

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(size * 0.5, size * 0.5, size * 0.46, 0, Math.PI * 2);
  context.closePath();
  context.fill();

  const texture = new Texture2D(engine, size, size);
  texture.setImageSource(canvas);
  return new Sprite(engine, texture);
}

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}
