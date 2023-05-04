import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Sprite, Texture2D } from "@galacean/engine-core";
import { Rect, Vector2, Vector4 } from "@galacean/engine-math";
import { expect } from "chai";

describe("TextRenderer", () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);
  const scene = engine.sceneManager.activeScene;

  engine.run();

  beforeEach(() => {
    scene.createRootEntity("root");
  });

  it("Constructor", () => {
    const sprite = new Sprite(engine);

    expect(sprite.texture).to.eq(null);
    expect(sprite.region).to.deep.eq(new Rect(0, 0, 1, 1));
    expect(sprite.pivot).to.deep.eq(new Vector2(0.5, 0.5));
    expect(sprite.border).to.deep.eq(new Vector4(0, 0, 0, 0));
  });

  it("get set texture", () => {
    const sprite = new Sprite(engine);
    const texture = new Texture2D(engine, 100, 100);
    sprite.texture = texture;

    expect(sprite.texture).to.eq(texture);
  });

  it("get set region", () => {
    const sprite = new Sprite(engine);
    const rect = new Rect(0.1, 0.1, 0.7, 1.0);
    sprite.region = rect;

    expect(sprite.region).to.deep.eq(new Rect(0.1, 0.1, 0.7, 0.9));
  });

  it("get set pivot", () => {
    const sprite = new Sprite(engine);
    const pivot = new Vector2(0.1, 0.1);
    sprite.pivot = pivot;
    expect(sprite.pivot).to.deep.eq(pivot);
    sprite.pivot = pivot;
    expect(sprite.pivot).to.deep.eq(pivot);
  });

  it("get set border", () => {
    const sprite = new Sprite(engine);
    const border = new Vector4(0.1, 0.1, 0.8, 0.8);
    sprite.border = border;
    expect(sprite.border).to.deep.eq(border);
  });

  it("get set atlasRotated", () => {
    const sprite = new Sprite(engine);
    sprite.atlasRotated = true;
    expect(sprite.atlasRotated).to.eq(true);
    sprite.atlasRotated = false;
    expect(sprite.atlasRotated).to.eq(false);
  });

  it("get set atlasRegion", () => {
    const sprite = new Sprite(engine);
    sprite.atlasRegion = new Rect(0, 0, 0.5, 0.5);
    expect(sprite.atlasRegion).to.deep.eq(new Rect(0, 0, 0.5, 0.5));
  });

  it("get set atlasRegionOffset", () => {
    const sprite = new Sprite(engine);
    sprite.atlasRegionOffset = new Vector4(0.1, 0.1, 0.1, 0.1);
    expect(sprite.atlasRegionOffset).to.deep.eq(new Vector4(0.1, 0.1, 0.1, 0.1));
  });

  it("get set size", () => {
    const texture1 = new Texture2D(engine, 2000, 1000);
    const texture2 = new Texture2D(engine, 1000, 2000);
    const sprite = new Sprite(engine);
    expect(sprite.width).to.eq(0);
    expect(sprite.height).to.eq(0);
    sprite.texture = texture1;
    // automatic
    expect(sprite.width).to.eq(20);
    expect(sprite.height).to.eq(10);
    sprite.texture = texture2;
    expect(sprite.width).to.eq(10);
    expect(sprite.height).to.eq(20);
    sprite.atlasRegion = new Rect(0, 0, 0.5, 0.5);
    expect(sprite.width).to.eq(5);
    expect(sprite.height).to.eq(10);
    sprite.atlasRegion = new Rect(0, 0, 0.5, 0.5);
    expect(sprite.width).to.eq(5);
    expect(sprite.height).to.eq(10);
    sprite.region = new Rect(0, 0, 0.5, 0.5);
    expect(sprite.width).to.eq(2.5);
    expect(sprite.height).to.eq(5);
    sprite.atlasRegionOffset = new Vector4(0.1, 0.1, 0.1, 0.1);
    expect(sprite.width).to.eq(3.125);
    expect(sprite.height).to.eq(6.25);
    // custom
    sprite.width = 100;
    sprite.height = 200;
    expect(sprite.width).to.eq(100);
    expect(sprite.height).to.eq(200);
    sprite.texture = texture1;
    expect(sprite.width).to.eq(100);
    expect(sprite.height).to.eq(200);
    sprite.atlasRegion = new Rect(0, 0, 1, 1);
    expect(sprite.width).to.eq(100);
    expect(sprite.height).to.eq(200);
    sprite.atlasRegion = new Rect(0, 0, 1, 1);
    expect(sprite.width).to.eq(100);
    expect(sprite.height).to.eq(200);
    sprite.region = new Rect(0, 0, 1, 1);
    expect(sprite.width).to.eq(100);
    expect(sprite.height).to.eq(200);
    sprite.atlasRegionOffset = new Vector4(0, 0, 0, 0);
    expect(sprite.width).to.eq(100);
    expect(sprite.height).to.eq(200);
  });

  it("destroy", () => {
    const sprite = new Sprite(engine, new Texture2D(engine, 1, 1));
    sprite.destroy();
    sprite.texture = null;
  });

  it("clone", () => {
    const sprite1 = new Sprite(engine, new Texture2D(engine, 1000, 2000));
    const sprite2 = sprite1.clone();
    expect(sprite1.texture).to.deep.eq(sprite2.texture);
    expect(sprite1.region).to.deep.eq(sprite2.region);
    expect(sprite1.pivot).to.deep.eq(sprite2.pivot);
    expect(sprite1.border).to.deep.eq(sprite2.border);
    expect(sprite1.atlasRotated).to.eq(sprite2.atlasRotated);
    expect(sprite1.atlasRegion).to.deep.eq(sprite2.atlasRegion);
    expect(sprite1.atlasRegionOffset).to.deep.eq(sprite2.atlasRegionOffset);
    expect(sprite1.width).to.eq(sprite2.width);
    expect(sprite1.height).to.eq(sprite2.height);
  });
});
