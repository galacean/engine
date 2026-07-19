import { Sprite, SpriteMaskInteraction, SpriteMaskLayer, Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { CanvasRenderMode, Image, Mask, UICanvas, UITransform } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

describe("Mask", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  const webCanvas = engine.canvas;
  webCanvas.setResolution(300, 300);
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  const canvasEntity = root.createChild("canvas");
  const rootCanvas = canvasEntity.addComponent(UICanvas);
  rootCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  rootCanvas.referenceResolutionPerUnit = 50;
  rootCanvas.referenceResolution.set(300, 300);

  const imageEntity = canvasEntity.createChild("image");
  const image = imageEntity.addComponent(Image);
  (<UITransform>imageEntity.transform).size.set(300, 300);

  const maskEntity = canvasEntity.createChild("mask");
  const mask = maskEntity.addComponent(Mask);
  (<UITransform>maskEntity.transform).size.set(100, 100);
  mask.sprite = createSolidSprite(engine);

  it("Set and Get sprite", () => {
    const texture = new Texture2D(engine, 1, 1);
    const sprite = new Sprite(engine, texture);
    mask.sprite = sprite;
    expect(mask.sprite).to.eq(sprite);

    mask.sprite = null;
    expect(mask.sprite).to.eq(null);

    mask.sprite = createSolidSprite(engine);
    expect(mask.sprite).not.to.eq(null);
  });

  it("Set and Get alphaCutoff", () => {
    expect(mask.alphaCutoff).to.eq(0.5);
    mask.alphaCutoff = 0.2;
    expect(mask.alphaCutoff).to.eq(0.2);
  });

  it("Set and Get influenceLayers", () => {
    expect(mask.influenceLayers).to.eq(SpriteMaskLayer.Everything);
    mask.influenceLayers = SpriteMaskLayer.Layer1;
    expect(mask.influenceLayers).to.eq(SpriteMaskLayer.Layer1);
    mask.influenceLayers = SpriteMaskLayer.Everything;
  });

  it("Set and Get flipX/flipY", () => {
    mask.flipX = true;
    expect(mask.flipX).to.eq(true);
    mask.flipY = true;
    expect(mask.flipY).to.eq(true);
    mask.flipX = false;
    mask.flipY = false;
  });

  it("UI image maskInteraction default is None", () => {
    expect(image.maskInteraction).to.eq(SpriteMaskInteraction.None);
    image.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    expect(image.maskInteraction).to.eq(SpriteMaskInteraction.VisibleInsideMask);
  });
});

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}
