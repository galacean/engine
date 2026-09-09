import { Camera, PointerEventData, Script } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Image, UICanvas, UITransform } from "@galacean/engine-ui";
import { afterAll, describe, expect, it } from "vitest";

class ClickRecordScript extends Script {
  downCount = 0;
  clickCount = 0;

  onPointerDown(eventData: PointerEventData): void {
    this.downCount++;
  }

  onPointerClick(eventData: PointerEventData): void {
    this.clickCount++;
  }

  reset(): void {
    this.downCount = 0;
    this.clickCount = 0;
  }
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

describe("UIPointerEventEmitter Multi-Canvas Raycast", async () => {
  const body = document.getElementsByTagName("body")[0];
  const canvasDOM = document.createElement("canvas");
  canvasDOM.style.width = "300px";
  canvasDOM.style.height = "300px";
  body.appendChild(canvasDOM);

  const engine = await WebGLEngine.create({ canvas: canvasDOM });
  const webCanvas = engine.canvas;
  webCanvas.setResolution(300, 300);
  const scene = engine.sceneManager.scenes[0];
  const inputManager = engine.inputManager;

  // @ts-ignore
  const pointerManager = inputManager._pointerManager;
  const target = pointerManager._target;

  function simulateClickAtCenter() {
    const { left, top, width, height } = target.getBoundingClientRect();
    const cx = left + width / 2;
    const cy = top + height / 2;
    target.dispatchEvent(generatePointerEvent("pointerdown", 1, cx, cy, 0, 1));
    engine.update();
    target.dispatchEvent(generatePointerEvent("pointerup", 1, cx, cy, 0, 0));
    engine.update();
  }

  afterAll(() => {
    engine.destroy();
    canvasDOM.remove();
  });

  it("1. Single canvas raycast hits element", () => {
    const root = scene.createRootEntity("test1_root");
    const cameraEntity = root.createChild("Camera");
    cameraEntity.transform.position = new Vector3(0, 0, 10);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;

    const canvasEntity = root.createChild("Canvas");
    const uiCanvas = canvasEntity.addComponent(UICanvas);
    uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    uiCanvas.renderCamera = camera;
    uiCanvas.distance = 10;
    uiCanvas.sortOrder = 0;

    const imageEntity = canvasEntity.createChild("Image");
    imageEntity.addComponent(Image);
    (<UITransform>imageEntity.transform).size.set(300, 300);
    const script = imageEntity.addComponent(ClickRecordScript);

    engine.update();
    simulateClickAtCenter();

    expect(script.downCount).toBe(1);
    expect(script.clickCount).toBe(1);

    root.destroy();
    engine.update();
  });

  it("2. High and low sortOrder overlap: higher sortOrder takes precedence", () => {
    const root = scene.createRootEntity("test2_root");
    const cameraEntity = root.createChild("Camera");
    cameraEntity.transform.position = new Vector3(0, 0, 10);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;

    // Bottom canvas: sortOrder = 0
    const bottomCanvasEntity = root.createChild("BottomCanvas");
    const bottomCanvas = bottomCanvasEntity.addComponent(UICanvas);
    bottomCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    bottomCanvas.renderCamera = camera;
    bottomCanvas.distance = 10;
    bottomCanvas.sortOrder = 0;

    const bottomImage = bottomCanvasEntity.createChild("BottomImage");
    bottomImage.addComponent(Image);
    (<UITransform>bottomImage.transform).size.set(300, 300);
    const bottomScript = bottomImage.addComponent(ClickRecordScript);

    // Top canvas: sortOrder = 10
    const topCanvasEntity = root.createChild("TopCanvas");
    const topCanvas = topCanvasEntity.addComponent(UICanvas);
    topCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    topCanvas.renderCamera = camera;
    topCanvas.distance = 10;
    topCanvas.sortOrder = 10;

    const topImage = topCanvasEntity.createChild("TopImage");
    topImage.addComponent(Image);
    (<UITransform>topImage.transform).size.set(300, 300);
    const topScript = topImage.addComponent(ClickRecordScript);

    engine.update();
    simulateClickAtCenter();

    // Top canvas (sortOrder=10) MUST receive the click; bottom must NOT
    expect(topScript.downCount).toBe(1);
    expect(topScript.clickCount).toBe(1);
    expect(bottomScript.downCount).toBe(0);
    expect(bottomScript.clickCount).toBe(0);

    root.destroy();
    engine.update();
  });

  it("3. Same sortOrder different distance: closer canvas takes precedence", () => {
    const root = scene.createRootEntity("test3_root");
    const cameraEntity = root.createChild("Camera");
    cameraEntity.transform.position = new Vector3(0, 0, 10);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;

    // Far canvas: WorldSpace at z = 0, sortOrder = 0
    const farCanvasEntity = root.createChild("FarCanvas");
    farCanvasEntity.transform.position = new Vector3(0, 0, 0);
    const farCanvas = farCanvasEntity.addComponent(UICanvas);
    farCanvas.renderMode = CanvasRenderMode.WorldSpace;
    farCanvas.renderCamera = camera;
    farCanvas.sortOrder = 0;

    const farImage = farCanvasEntity.createChild("FarImage");
    farImage.addComponent(Image);
    (<UITransform>farImage.transform).size.set(300, 300);
    const farScript = farImage.addComponent(ClickRecordScript);

    // Near canvas: WorldSpace at z = 5 (closer to camera at z=10), sortOrder = 0
    const nearCanvasEntity = root.createChild("NearCanvas");
    nearCanvasEntity.transform.position = new Vector3(0, 0, 5);
    const nearCanvas = nearCanvasEntity.addComponent(UICanvas);
    nearCanvas.renderMode = CanvasRenderMode.WorldSpace;
    nearCanvas.renderCamera = camera;
    nearCanvas.sortOrder = 0;

    const nearImage = nearCanvasEntity.createChild("NearImage");
    nearImage.addComponent(Image);
    (<UITransform>nearImage.transform).size.set(300, 300);
    const nearScript = nearImage.addComponent(ClickRecordScript);

    engine.update();
    simulateClickAtCenter();

    // Near canvas (closer to camera) MUST receive the click; far must NOT
    expect(nearScript.downCount).toBe(1);
    expect(nearScript.clickCount).toBe(1);
    expect(farScript.downCount).toBe(0);
    expect(farScript.clickCount).toBe(0);

    root.destroy();
    engine.update();
  });

  it("4. Same sortOrder same distance: later-created (top-painted) canvas takes precedence", () => {
    const root = scene.createRootEntity("test4_root");
    const cameraEntity = root.createChild("Camera");
    cameraEntity.transform.position = new Vector3(0, 0, 10);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;

    // Canvas 1: created first
    const canvasEntity1 = root.createChild("Canvas1");
    const canvas1 = canvasEntity1.addComponent(UICanvas);
    canvas1.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    canvas1.renderCamera = camera;
    canvas1.distance = 10;
    canvas1.sortOrder = 0;

    const image1 = canvasEntity1.createChild("Image1");
    image1.addComponent(Image);
    (<UITransform>image1.transform).size.set(300, 300);
    const script1 = image1.addComponent(ClickRecordScript);

    // Canvas 2: created second
    const canvasEntity2 = root.createChild("Canvas2");
    const canvas2 = canvasEntity2.addComponent(UICanvas);
    canvas2.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    canvas2.renderCamera = camera;
    canvas2.distance = 10;
    canvas2.sortOrder = 0;

    const image2 = canvasEntity2.createChild("Image2");
    image2.addComponent(Image);
    (<UITransform>image2.transform).size.set(300, 300);
    const script2 = image2.addComponent(ClickRecordScript);

    engine.update();
    simulateClickAtCenter();

    // Canvas 2 (later added/rendered) takes precedence
    expect(script2.downCount).toBe(1);
    expect(script2.clickCount).toBe(1);
    expect(script1.downCount).toBe(0);
    expect(script1.clickCount).toBe(0);

    root.destroy();
    engine.update();
  });

  it("5. Close top layer recovers bottom layer interaction", () => {
    const root = scene.createRootEntity("test5_root");
    const cameraEntity = root.createChild("Camera");
    cameraEntity.transform.position = new Vector3(0, 0, 10);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;

    // Bottom canvas
    const bottomCanvasEntity = root.createChild("BottomCanvas");
    const bottomCanvas = bottomCanvasEntity.addComponent(UICanvas);
    bottomCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    bottomCanvas.renderCamera = camera;
    bottomCanvas.distance = 10;
    bottomCanvas.sortOrder = 0;

    const bottomImage = bottomCanvasEntity.createChild("BottomImage");
    bottomImage.addComponent(Image);
    (<UITransform>bottomImage.transform).size.set(300, 300);
    const bottomScript = bottomImage.addComponent(ClickRecordScript);

    // Top canvas (e.g. Popup)
    const topCanvasEntity = root.createChild("TopCanvas");
    const topCanvas = topCanvasEntity.addComponent(UICanvas);
    topCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    topCanvas.renderCamera = camera;
    topCanvas.distance = 10;
    topCanvas.sortOrder = 10;

    const topImage = topCanvasEntity.createChild("TopImage");
    topImage.addComponent(Image);
    (<UITransform>topImage.transform).size.set(300, 300);
    const topScript = topImage.addComponent(ClickRecordScript);

    // Step 1: Click when top canvas is active
    engine.update();
    simulateClickAtCenter();
    expect(topScript.downCount).toBe(1);
    expect(bottomScript.downCount).toBe(0);

    // Step 2: Disable / close top canvas
    topScript.reset();
    bottomScript.reset();
    topCanvasEntity.isActive = false;
    engine.update();

    // Step 3: Click again -> now bottom canvas MUST receive the click!
    simulateClickAtCenter();
    expect(topScript.downCount).toBe(0);
    expect(bottomScript.downCount).toBe(1);
    expect(bottomScript.clickCount).toBe(1);

    root.destroy();
    engine.update();
  });
});
