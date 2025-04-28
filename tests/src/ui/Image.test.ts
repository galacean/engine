import { Sprite, SpriteDrawMode, SpriteTileMode, Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Image } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

describe("Image", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const webCanvas = engine.canvas;
  webCanvas.width = 750;
  webCanvas.height = 1334;
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  const canvasEntity = root.createChild("canvas");
  const image = canvasEntity.addComponent(Image);

  it("Set and Get", () => {
    // Sprite
    const texture = new Texture2D(engine, 100, 100);
    const sprite = new Sprite(engine, texture);
    image.sprite = sprite;
    expect(image.sprite).to.eq(sprite);
    image.sprite = sprite;
    expect(image.sprite).to.eq(sprite);
    image.sprite = null;
    expect(image.sprite).to.eq(null);

    // Draw Mode
    image.drawMode = SpriteDrawMode.Simple;
    expect(image.drawMode).to.eq(SpriteDrawMode.Simple);
    image.drawMode = SpriteDrawMode.Sliced;
    expect(image.drawMode).to.eq(SpriteDrawMode.Sliced);
    image.drawMode = SpriteDrawMode.Tiled;
    expect(image.drawMode).to.eq(SpriteDrawMode.Tiled);

    // Tile Mode
    image.tileMode = SpriteTileMode.Adaptive;
    expect(image.tileMode).to.eq(SpriteTileMode.Adaptive);
    image.tileMode = SpriteTileMode.Continuous;
    expect(image.tileMode).to.eq(SpriteTileMode.Continuous);

    // Tiled Adaptive Threshold
    image.tiledAdaptiveThreshold = 0.5;
    expect(image.tiledAdaptiveThreshold).to.eq(0.5);
    image.tiledAdaptiveThreshold = -0.5;
    expect(image.tiledAdaptiveThreshold).to.eq(0);
    image.tiledAdaptiveThreshold = 1.5;
    expect(image.tiledAdaptiveThreshold).to.eq(1);
  });

  it("Clone", () => {
    const imageEntity = canvasEntity.createChild("Image");
    const image = imageEntity.addComponent(Image);
    const sprite = new Sprite(engine, new Texture2D(engine, 100, 100));
    image.sprite = sprite;
    image.drawMode = SpriteDrawMode.Sliced;

    const cloneEntity = imageEntity.clone();
    const cloneImage = cloneEntity.getComponent(Image);

    expect(cloneImage.sprite).to.eq(sprite);
    expect(cloneImage.drawMode).to.eq(SpriteDrawMode.Sliced);
  });
});
