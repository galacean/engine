import { Camera, PointerEventData, Script } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { UICanvas, UIGroup, CanvasRenderMode, Image, UITransform } from "@galacean/engine-ui";
import { describe, expect, it, vi } from "vitest";

describe("UIEvent", async () => {
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

  // Add canvas
  const canvasEntity = root.createChild("canvas");
  const rootCanvas = canvasEntity.addComponent(UICanvas);
  rootCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  rootCanvas.referenceResolutionPerUnit = 50;
  rootCanvas.referenceResolution.set(300, 300);

  class TestScript extends Script {
    enterCount = 0;
    exitCount = 0;
    downCount = 0;
    clickCount = 0;
    beginDragCount = 0;
    dragCount = 0;
    endDragCount = 0;
    upCount = 0;
    dropCount = 0;
    onPointerEnter(eventData: PointerEventData): void {
      ++this.enterCount;
    }

    onPointerExit(eventData: PointerEventData): void {
      ++this.exitCount;
    }

    onPointerDown(eventData: PointerEventData): void {
      ++this.downCount;
    }

    onPointerClick(eventData: PointerEventData): void {
      ++this.clickCount;
    }

    onPointerBeginDrag(eventData: PointerEventData): void {
      ++this.beginDragCount;
    }

    onPointerDrag(eventData: PointerEventData): void {
      ++this.dragCount;
    }

    onPointerEndDrag(eventData: PointerEventData): void {
      ++this.endDragCount;
    }

    onPointerUp(eventData: PointerEventData): void {
      ++this.upCount;
    }

    onPointerDrop(eventData: PointerEventData): void {
      ++this.dropCount;
    }
  }

  // Add Image
  const imageEntity1 = canvasEntity.createChild("Image1");
  const image1 = imageEntity1.addComponent(Image);
  image1.color.set(1, 0, 0, 1);
  (<UITransform>imageEntity1.transform).size.set(300, 300);
  const script1 = imageEntity1.addComponent(TestScript);

  const imageEntity2 = imageEntity1.createChild("Image2");
  const image2 = imageEntity2.addComponent(Image);
  image2.color.set(0, 1, 0, 1);
  (<UITransform>imageEntity2.transform).size.set(200, 200);
  const script2 = imageEntity2.addComponent(TestScript);

  const imageEntity3 = imageEntity2.createChild("Image3");
  const image3 = imageEntity3.addComponent(Image);
  image3.color.set(0, 0, 1, 1);
  (<UITransform>imageEntity3.transform).size.set(100, 100);
  const script3 = imageEntity3.addComponent(TestScript);

  it("ui enter", () => {
    // @ts-ignore
    const { _pointerManager: pointerManager } = inputManager;
    const { _target: target } = pointerManager;
    const { left, top } = target.getBoundingClientRect();
    target.dispatchEvent(generatePointerEvent("pointerdown", 2, left + 2, top + 2));
    engine.update();

    expect(script1.enterCount).toBe(1);
    expect(script1.exitCount).toBe(0);
    expect(script1.downCount).toBe(1);
    expect(script1.clickCount).toBe(0);
    expect(script1.beginDragCount).toBe(1);
    expect(script1.dragCount).toBe(0);
    expect(script1.endDragCount).toBe(0);
    expect(script1.upCount).toBe(0);
    expect(script1.dropCount).toBe(0);

    expect(script2.enterCount).toBe(0);
    expect(script2.exitCount).toBe(0);
    expect(script2.downCount).toBe(0);
    expect(script2.clickCount).toBe(0);
    expect(script2.beginDragCount).toBe(0);
    expect(script2.dragCount).toBe(0);
    expect(script2.endDragCount).toBe(0);
    expect(script2.upCount).toBe(0);
    expect(script2.dropCount).toBe(0);

    expect(script3.enterCount).toBe(0);
    expect(script3.exitCount).toBe(0);
    expect(script3.downCount).toBe(0);
    expect(script3.clickCount).toBe(0);
    expect(script3.beginDragCount).toBe(0);
    expect(script3.dragCount).toBe(0);
    expect(script3.endDragCount).toBe(0);
    expect(script3.upCount).toBe(0);
    expect(script3.dropCount).toBe(0);

    target.dispatchEvent(generatePointerEvent("pointerup", 2, left + 5, top + 5));
    engine.update();

    expect(script1.enterCount).toBe(1);
    expect(script1.exitCount).toBe(0);
    expect(script1.downCount).toBe(1);
    expect(script1.clickCount).toBe(1);
    expect(script1.beginDragCount).toBe(1);
    expect(script1.dragCount).toBe(0);
    expect(script1.endDragCount).toBe(1);
    expect(script1.upCount).toBe(1);
    expect(script1.dropCount).toBe(1);

    expect(script2.enterCount).toBe(1);
    expect(script2.exitCount).toBe(0);
    expect(script2.downCount).toBe(0);
    expect(script2.clickCount).toBe(0);
    expect(script2.beginDragCount).toBe(0);
    expect(script2.dragCount).toBe(0);
    expect(script2.endDragCount).toBe(0);
    expect(script2.upCount).toBe(1);
    expect(script2.dropCount).toBe(1);

    expect(script3.enterCount).toBe(0);
    expect(script3.exitCount).toBe(0);
    expect(script3.downCount).toBe(0);
    expect(script3.clickCount).toBe(0);
    expect(script3.beginDragCount).toBe(0);
    expect(script3.dragCount).toBe(0);
    expect(script3.endDragCount).toBe(0);
    expect(script3.upCount).toBe(0);
    expect(script3.dropCount).toBe(0);

    target.dispatchEvent(generatePointerEvent("pointermove", 2, left + 8, top + 8));
    engine.update();

    expect(script1.enterCount).toBe(1);
    expect(script1.exitCount).toBe(0);
    expect(script1.downCount).toBe(1);
    expect(script1.clickCount).toBe(1);
    expect(script1.beginDragCount).toBe(1);
    expect(script1.dragCount).toBe(0);
    expect(script1.endDragCount).toBe(1);
    expect(script1.upCount).toBe(1);
    expect(script1.dropCount).toBe(1);

    expect(script2.enterCount).toBe(1);
    expect(script2.exitCount).toBe(0);
    expect(script2.downCount).toBe(0);
    expect(script2.clickCount).toBe(0);
    expect(script2.beginDragCount).toBe(0);
    expect(script2.dragCount).toBe(0);
    expect(script2.endDragCount).toBe(0);
    expect(script2.upCount).toBe(1);
    expect(script2.dropCount).toBe(1);

    expect(script3.enterCount).toBe(1);
    expect(script3.exitCount).toBe(0);
    expect(script3.downCount).toBe(0);
    expect(script3.clickCount).toBe(0);
    expect(script3.beginDragCount).toBe(0);
    expect(script3.dragCount).toBe(0);
    expect(script3.endDragCount).toBe(0);
    expect(script3.upCount).toBe(0);
    expect(script3.dropCount).toBe(0);

    image3.enabled = false;
    engine.update();
    expect(script1.enterCount).toBe(1);
    expect(script1.exitCount).toBe(0);
    expect(script1.downCount).toBe(1);
    expect(script1.clickCount).toBe(1);
    expect(script1.beginDragCount).toBe(1);
    expect(script1.dragCount).toBe(0);
    expect(script1.endDragCount).toBe(1);
    expect(script1.upCount).toBe(1);
    expect(script1.dropCount).toBe(1);

    expect(script2.enterCount).toBe(1);
    expect(script2.exitCount).toBe(0);
    expect(script2.downCount).toBe(0);
    expect(script2.clickCount).toBe(0);
    expect(script2.beginDragCount).toBe(0);
    expect(script2.dragCount).toBe(0);
    expect(script2.endDragCount).toBe(0);
    expect(script2.upCount).toBe(1);
    expect(script2.dropCount).toBe(1);

    expect(script3.enterCount).toBe(1);
    expect(script3.exitCount).toBe(1);
    expect(script3.downCount).toBe(0);
    expect(script3.clickCount).toBe(0);
    expect(script3.beginDragCount).toBe(0);
    expect(script3.dragCount).toBe(0);
    expect(script3.endDragCount).toBe(0);
    expect(script3.upCount).toBe(0);
    expect(script3.dropCount).toBe(0);
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
