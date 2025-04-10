import { Camera } from "@galacean/engine-core";
import { Vector2 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { CanvasRenderMode, ResolutionAdaptationMode, UICanvas, UITransform } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

describe("UICanvas", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const webCanvas = engine.canvas;
  webCanvas.width = 750;
  webCanvas.height = 1334;
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  const canvasEntity = root.createChild("canvas");
  const rootCanvas = canvasEntity.addComponent(UICanvas);

  const cameraEntity = root.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);

  it("Set and Get", () => {
    // Render Mode
    rootCanvas.renderMode = CanvasRenderMode.WorldSpace;
    expect(rootCanvas.renderMode).to.eq(CanvasRenderMode.WorldSpace);
    rootCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    expect(rootCanvas.renderMode).to.eq(CanvasRenderMode.ScreenSpaceCamera);
    rootCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    expect(rootCanvas.renderMode).to.eq(CanvasRenderMode.ScreenSpaceOverlay);

    // Reference Resolution
    const vec2 = new Vector2(750, 1334);
    rootCanvas.referenceResolution = vec2;
    expect(rootCanvas.referenceResolution).to.deep.include({ x: 750, y: 1334 });
    vec2.set(800, 600);
    expect(rootCanvas.referenceResolution).to.deep.include({ x: 750, y: 1334 });
    rootCanvas.referenceResolution = vec2;
    expect(rootCanvas.referenceResolution).to.deep.include({ x: 800, y: 600 });

    // Render Camera
    expect(!!rootCanvas.renderCamera).to.eq(false);
    rootCanvas.renderCamera = camera;
    expect(rootCanvas.renderCamera).to.eq(camera);

    // Resolution Adaptation Strategy
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.WidthAdaptation;
    expect(rootCanvas.resolutionAdaptationMode).to.eq(ResolutionAdaptationMode.WidthAdaptation);
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.HeightAdaptation;
    expect(rootCanvas.resolutionAdaptationMode).to.eq(ResolutionAdaptationMode.HeightAdaptation);
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.BothAdaptation;
    expect(rootCanvas.resolutionAdaptationMode).to.eq(ResolutionAdaptationMode.BothAdaptation);
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.ShrinkAdaptation;
    expect(rootCanvas.resolutionAdaptationMode).to.eq(ResolutionAdaptationMode.ShrinkAdaptation);
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.ExpandAdaptation;
    expect(rootCanvas.resolutionAdaptationMode).to.eq(ResolutionAdaptationMode.ExpandAdaptation);

    // Sort Order
    rootCanvas.sortOrder = 0;
    expect(rootCanvas.sortOrder).to.eq(0);
    rootCanvas.sortOrder = 10;
    expect(rootCanvas.sortOrder).to.eq(10);

    // The vertical distance between the canvas and the camera
    rootCanvas.distance = 100;
    expect(rootCanvas.distance).to.eq(100);
    rootCanvas.distance = 50;
    expect(rootCanvas.distance).to.eq(50);
  });

  // Is Root Canvas
  it("Is root canvas", () => {
    // @ts-ignore
    expect(rootCanvas._isRootCanvas).to.eq(true);
    const child = canvasEntity.createChild("childCanvas");
    const childCanvas = child.addComponent(UICanvas);
    // @ts-ignore
    expect(childCanvas._isRootCanvas).to.eq(false);
    rootCanvas.enabled = false;
    // @ts-ignore
    expect(childCanvas._isRootCanvas).to.eq(true);
    rootCanvas.enabled = true;
    // @ts-ignore
    expect(childCanvas._isRootCanvas).to.eq(false);
    const parentCanvas = root.addComponent(UICanvas);
    // @ts-ignore
    expect(parentCanvas._isRootCanvas).to.eq(true);
    // @ts-ignore
    expect(rootCanvas._isRootCanvas).to.eq(false);
    // @ts-ignore
    expect(childCanvas._isRootCanvas).to.eq(false);

    parentCanvas.destroy();
    childCanvas.destroy();
    // @ts-ignore
    expect(rootCanvas._isRootCanvas).to.eq(true);
  });

  // Pose
  it("Pose Fit", () => {
    const canvasTransform = <UITransform>canvasEntity.transform;
    const canvasPosition = canvasTransform.position;
    rootCanvas.referenceResolution = new Vector2(800, 600);
    rootCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    rootCanvas.distance = 10;
    canvasPosition.set(0, 0, 0);
    expect(canvasPosition.x).to.eq(0);
    expect(canvasPosition.y).to.eq(0);
    expect(canvasPosition.z).to.eq(0);

    // Same entity
    const cameraSame = canvasEntity.addComponent(Camera);
    rootCanvas.renderCamera = cameraSame;
    expect(canvasPosition.x).to.eq(0);
    expect(canvasPosition.y).to.eq(0);
    expect(canvasPosition.z).to.eq(0);
    rootCanvas.distance = 100;
    expect(canvasPosition.x).to.eq(0);
    expect(canvasPosition.y).to.eq(0);
    expect(canvasPosition.z).to.eq(0);

    // Not same entity or child entity
    rootCanvas.renderCamera = camera;
    expect(canvasPosition.x).to.eq(0);
    expect(canvasPosition.y).to.eq(0);
    expect(canvasPosition.z).to.eq(-100);
    rootCanvas.distance = 10;
    expect(canvasPosition.x).to.eq(0);
    expect(canvasPosition.y).to.eq(0);
    expect(canvasPosition.z).to.eq(-10);

    // Child entity
    const cameraEntityChild = canvasEntity.createChild("cameraChild");
    const cameraChild = cameraEntityChild.addComponent(Camera);
    cameraEntityChild.transform.setPosition(2, 2, 2);
    rootCanvas.renderCamera = cameraChild;
    expect(canvasPosition.x).to.eq(0);
    expect(canvasPosition.y).to.eq(0);
    expect(canvasPosition.z).to.eq(-10);
  });

  // Size
  it("Size Fit", () => {
    rootCanvas.referenceResolution = new Vector2(800, 600);
    rootCanvas.renderCamera = camera;
    rootCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    rootCanvas.distance = 10;
    const canvasTransform = <UITransform>canvasEntity.transform;
    const canvasScale = canvasTransform.scale;
    const canvasSize = canvasTransform.size;

    camera.fieldOfView = 60;
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.WidthAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(811);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(811);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(811);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.HeightAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(1924);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(1924);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(1924);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.BothAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(811);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(1924);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(1367);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.ExpandAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(811);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(811);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(811);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.ShrinkAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(1924);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(1924);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(1924);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    rootCanvas.distance = 100;
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.WidthAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(8114);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(8114);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(8114);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.HeightAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(19245);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(19245);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(19245);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.BothAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(8114);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(19245);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(13679);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.ExpandAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(8114);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(8114);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(8114);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.ShrinkAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(19245);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(19245);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(19245);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    camera.fieldOfView = 90;
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.WidthAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(14055);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(14055);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(14055);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.HeightAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(33333);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(33333);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(33333);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    camera.isOrthographic = true;
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.WidthAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(1405);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(1405);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(1405);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.HeightAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(3333);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(3333);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(3333);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    camera.viewport.set(0, 0, 0.5, 1);
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.WidthAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(702);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(702);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(702);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(2845);

    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.HeightAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(3333);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(3333);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(3333);
    expect(Math.floor(canvasSize.x)).to.eq(168);
    expect(Math.floor(canvasSize.y)).to.eq(600);
  });

  it("Clone", () => {
    rootCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    rootCanvas.renderCamera = camera;
    rootCanvas.distance = 10;
    rootCanvas.referenceResolution = new Vector2(800, 600);
    rootCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.WidthAdaptation;
    rootCanvas.referenceResolutionPerUnit = 100;
    rootCanvas.sortOrder = 10;
    const cloneEntity = canvasEntity.clone();
    const cloneCanvas = cloneEntity.getComponent(UICanvas);
    console.log(cloneCanvas.entity.parent);

    expect(cloneCanvas.renderMode).to.eq(CanvasRenderMode.ScreenSpaceCamera);
    expect(cloneCanvas.renderCamera).to.eq(camera);
    expect(cloneCanvas.distance).to.eq(10);
    expect(cloneCanvas.referenceResolution).to.deep.include({ x: 800, y: 600 });
    expect(cloneCanvas.resolutionAdaptationMode).to.eq(ResolutionAdaptationMode.WidthAdaptation);
    expect(cloneCanvas.referenceResolutionPerUnit).to.eq(100);
    expect(cloneCanvas.sortOrder).to.eq(10);
    // @ts-ignore
    expect(cloneCanvas._isRootCanvas).to.eq(false);
    root.addChild(cloneEntity);
    // @ts-ignore
    expect(cloneCanvas._isRootCanvas).to.eq(true);
  });
});
