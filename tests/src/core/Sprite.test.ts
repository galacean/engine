import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { Sprite, Texture2D } from "@oasis-engine/core";
import { Rect, Vector2, Vector4 } from "@oasis-engine/math";
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
  });

  it("get set border", () => {
    const sprite = new Sprite(engine);
    const border = new Vector4(0.1, 0.1, 0.8, 0.8); 
    sprite.border = border;

    expect(sprite.border).to.deep.eq(border);
  });
  
});

