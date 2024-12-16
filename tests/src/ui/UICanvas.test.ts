import { Camera } from "@galacean/engine-core";
import { Vector2 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { CanvasRenderMode, ResolutionAdaptationStrategy, UICanvas, UITransform } from "@galacean/engine-ui";
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
    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.WidthAdaptation;
    expect(rootCanvas.resolutionAdaptationStrategy).to.eq(ResolutionAdaptationStrategy.WidthAdaptation);
    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.HeightAdaptation;
    expect(rootCanvas.resolutionAdaptationStrategy).to.eq(ResolutionAdaptationStrategy.HeightAdaptation);
    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.BothAdaptation;
    expect(rootCanvas.resolutionAdaptationStrategy).to.eq(ResolutionAdaptationStrategy.BothAdaptation);
    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.ShrinkAdaptation;
    expect(rootCanvas.resolutionAdaptationStrategy).to.eq(ResolutionAdaptationStrategy.ShrinkAdaptation);
    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.ExpandAdaptation;
    expect(rootCanvas.resolutionAdaptationStrategy).to.eq(ResolutionAdaptationStrategy.ExpandAdaptation);

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
    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.WidthAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(811);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(811);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(811);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.HeightAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(1924);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(1924);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(1924);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.BothAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(811);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(1924);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(1367);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.ExpandAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(811);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(811);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(811);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.ShrinkAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(1924);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(1924);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(1924);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    rootCanvas.distance = 100;
    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.WidthAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(8114);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(8114);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(8114);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.HeightAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(19245);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(19245);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(19245);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.BothAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(8114);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(19245);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(13679);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.ExpandAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(8114);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(8114);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(8114);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.ShrinkAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(19245);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(19245);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(19245);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    camera.fieldOfView = 90;
    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.WidthAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(14055);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(14055);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(14055);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.HeightAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(33333);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(33333);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(33333);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    camera.isOrthographic = true;
    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.WidthAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(1405);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(1405);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(1405);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(1422);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.HeightAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(3333);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(3333);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(3333);
    expect(Math.floor(canvasSize.x)).to.eq(337);
    expect(Math.floor(canvasSize.y)).to.eq(600);

    camera.viewport.set(0, 0, 0.5, 1);
    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.WidthAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(702);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(702);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(702);
    expect(Math.floor(canvasSize.x)).to.eq(800);
    expect(Math.floor(canvasSize.y)).to.eq(2845);

    rootCanvas.resolutionAdaptationStrategy = ResolutionAdaptationStrategy.HeightAdaptation;
    expect(Math.floor(canvasScale.x * 100000)).to.eq(3333);
    expect(Math.floor(canvasScale.y * 100000)).to.eq(3333);
    expect(Math.floor(canvasScale.z * 100000)).to.eq(3333);
    expect(Math.floor(canvasSize.x)).to.eq(168);
    expect(Math.floor(canvasSize.y)).to.eq(600);
  });
});
