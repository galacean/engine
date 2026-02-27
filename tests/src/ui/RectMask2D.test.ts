import { PointerEventData, Script, Sprite, Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { CanvasRenderMode, Image, RectMask2D, UICanvas, UITransform } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

describe("RectMask2D", async () => {
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

  const rectMaskEntity = canvasEntity.createChild("rectMask");
  const rectMaskTransform = <UITransform>rectMaskEntity.transform;
  rectMaskTransform.size.set(100, 100);
  const rectMask = rectMaskEntity.addComponent(RectMask2D);

  const imageEntity = rectMaskEntity.createChild("image");
  const image = imageEntity.addComponent(Image);
  (<UITransform>imageEntity.transform).size.set(300, 300);
  image.sprite = new Sprite(engine, new Texture2D(engine, 1, 1));
  const clickScript = imageEntity.addComponent(ClickScript);

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

  it("should only raycast within rect mask area", () => {
    clickScript.clickCount = 0;

    clickAtNormalizedPosition(0.5, 0.5);
    expect(clickScript.clickCount).toBe(1);

    clickAtNormalizedPosition(0.15, 0.15);
    expect(clickScript.clickCount).toBe(1);
  });

  it("should update raycast result when rect mask size changes", () => {
    clickScript.clickCount = 0;

    rectMaskTransform.size.set(100, 100);
    clickAtNormalizedPosition(0.15, 0.15);
    expect(clickScript.clickCount).toBe(0);

    rectMaskTransform.size.set(300, 300);
    clickAtNormalizedPosition(0.15, 0.15);
    expect(clickScript.clickCount).toBe(1);
  });

  it("should update raycast result when rect mask enabled state changes", () => {
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
