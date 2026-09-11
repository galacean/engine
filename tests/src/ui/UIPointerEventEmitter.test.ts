import { Camera, Entity, Layer, PointerEventData, Script, Sprite, Texture2D } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Image, UICanvas, UITransform } from "@galacean/engine-ui";
import { afterAll, afterEach, describe, expect, it } from "vitest";

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

  // Destroyed in `afterEach` so that a failing assertion cannot leak canvases into the next case:
  // `_canvases` is shared state and the tie-break below depends on its content.
  const roots: Entity[] = [];

  function createRoot(name: string): Entity {
    const root = scene.createRootEntity(name);
    roots.push(root);
    return root;
  }

  function createCamera(root: Entity): Camera {
    const cameraEntity = root.createChild("Camera");
    cameraEntity.transform.position = new Vector3(0, 0, 10);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    return camera;
  }

  /**
   * A sprite texture is mandatory: `Image._render()` returns early without one and then never reaches
   * the render queue this suite compares the hit test against.
   */
  function createVisibleImage(parent: Entity, name: string, layer?: Layer): ClickRecordScript {
    const entity = parent.createChild(name);
    layer !== undefined && (entity.layer = layer);
    const image = entity.addComponent(Image);
    image.sprite = new Sprite(engine, new Texture2D(engine, 1, 1));
    (<UITransform>entity.transform).size.set(300, 300);
    return entity.addComponent(ClickRecordScript);
  }

  function createScreenSpaceCanvas(parent: Entity, name: string, camera: Camera, sortOrder: number, distance: number) {
    const entity = parent.createChild(name);
    const canvas = entity.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    canvas.camera = camera;
    canvas.distance = distance;
    canvas.sortOrder = sortOrder;
    return canvas;
  }

  function createWorldSpaceCanvas(parent: Entity, name: string, camera: Camera, sortOrder: number, z: number) {
    const entity = parent.createChild(name);
    const canvas = entity.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.WorldSpace;
    canvas.camera = camera;
    canvas.sortOrder = sortOrder;
    // The pose has to be applied after the canvas exists: adding it auto-adds `UITransform`, which
    // replaces the entity's plain `Transform` and drops any pose set before that.
    entity.transform.position = new Vector3(0, 0, z);
    return canvas;
  }

  function simulateClickAtCenter(): void {
    const { left, top, width, height } = target.getBoundingClientRect();
    const cx = left + width / 2;
    const cy = top + height / 2;
    target.dispatchEvent(generatePointerEvent("pointerdown", 1, cx, cy, 0, 1));
    engine.update();
    target.dispatchEvent(generatePointerEvent("pointerup", 1, cx, cy, 0, 0));
    engine.update();
  }

  /**
   * Paint order of the camera's transparent queue: the last entry is drawn last and is therefore the
   * visually topmost canvas. Reading the queue keeps draw order and hit order comparable without
   * re-deriving the render sort on the test side.
   */
  function getPaintOrder(camera: Camera): string[] {
    // @ts-ignore
    const transparentQueue = camera._renderPipeline._cullingResults.transparentQueue;
    return transparentQueue.batchedElements.map((element) => element.component.entity.name);
  }

  afterEach(() => {
    for (let i = 0; i < roots.length; i++) {
      roots[i].destroy();
    }
    roots.length = 0;
    engine.update();
  });

  afterAll(() => {
    engine.destroy();
    canvasDOM.remove();
  });

  it("1. Single canvas raycast hits element", () => {
    const root = createRoot("test1_root");
    const camera = createCamera(root);
    const canvas = createScreenSpaceCanvas(root, "Canvas", camera, 0, 10);
    const script = createVisibleImage(canvas.entity, "Image");

    engine.update();
    expect(getPaintOrder(camera)).toEqual(["Image"]);

    simulateClickAtCenter();

    expect(script.downCount).toBe(1);
    expect(script.clickCount).toBe(1);
  });

  it("2. Higher sortOrder is painted last and hit first", () => {
    const root = createRoot("test2_root");
    const camera = createCamera(root);

    const bottomCanvas = createScreenSpaceCanvas(root, "BottomCanvas", camera, 0, 10);
    const bottomScript = createVisibleImage(bottomCanvas.entity, "BottomImage");

    const topCanvas = createScreenSpaceCanvas(root, "TopCanvas", camera, 10, 10);
    const topScript = createVisibleImage(topCanvas.entity, "TopImage");

    engine.update();
    expect(getPaintOrder(camera)).toEqual(["BottomImage", "TopImage"]);

    simulateClickAtCenter();

    expect(topScript.downCount).toBe(1);
    expect(topScript.clickCount).toBe(1);
    expect(bottomScript.downCount).toBe(0);
    expect(bottomScript.clickCount).toBe(0);
  });

  it("3. Same sortOrder: the nearer WorldSpace canvas is painted last and hit first", () => {
    const root = createRoot("test3_root");
    const camera = createCamera(root);

    // Far canvas at z = 0, near canvas at z = 5 (the camera sits at z = 10)
    const farCanvas = createWorldSpaceCanvas(root, "FarCanvas", camera, 0, 0);
    const farScript = createVisibleImage(farCanvas.entity, "FarImage");

    const nearCanvas = createWorldSpaceCanvas(root, "NearCanvas", camera, 0, 5);
    const nearScript = createVisibleImage(nearCanvas.entity, "NearImage");

    engine.update();
    expect(getPaintOrder(camera)).toEqual(["FarImage", "NearImage"]);

    simulateClickAtCenter();

    expect(nearScript.downCount).toBe(1);
    expect(nearScript.clickCount).toBe(1);
    expect(farScript.downCount).toBe(0);
    expect(farScript.clickCount).toBe(0);
  });

  it("4. Same sortOrder and same distance: the click follows the canvas painted last", () => {
    const root = createRoot("test4_root");
    const camera = createCamera(root);

    const firstCanvas = createScreenSpaceCanvas(root, "FirstCanvas", camera, 0, 10);
    const firstScript = createVisibleImage(firstCanvas.entity, "FirstImage");

    const secondCanvas = createScreenSpaceCanvas(root, "SecondCanvas", camera, 0, 10);
    const secondScript = createVisibleImage(secondCanvas.entity, "SecondImage");

    engine.update();

    // Both canvases are fully tied on every render sort key, so only the submission order decides
    // which of them is drawn last: the shared canvas array is submitted back to front, which leaves
    // the canvas created first on top. The hit test has to agree with that order instead of assuming
    // that the canvas created later ends up on top.
    const paintOrder = getPaintOrder(camera);
    expect(paintOrder).toEqual(["SecondImage", "FirstImage"]);
    const topMostName = paintOrder[paintOrder.length - 1];

    simulateClickAtCenter();

    const hitScript = topMostName === "FirstImage" ? firstScript : secondScript;
    const coveredScript = hitScript === firstScript ? secondScript : firstScript;
    expect(hitScript.downCount).toBe(1);
    expect(hitScript.clickCount).toBe(1);
    expect(coveredScript.downCount).toBe(0);
    expect(coveredScript.clickCount).toBe(0);
  });

  it("5. Same sortOrder: the nearer ScreenSpaceCamera canvas is painted last and hit first", () => {
    const root = createRoot("test5_root");
    const camera = createCamera(root);

    const farCanvas = createScreenSpaceCanvas(root, "FarCanvas", camera, 0, 20);
    const farScript = createVisibleImage(farCanvas.entity, "FarImage");

    const nearCanvas = createScreenSpaceCanvas(root, "NearCanvas", camera, 0, 5);
    const nearScript = createVisibleImage(nearCanvas.entity, "NearImage");

    engine.update();
    expect(getPaintOrder(camera)).toEqual(["FarImage", "NearImage"]);

    simulateClickAtCenter();

    expect(nearScript.downCount).toBe(1);
    expect(nearScript.clickCount).toBe(1);
    expect(farScript.downCount).toBe(0);
    expect(farScript.clickCount).toBe(0);
  });

  it("6. Disabling the upper canvas restores the lower canvas", () => {
    const root = createRoot("test6_root");
    const camera = createCamera(root);

    const bottomCanvas = createScreenSpaceCanvas(root, "BottomCanvas", camera, 0, 10);
    const bottomScript = createVisibleImage(bottomCanvas.entity, "BottomImage");

    const topCanvas = createScreenSpaceCanvas(root, "TopCanvas", camera, 10, 10);
    const topScript = createVisibleImage(topCanvas.entity, "TopImage");

    engine.update();
    simulateClickAtCenter();
    expect(topScript.downCount).toBe(1);
    expect(bottomScript.downCount).toBe(0);

    topScript.reset();
    bottomScript.reset();
    topCanvas.entity.isActive = false;
    engine.update();
    expect(getPaintOrder(camera)).toEqual(["BottomImage"]);

    simulateClickAtCenter();
    expect(topScript.downCount).toBe(0);
    expect(bottomScript.downCount).toBe(1);
    expect(bottomScript.clickCount).toBe(1);
  });

  it("7. A canvas culled by camera.cullingMask is neither painted nor hit", () => {
    const root = createRoot("test7_root");
    const camera = createCamera(root);

    const bottomCanvas = createScreenSpaceCanvas(root, "BottomCanvas", camera, 0, 10);
    const bottomScript = createVisibleImage(bottomCanvas.entity, "BottomImage");

    // Higher sortOrder, but its layer is excluded from the camera: it must not swallow the click
    const culledCanvas = createScreenSpaceCanvas(root, "CulledCanvas", camera, 10, 10);
    culledCanvas.entity.layer = Layer.Layer1;
    const culledScript = createVisibleImage(culledCanvas.entity, "CulledImage");

    camera.cullingMask = Layer.Layer0;
    engine.update();
    expect(getPaintOrder(camera)).toEqual(["BottomImage"]);

    simulateClickAtCenter();

    expect(culledScript.downCount).toBe(0);
    expect(culledScript.clickCount).toBe(0);
    expect(bottomScript.downCount).toBe(1);
    expect(bottomScript.clickCount).toBe(1);
  });

  it("8. A renderer culled by camera.cullingMask is neither painted nor hit", () => {
    const root = createRoot("test8_root");
    const camera = createCamera(root);
    const canvas = createScreenSpaceCanvas(root, "Canvas", camera, 0, 10);

    // The visible image is created first so that the culled one is scanned first by the raycast
    const visibleScript = createVisibleImage(canvas.entity, "VisibleImage");
    const culledScript = createVisibleImage(canvas.entity, "CulledImage", Layer.Layer1);

    camera.cullingMask = Layer.Layer0;
    engine.update();
    expect(getPaintOrder(camera)).toEqual(["VisibleImage"]);

    simulateClickAtCenter();

    expect(culledScript.downCount).toBe(0);
    expect(culledScript.clickCount).toBe(0);
    expect(visibleScript.downCount).toBe(1);
    expect(visibleScript.clickCount).toBe(1);
  });
});
