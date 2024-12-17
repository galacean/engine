import { Camera } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { UICanvas, UIGroup } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

describe("UIGroup", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const webCanvas = engine.canvas;
  webCanvas.width = 750;
  webCanvas.height = 1334;
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  // Create camera
  const cameraEntity = root.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.farClipPlane = 200;
  camera.nearClipPlane = 0.3;
  camera.isOrthographic = true;

  // 添加 canvas
  const canvasEntity = root.createChild("canvas");
  const group = canvasEntity.addComponent(UIGroup);

  it("Set and Get", () => {
    // Ignore Parent Group
    group.ignoreParentGroup = true;
    expect(group.ignoreParentGroup).to.eq(true);
    group.ignoreParentGroup = false;
    expect(group.ignoreParentGroup).to.eq(false);

    // Alpha
    group.alpha = 0.5;
    expect(group.alpha).to.eq(0.5);
    group.alpha = -0.5;
    expect(group.alpha).to.eq(0);
    group.alpha = 1.5;
    expect(group.alpha).to.eq(1);

    // Interactive
    group.interactive = false;
    expect(group.interactive).to.eq(false);
    group.interactive = true;
    expect(group.interactive).to.eq(true);
  });

  it("Get Global", () => {
    const rootGroup = root.addComponent(UIGroup);
    // Alpha
    rootGroup.alpha = 0.5;
    group.alpha = 0.4;
    expect(group.globalAlpha).to.eq(0.4);
    root.addComponent(UICanvas);
    expect(group.globalAlpha).to.eq(0.2);
    rootGroup.enabled = false;
    expect(group.globalAlpha).to.eq(0.4);
    rootGroup.enabled = true;
    expect(group.globalAlpha).to.eq(0.2);
    group.ignoreParentGroup = true;
    expect(group.globalAlpha).to.eq(0.4);

    // Interactive
    rootGroup.interactive = false;
    expect(group.globalInteractive).to.eq(true);
    group.ignoreParentGroup = false;
    expect(group.globalInteractive).to.eq(false);
  });
});
