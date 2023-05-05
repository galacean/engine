import { Color, Vector2, Vector4, Rect } from "@galacean/engine-math";
import {
  Sprite,
  SpriteDrawMode,
  SpriteMaskInteraction,
  SpriteMaskLayer,
  SpriteRenderer,
  Texture2D
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("SpriteRenderer", () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);
  const scene = engine.sceneManager.activeScene;

  engine.run();

  beforeEach(() => {
    scene.createRootEntity("root");
  });

  it("Constructor", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    const defaultColor = new Color(1, 1, 1, 1);

    expect(spriteRenderer instanceof SpriteRenderer).to.eq(true);
    expect(spriteRenderer.sprite).to.eq(null);
    expect(Color.equals(spriteRenderer.color, defaultColor)).to.eq(true);
    expect(spriteRenderer.flipX).to.eq(false);
    expect(spriteRenderer.flipY).to.eq(false);
  });

  it("get set sprite", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    const texture = new Texture2D(engine, 100, 100);
    const sprite = new Sprite(engine, texture);
    spriteRenderer.sprite = sprite;
    expect(spriteRenderer.sprite).to.eq(sprite);
    spriteRenderer.sprite = sprite;
    expect(spriteRenderer.sprite).to.eq(sprite);
    spriteRenderer.sprite = null;
    expect(spriteRenderer.sprite).to.eq(null);
  });

  it("get set size", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    expect(spriteRenderer.width).to.eq(0);
    expect(spriteRenderer.height).to.eq(0);

    const texture2d = new Texture2D(engine, 100, 200);
    const sprite = new Sprite(engine, texture2d);
    spriteRenderer.sprite = sprite;
    expect(spriteRenderer.width).to.eq(1);
    expect(spriteRenderer.height).to.eq(2);

    spriteRenderer.sprite = null;
    expect(spriteRenderer.width).to.eq(0);
    expect(spriteRenderer.height).to.eq(0);

    spriteRenderer.width = 10;
    spriteRenderer.height = 20;
    expect(spriteRenderer.width).to.eq(10);
    expect(spriteRenderer.height).to.eq(20);
  });

  it("get set color", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.color.set(1, 0, 0, 1);
    expect(Color.equals(spriteRenderer.color, new Color(1, 0, 0, 1))).to.eq(true);
    spriteRenderer.color = new Color(0, 1, 0, 1);
    expect(spriteRenderer.color).to.deep.eq(new Color(0, 1, 0, 1));
  });

  it("get set flip", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.flipX = true;
    spriteRenderer.flipY = true;

    expect(spriteRenderer.flipY).to.eq(true);
    expect(spriteRenderer.flipY).to.eq(true);
  });

  it("get set maskLayer", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.maskLayer = SpriteMaskLayer.Layer10;
    expect(spriteRenderer.maskLayer).to.eq(SpriteMaskLayer.Layer10);
  });

  it("get set maskInteraction", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    expect(spriteRenderer.maskInteraction).to.eq(SpriteMaskInteraction.VisibleInsideMask);
    spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    expect(spriteRenderer.maskInteraction).to.eq(SpriteMaskInteraction.VisibleOutsideMask);
    spriteRenderer.maskInteraction = SpriteMaskInteraction.None;
    expect(spriteRenderer.maskInteraction).to.eq(SpriteMaskInteraction.None);
  });

  it("DirtyFlag", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    const texture2d = new Texture2D(engine, 100, 200);
    const sprite = new Sprite(engine);
    spriteRenderer.sprite = sprite;
    // @ts-ignore
    const property = SpriteRenderer._textureProperty;
    expect(spriteRenderer.shaderData.getTexture(property)).to.eq(null);
    sprite.texture = texture2d;
    expect(spriteRenderer.shaderData.getTexture(property)).to.eq(texture2d);

    // @ts-ignore
    spriteRenderer._dirtyUpdateFlag &= ~0x5;
    sprite.width = 10;
    // @ts-ignore
    expect(!!(spriteRenderer._dirtyUpdateFlag & 0x5)).to.eq(true);

    spriteRenderer.drawMode = SpriteDrawMode.Sliced;
    // @ts-ignore
    spriteRenderer._dirtyUpdateFlag &= ~0x3;
    sprite.border = new Vector4();
    // @ts-ignore
    expect(!!(spriteRenderer._dirtyUpdateFlag & 0x3)).to.eq(true);

    // @ts-ignore
    spriteRenderer._dirtyUpdateFlag &= ~0x3;
    sprite.region = new Rect();
    // @ts-ignore
    expect(!!(spriteRenderer._dirtyUpdateFlag & 0x3)).to.eq(true);

    // @ts-ignore
    spriteRenderer._dirtyUpdateFlag &= ~0x3;
    sprite.atlasRegionOffset = new Vector4();
    // @ts-ignore
    expect(!!(spriteRenderer._dirtyUpdateFlag & 0x3)).to.eq(true);

    // @ts-ignore
    spriteRenderer._dirtyUpdateFlag &= ~0x2;
    sprite.atlasRegion = new Rect();
    // @ts-ignore
    expect(!!(spriteRenderer._dirtyUpdateFlag & 0x2)).to.eq(true);

    // @ts-ignore
    spriteRenderer._dirtyUpdateFlag &= ~0x1;
    sprite.pivot = new Vector2(0.3, 0.2);
    // @ts-ignore
    expect(!!(spriteRenderer._dirtyUpdateFlag & 0x1)).to.eq(true);
  });

  it("clone", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    const texture2d = new Texture2D(engine, 100, 200);
    const sprite = new Sprite(engine, texture2d);
    spriteRenderer.sprite = sprite;
    spriteRenderer.drawMode = SpriteDrawMode.Sliced;

    const rootEntityClone = rootEntity.clone();
    const spriteRendererClone = rootEntityClone.getComponent(SpriteRenderer);
    expect(spriteRendererClone.sprite).to.deep.eq(spriteRenderer.sprite);
    expect(spriteRendererClone.drawMode).to.eq(SpriteDrawMode.Sliced);
  });

  it("destroy", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.sprite = new Sprite(engine, new Texture2D(engine, 100, 200));
    spriteRenderer.destroy();
    expect(spriteRenderer.sprite).to.eq(null);
    expect(spriteRenderer.color).to.eq(null);
    // @ts-ignore
    expect(spriteRenderer._assembler).to.eq(null);
    // @ts-ignore
    expect(spriteRenderer._renderData).to.eq(null);
  });
});
