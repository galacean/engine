import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { CanvasRenderMode, RectMask2D, UICanvas, UITransform } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

describe("RectMask2D", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  const webCanvas = engine.canvas;
  webCanvas.setResolution(300, 300);
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  const canvasEntity = root.createChild("canvas");
  const rootCanvas = canvasEntity.addComponent(UICanvas);
  rootCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  rootCanvas.referenceResolutionPerUnit = 1;
  rootCanvas.referenceResolution.set(300, 300);

  it("should return false when mask size is zero", () => {
    const maskEntity = canvasEntity.createChild("mask-zero");
    const rectMask = maskEntity.addComponent(RectMask2D);
    const transform = maskEntity.transform as UITransform;
    transform.size.set(0, 100);
    const worldRect = new Vector4();

    expect(rectMask._getWorldRect(worldRect)).to.eq(false);
  });

  it("should clamp negative softness values", () => {
    const rectMask = canvasEntity.createChild("mask-softness").addComponent(RectMask2D);

    rectMask.softness.set(-4, 6);
    expect(rectMask.softness.x).to.eq(0);
    expect(rectMask.softness.y).to.eq(6);

    rectMask.softness = new Vector2(5, -3);
    expect(rectMask.softness.x).to.eq(5);
    expect(rectMask.softness.y).to.eq(0);
  });

  it("should toggle alphaClip", () => {
    const rectMask = canvasEntity.createChild("mask-alphaclip").addComponent(RectMask2D);
    expect(rectMask.alphaClip).to.eq(false);
    rectMask.alphaClip = true;
    expect(rectMask.alphaClip).to.eq(true);
  });

  it("should compute world rect when size and pivot set", () => {
    const maskEntity = canvasEntity.createChild("mask-rect");
    const transform = maskEntity.transform as UITransform;
    transform.pivot.set(0.5, 0.5);
    transform.size.set(100, 80);
    transform.setPosition(0, 0, 0);
    const rectMask = maskEntity.addComponent(RectMask2D);
    const worldRect = new Vector4();
    expect(rectMask._getWorldRect(worldRect)).to.eq(true);
    // The canvas applies adaptation; just verify width/height match
    expect(worldRect.z - worldRect.x).to.be.closeTo(100, 1);
    expect(worldRect.w - worldRect.y).to.be.closeTo(80, 1);
  });

  it("should test contains world point", () => {
    const maskEntity = canvasEntity.createChild("mask-contains");
    const transform = maskEntity.transform as UITransform;
    transform.pivot.set(0.5, 0.5);
    transform.size.set(100, 100);
    transform.setPosition(0, 0, 0);
    const rectMask = maskEntity.addComponent(RectMask2D);

    const rect = new Vector4();
    rectMask._getWorldRect(rect);
    const cx = (rect.x + rect.z) * 0.5;
    const cy = (rect.y + rect.w) * 0.5;
    expect(rectMask._containsWorldPoint(new Vector3(cx, cy, 0))).to.eq(true);
    expect(rectMask._containsWorldPoint(new Vector3(rect.x - 5, rect.y - 5, 0))).to.eq(false);
  });
});
