import { BoundingBox, Color, Rect, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { Sprite, SpriteDrawMode, SpriteRenderer, SpriteTileMode, Texture2D, TextureFormat } from "@oasis-engine/core";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
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
  });

  it("get set color", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.color.set(1, 0, 0, 1);

    expect(Color.equals(spriteRenderer.color, new Color(1, 0, 0, 1))).to.eq(true);
  });

  it("get set flip", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.flipX = true;
    spriteRenderer.flipY = true;

    expect(spriteRenderer.flipY).to.eq(true);
    expect(spriteRenderer.flipY).to.eq(true);
  });

  it("get set drawMode", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.drawMode = SpriteDrawMode.Simple;
    expect(spriteRenderer.drawMode).to.eq(SpriteDrawMode.Simple);
    spriteRenderer.drawMode = SpriteDrawMode.Sliced;
    expect(spriteRenderer.drawMode).to.eq(SpriteDrawMode.Sliced);
    spriteRenderer.drawMode = SpriteDrawMode.Tiled;
    expect(spriteRenderer.drawMode).to.eq(SpriteDrawMode.Tiled);
  });

  it("get set tileMode", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    expect(spriteRenderer.tileMode).to.eq(SpriteTileMode.Adaptive);
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    expect(spriteRenderer.tileMode).to.eq(SpriteTileMode.Continuous);
  });

  it("get set tiledAdaptiveThreshold", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.tiledAdaptiveThreshold = 0.3;
    expect(spriteRenderer.tiledAdaptiveThreshold).to.eq(0.3);
    spriteRenderer.tiledAdaptiveThreshold = 0.0;
    expect(spriteRenderer.tiledAdaptiveThreshold).to.eq(0.0);
    spriteRenderer.tiledAdaptiveThreshold = 1.0;
    expect(spriteRenderer.tiledAdaptiveThreshold).to.eq(1.0);
    spriteRenderer.tiledAdaptiveThreshold = -1.0;
    expect(spriteRenderer.tiledAdaptiveThreshold).to.eq(0.0);
    spriteRenderer.tiledAdaptiveThreshold = 2.0;
    expect(spriteRenderer.tiledAdaptiveThreshold).to.eq(1.0);
  });

  it("get spriteRenderer bounds", () => {
    const rootEntity = scene.getRootEntity();
    const texture2D = new Texture2D(engine, 200, 300, TextureFormat.R8G8B8A8, false);
    const sprite = new Sprite(engine, texture2D);
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.sprite = sprite;
    spriteRenderer.drawMode = SpriteDrawMode.Simple;
    spriteRenderer.width = 4;
    spriteRenderer.height = 5;
    sprite.pivot = new Vector2(0.5, 0.5);
    expect(Vector3.equals(spriteRenderer.bounds.min, new Vector3(-2, -2.5, 0))).to.eq(true);
    expect(Vector3.equals(spriteRenderer.bounds.max, new Vector3(2, 2.5, 0))).to.eq(true);
    sprite.pivot = new Vector2(0, 0);
    expect(Vector3.equals(spriteRenderer.bounds.min, new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(spriteRenderer.bounds.max, new Vector3(4, 5, 0))).to.eq(true);
    sprite.pivot = new Vector2(1, 1);
    expect(Vector3.equals(spriteRenderer.bounds.min, new Vector3(-4, -5, 0))).to.eq(true);
    expect(Vector3.equals(spriteRenderer.bounds.max, new Vector3(0, 0, 0))).to.eq(true);

    spriteRenderer.drawMode = SpriteDrawMode.Sliced;
    spriteRenderer.width = 7;
    spriteRenderer.height = 8;
    sprite.pivot = new Vector2(0.5, 0.5);
    expect(Vector3.equals(spriteRenderer.bounds.min, new Vector3(-3.5, -4, 0))).to.eq(true);
    expect(Vector3.equals(spriteRenderer.bounds.max, new Vector3(3.5, 4, 0))).to.eq(true);
    sprite.pivot = new Vector2(0, 0);
    expect(Vector3.equals(spriteRenderer.bounds.min, new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(spriteRenderer.bounds.max, new Vector3(7, 8, 0))).to.eq(true);
    sprite.pivot = new Vector2(1, 1);
    expect(Vector3.equals(spriteRenderer.bounds.min, new Vector3(-7, -8, 0))).to.eq(true);
    expect(Vector3.equals(spriteRenderer.bounds.max, new Vector3(0, 0, 0))).to.eq(true);

    spriteRenderer.drawMode = SpriteDrawMode.Tiled;
    spriteRenderer.width = 9;
    spriteRenderer.height = 10;
    sprite.pivot = new Vector2(0.5, 0.5);
    expect(Vector3.equals(spriteRenderer.bounds.min, new Vector3(-4.5, -5, 0))).to.eq(true);
    expect(Vector3.equals(spriteRenderer.bounds.max, new Vector3(4.5, 5, 0))).to.eq(true);
    sprite.pivot = new Vector2(0, 0);
    expect(Vector3.equals(spriteRenderer.bounds.min, new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(spriteRenderer.bounds.max, new Vector3(9, 10, 0))).to.eq(true);
    sprite.pivot = new Vector2(1, 1);
    expect(Vector3.equals(spriteRenderer.bounds.min, new Vector3(-9, -10, 0))).to.eq(true);
    expect(Vector3.equals(spriteRenderer.bounds.max, new Vector3(0, 0, 0))).to.eq(true);
  });

  it("draw Simple Sprite", () => {
    const rootEntity = scene.getRootEntity();
    const texture2D = new Texture2D(engine, 200, 300, TextureFormat.R8G8B8A8, false);
    const sprite = new Sprite(engine, texture2D);
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.sprite = sprite;
    spriteRenderer.drawMode = SpriteDrawMode.Simple;
    spriteRenderer.width = 4;
    spriteRenderer.height = 5;
    // @ts-ignore
    const renderData = spriteRenderer._verticesData;
    sprite.pivot = new Vector2(0.5, 0.5);
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(-2, -2.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(2, -2.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(-2, 2.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(2, 2.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(1, 0))).to.eq(true);

    sprite.pivot = new Vector2(1, 1);
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(-4, -5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0, -5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(-4, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(1, 0))).to.eq(true);

    sprite.pivot = new Vector2(0, 0);
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(4, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(4, 5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(1, 0))).to.eq(true);
  });

  it("draw Sliced Sprite", () => {
    const rootEntity = scene.getRootEntity();
    const texture2D = new Texture2D(engine, 200, 300, TextureFormat.R8G8B8A8, false);
    const sprite = new Sprite(engine, texture2D);
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.sprite = sprite;
    spriteRenderer.drawMode = SpriteDrawMode.Sliced;
    // @ts-ignore
    const renderData = spriteRenderer._verticesData;
    sprite.pivot = new Vector2(0, 0);
    sprite.border = new Vector4(0.3, 0.3, 0.3, 0.3);
    spriteRenderer.width = 0.5;
    spriteRenderer.height = 0.5;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(0.5, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(0.5, 0.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.width = 15;
    spriteRenderer.height = 15;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 14.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0, 15, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.6, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(0.6, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.6, 14.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(0.6, 15, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(14.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(14.4, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(14.4, 14.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(14.4, 15, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(15, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(15, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(15, 14.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(15, 15, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0))).to.eq(true);
  });

  it("draw Tiled Sprite", () => {
    const rootEntity = scene.getRootEntity();
    const texture2D = new Texture2D(engine, 200, 300, TextureFormat.R8G8B8A8, false);
    const sprite = new Sprite(engine, texture2D);
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.sprite = sprite;
    spriteRenderer.drawMode = SpriteDrawMode.Tiled;
    // @ts-ignore
    const renderData = spriteRenderer._verticesData;
    spriteRenderer.width = 0.5;
    spriteRenderer.height = 0.5;
    sprite.pivot = new Vector2(0, 0);
    sprite.border = new Vector4(0.5, 0.3, 0.5, 0.3);
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(0.5, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(0, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(0.5, 0.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0.5, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.5, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(0.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(0.5, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(0, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(0.5, 0.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0.5, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.5, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(0.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0))).to.eq(true);

    sprite.border = new Vector4(0.3, 0.5, 0.3, 0.5);
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(0.5, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(0, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(0.5, 0.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(1, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(0.5, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(0, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(0.5, 0.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(1, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 0.5))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0))).to.eq(true);

    sprite.border = new Vector4(0.3, 0.3, 0.3, 0.3);
    spriteRenderer.width = 0.5;
    spriteRenderer.height = 0.5;
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[1], new Vector3(0.25, 0, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.25, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[3], new Vector3(0.25, 0.25, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.25, 0, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[5], new Vector3(0.5, 0, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.25, 0.25, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[7], new Vector3(0.5, 0.25, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[8], new Vector3(0, 0.25, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[9], new Vector3(0.25, 0.25, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[10], new Vector3(0, 0.5, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[11], new Vector3(0.25, 0.5, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[12], new Vector3(0.25, 0.25, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[13], new Vector3(0.5, 0.25, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[14], new Vector3(0.25, 0.5, 0))).to.eq(true)
    expect(Vector3.equals(renderData.positions[15], new Vector3(0.5, 0.5, 0))).to.eq(true)
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(0.5, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(0, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(0.5, 0.5, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.width = 0.01;
    spriteRenderer.height = 0.01;
    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0.005, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.005, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(0.01, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(0.01, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(0, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(0, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(0.005, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(0.01, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(0.005, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(0.01, 0.01, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0.005, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.005, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(0.01, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(0.01, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(0, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(0, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(0.005, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(0.01, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(0.005, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(0.01, 0.01, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.width = 100000;
    spriteRenderer.height = 100000;
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(100000, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 100000, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(100000, 100000, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(100000, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 100000, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(100000, 100000, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.width = 3;
    spriteRenderer.height = 4;
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0.6, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0.6, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.6, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(1.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.6, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(1.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(1.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(2.2, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(1.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(2.2, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(2.2, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(2.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(2.2, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(2.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[16], new Vector3(2.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[17], new Vector3(3, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[18], new Vector3(2.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[19], new Vector3(3, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[20], new Vector3(0, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[21], new Vector3(0.6, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[22], new Vector3(0, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[23], new Vector3(0.6, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[24], new Vector3(0.6, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[25], new Vector3(1.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[26], new Vector3(0.6, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[27], new Vector3(1.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[28], new Vector3(1.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[29], new Vector3(2.2, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[30], new Vector3(1.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[31], new Vector3(2.2, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[32], new Vector3(2.2, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[33], new Vector3(2.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[34], new Vector3(2.2, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[35], new Vector3(2.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[36], new Vector3(2.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[37], new Vector3(3, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[38], new Vector3(2.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[39], new Vector3(3, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[40], new Vector3(0, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[41], new Vector3(0.6, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[42], new Vector3(0, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[43], new Vector3(0.6, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[44], new Vector3(0.6, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[45], new Vector3(1.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[46], new Vector3(0.6, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[47], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[48], new Vector3(1.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[49], new Vector3(2.2, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[50], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[51], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[52], new Vector3(2.2, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[53], new Vector3(2.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[54], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[55], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[56], new Vector3(2.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[57], new Vector3(3, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[58], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[59], new Vector3(3, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[60], new Vector3(0, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[61], new Vector3(0.6, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[62], new Vector3(0, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[63], new Vector3(0.6, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[64], new Vector3(0.6, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[65], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[66], new Vector3(0.6, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[67], new Vector3(1.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[68], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[69], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[70], new Vector3(1.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[71], new Vector3(2.2, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[72], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[73], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[74], new Vector3(2.2, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[75], new Vector3(2.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[76], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[77], new Vector3(3, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[78], new Vector3(2.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[79], new Vector3(3, 4, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(0.4, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(0.4, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[16], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[17], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[18], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[19], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[20], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[21], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[22], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[23], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[24], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[25], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[26], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[27], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[28], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[29], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[30], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[31], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[32], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[33], new Vector2(0.4, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[34], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[35], new Vector2(0.4, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[36], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[37], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[38], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[39], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[40], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[41], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[42], new Vector2(0, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[43], new Vector2(0.3, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[44], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[45], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[46], new Vector2(0.3, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[47], new Vector2(0.7, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[48], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[49], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[50], new Vector2(0.3, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[51], new Vector2(0.7, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[52], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[53], new Vector2(0.4, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[54], new Vector2(0.3, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[55], new Vector2(0.4, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[56], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[57], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[58], new Vector2(0.7, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[59], new Vector2(1, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[60], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[61], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[62], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[63], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[64], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[65], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[66], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[67], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[68], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[69], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[70], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[71], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[72], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[73], new Vector2(0.4, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[74], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[75], new Vector2(0.4, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[76], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[77], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[78], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[79], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    expect(Vector3.equals(renderData.positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[1], new Vector3(0.6428571428571428, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[2], new Vector3(0, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[3], new Vector3(0.6428571428571428, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[4], new Vector3(0.6428571428571428, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[5], new Vector3(1.4571428571428573, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[6], new Vector3(0.6428571428571428, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[7], new Vector3(1.4571428571428573, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[8], new Vector3(1.4571428571428573, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[9], new Vector3(2.357142857142857, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[10], new Vector3(1.4571428571428573, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[11], new Vector3(2.357142857142857, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[12], new Vector3(2.357142857142857, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[13], new Vector3(3, 0, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[14], new Vector3(2.357142857142857, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[15], new Vector3(3, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[16], new Vector3(0, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[17], new Vector3(0.6428571428571428, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[18], new Vector3(0, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[19], new Vector3(0.6428571428571428, 2.0428571428571427, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[20], new Vector3(0.6428571428571428, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[21], new Vector3(1.4571428571428573, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[22], new Vector3(0.6428571428571428, 2.0428571428571427, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[23], new Vector3(1.4571428571428573, 2.0428571428571427, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[24], new Vector3(1.4571428571428573, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[25], new Vector3(2.357142857142857, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[26], new Vector3(1.4571428571428573, 2.0428571428571427, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[27], new Vector3(2.357142857142857, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[28], new Vector3(2.357142857142857, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[29], new Vector3(3, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[30], new Vector3(2.357142857142857, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[31], new Vector3(3, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[32], new Vector3(0, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[33], new Vector3(0.6428571428571428, 2.0428571428571427, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[34], new Vector3(0, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[35], new Vector3(0.6428571428571428, 3.1428571428571432, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[36], new Vector3(0.6428571428571428, 2.0428571428571427, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[37], new Vector3(1.4571428571428573, 2.0428571428571427, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[38], new Vector3(0.6428571428571428, 3.1428571428571432, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[39], new Vector3(1.4571428571428573, 3.1428571428571432, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[40], new Vector3(1.4571428571428573, 2.0428571428571427, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[41], new Vector3(2.357142857142857, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[42], new Vector3(1.4571428571428573, 3.1428571428571432, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[43], new Vector3(2.357142857142857, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[44], new Vector3(2.357142857142857, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[45], new Vector3(3, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[46], new Vector3(2.357142857142857, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[47], new Vector3(3, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[48], new Vector3(0, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[49], new Vector3(0.6428571428571428, 3.1428571428571432, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[50], new Vector3(0, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[51], new Vector3(0.6428571428571428, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[52], new Vector3(0.6428571428571428, 3.1428571428571432, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[53], new Vector3(1.4571428571428573, 3.1428571428571432, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[54], new Vector3(0.6428571428571428, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[55], new Vector3(1.4571428571428573, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[56], new Vector3(1.4571428571428573, 3.1428571428571432, 0))).to.eq(
      true
    );
    expect(Vector3.equals(renderData.positions[57], new Vector3(2.357142857142857, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[58], new Vector3(1.4571428571428573, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[59], new Vector3(2.357142857142857, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[60], new Vector3(2.357142857142857, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[61], new Vector3(3, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[62], new Vector3(2.357142857142857, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[63], new Vector3(3, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[64], new Vector3(0.6, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[65], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[66], new Vector3(0.6, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[67], new Vector3(1.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[68], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[69], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[70], new Vector3(1.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[71], new Vector3(2.2, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[72], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[73], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[74], new Vector3(2.2, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[75], new Vector3(2.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[76], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[77], new Vector3(3, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[78], new Vector3(2.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(renderData.positions[79], new Vector3(3, 4, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[4], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[5], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[6], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[7], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[8], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[9], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[10], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[11], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[12], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[13], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[14], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[15], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[16], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[17], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[18], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[19], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[20], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[21], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[22], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[23], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[24], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[25], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[26], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[27], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[28], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[29], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[30], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[31], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[32], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[33], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[34], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[35], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[36], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[37], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[38], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[39], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[40], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[41], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[42], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[43], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[44], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[45], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[46], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[47], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[48], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[49], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[50], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[51], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[52], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[53], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[54], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[55], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[56], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[57], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[58], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[59], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[60], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[61], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[62], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[63], new Vector2(1, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[64], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[65], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[66], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[67], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[68], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[69], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[70], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[71], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[72], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[73], new Vector2(0.4, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[74], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[75], new Vector2(0.4, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[76], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[77], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[78], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(renderData.uvs[79], new Vector2(1, 0))).to.eq(true);
  });
});
