import {
  Sprite,
  SpriteDrawMode,
  SpriteMaskInteraction,
  SpriteMaskLayer,
  SpriteRenderer,
  SpriteTileMode,
  Texture2D,
  TextureFormat
} from "@galacean/engine-core";
import { Color, Rect, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("SpriteRenderer", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
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
    spriteRenderer.drawMode = SpriteDrawMode.Tiled;
    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    expect(spriteRenderer.tileMode).to.eq(SpriteTileMode.Adaptive);
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    expect(spriteRenderer.tileMode).to.eq(SpriteTileMode.Continuous);
  });

  it("get set tiledAdaptiveThreshold", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.drawMode = SpriteDrawMode.Tiled;
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
    expect(Vector3.equals(spriteRenderer.bounds.min, new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(spriteRenderer.bounds.max, new Vector3(0, 0, 0))).to.eq(true);
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
    const { _chunk: chunk } = spriteRenderer;
    const vertices = chunk._data._vertices;
    const positions: Array<Vector3> = [];
    const uvs: Array<Vector2> = [];
    let index = chunk._vAera.start;
    sprite.pivot = new Vector2(0.5, 0.5);
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    for (let i = 0; i < 4; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(-2, -2.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(2, -2.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(-2, 2.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(2, 2.5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(1, 0))).to.eq(true);

    sprite.pivot = new Vector2(1, 1);
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 4; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(-4, -5, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0, -5, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(-4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(1, 0))).to.eq(true);

    sprite.pivot = new Vector2(0, 0);
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 4; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(4, 5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(1, 0))).to.eq(true);
  });

  it("draw Sliced Sprite", () => {
    const rootEntity = scene.getRootEntity();
    const texture2D = new Texture2D(engine, 200, 300, TextureFormat.R8G8B8A8, false);
    const sprite = new Sprite(engine, texture2D);
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.sprite = sprite;
    spriteRenderer.drawMode = SpriteDrawMode.Sliced;
    // @ts-ignore
    const { _chunk: chunk } = spriteRenderer;
    const vertices = chunk._data._vertices;
    const positions: Array<Vector3> = [];
    const uvs: Array<Vector2> = [];
    let index = chunk._vAera.start;
    sprite.pivot = new Vector2(0, 0);
    sprite.border = new Vector4(0.3, 0.3, 0.3, 0.3);
    spriteRenderer.width = 0.5;
    spriteRenderer.height = 0.5;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    for (let i = 0; i < 16; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(0.5, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(0.5, 0.5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.width = 15;
    spriteRenderer.height = 15;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 16; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 14.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0, 15, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(0.6, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(0.6, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(0.6, 14.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(0.6, 15, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(14.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(14.4, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(14.4, 14.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(14.4, 15, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(15, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(15, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(15, 14.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(15, 15, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(1, 0))).to.eq(true);
  });

  it("draw Tiled Sprite", () => {
    const rootEntity = scene.getRootEntity();
    const texture2D = new Texture2D(engine, 200, 300, TextureFormat.R8G8B8A8, false);
    const sprite = new Sprite(engine, texture2D);
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.sprite = sprite;
    spriteRenderer.drawMode = SpriteDrawMode.Tiled;
    // @ts-ignore
    const { _chunk: chunk } = spriteRenderer;
    const vertices = chunk._data._vertices;
    const positions: Array<Vector3> = [];
    const uvs: Array<Vector2> = [];
    let index = chunk._vAera.start;
    spriteRenderer.width = 5;
    spriteRenderer.height = 5;
    sprite.pivot = new Vector2(0, 0);
    sprite.border = new Vector4(0.5, 0.3, 0.5, 0.3);
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    for (let i = 0; i < 40; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(1, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(1, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(5, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(4, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(5, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(0, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(1, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(0, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(1, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(4, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(5, 0.8999999999999999, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(5, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[16], new Vector3(0, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[17], new Vector3(1, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[18], new Vector3(0, 3.3000000000000003, 0))).to.eq(true);
    expect(Vector3.equals(positions[19], new Vector3(1, 3.3000000000000003, 0))).to.eq(true);
    expect(Vector3.equals(positions[20], new Vector3(4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[21], new Vector3(5, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[22], new Vector3(4, 3.3000000000000003, 0))).to.eq(true);
    expect(Vector3.equals(positions[23], new Vector3(5, 3.3000000000000003, 0))).to.eq(true);
    expect(Vector3.equals(positions[24], new Vector3(0, 3.3000000000000003, 0))).to.eq(true);
    expect(Vector3.equals(positions[25], new Vector3(1, 3.3000000000000003, 0))).to.eq(true);
    expect(Vector3.equals(positions[26], new Vector3(0, 4.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[27], new Vector3(1, 4.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[28], new Vector3(4, 3.3000000000000003, 0))).to.eq(true);
    expect(Vector3.equals(positions[29], new Vector3(5, 3.3000000000000003, 0))).to.eq(true);
    expect(Vector3.equals(positions[30], new Vector3(4, 4.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[31], new Vector3(5, 4.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[32], new Vector3(0, 4.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[33], new Vector3(1, 4.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[34], new Vector3(0, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[35], new Vector3(1, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[36], new Vector3(4, 4.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[37], new Vector3(5, 4.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[38], new Vector3(4, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[39], new Vector3(5, 5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0.5, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.5, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[16], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[17], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[18], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[19], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[20], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[21], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[22], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[23], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[24], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[25], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[26], new Vector2(0, 0.43333333333333335))).to.eq(true);
    expect(Vector2.equals(uvs[27], new Vector2(0.5, 0.43333333333333335))).to.eq(true);
    expect(Vector2.equals(uvs[28], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[29], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[30], new Vector2(0.5, 0.43333333333333335))).to.eq(true);
    expect(Vector2.equals(uvs[31], new Vector2(1, 0.43333333333333335))).to.eq(true);
    expect(Vector2.equals(uvs[32], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[33], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[34], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[35], new Vector2(0.5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[36], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[37], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[38], new Vector2(0.5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[39], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 40; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(1, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 0.8333333333333331, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(1, 0.8333333333333331, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(5, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(4, 0.8333333333333331, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(5, 0.8333333333333331, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(0, 0.8333333333333331, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(1, 0.8333333333333331, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(0, 2.011111111111111, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(1, 2.011111111111111, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(4, 0.8333333333333331, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(5, 0.8333333333333331, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(4, 2.011111111111111, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(5, 2.011111111111111, 0))).to.eq(true);
    expect(Vector3.equals(positions[16], new Vector3(0, 2.011111111111111, 0))).to.eq(true);
    expect(Vector3.equals(positions[17], new Vector3(1, 2.011111111111111, 0))).to.eq(true);
    expect(Vector3.equals(positions[18], new Vector3(0, 3.1222222222222222, 0))).to.eq(true);
    expect(Vector3.equals(positions[19], new Vector3(1, 3.1222222222222222, 0))).to.eq(true);
    expect(Vector3.equals(positions[20], new Vector3(4, 2.011111111111111, 0))).to.eq(true);
    expect(Vector3.equals(positions[21], new Vector3(5, 2.011111111111111, 0))).to.eq(true);
    expect(Vector3.equals(positions[22], new Vector3(4, 3.1222222222222222, 0))).to.eq(true);
    expect(Vector3.equals(positions[23], new Vector3(5, 3.1222222222222222, 0))).to.eq(true);
    expect(Vector3.equals(positions[24], new Vector3(0, 3.1222222222222222, 0))).to.eq(true);
    expect(Vector3.equals(positions[25], new Vector3(1, 3.1222222222222222, 0))).to.eq(true);
    expect(Vector3.equals(positions[26], new Vector3(0, 4.166666666666667, 0))).to.eq(true);
    expect(Vector3.equals(positions[27], new Vector3(1, 4.166666666666667, 0))).to.eq(true);
    expect(Vector3.equals(positions[28], new Vector3(4, 3.1222222222222222, 0))).to.eq(true);
    expect(Vector3.equals(positions[29], new Vector3(5, 3.1222222222222222, 0))).to.eq(true);
    expect(Vector3.equals(positions[30], new Vector3(4, 4.166666666666667, 0))).to.eq(true);
    expect(Vector3.equals(positions[31], new Vector3(5, 4.166666666666667, 0))).to.eq(true);
    expect(Vector3.equals(positions[32], new Vector3(0, 4.166666666666667, 0))).to.eq(true);
    expect(Vector3.equals(positions[33], new Vector3(1, 4.166666666666667, 0))).to.eq(true);
    expect(Vector3.equals(positions[34], new Vector3(0, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[35], new Vector3(1, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[36], new Vector3(4, 4.166666666666667, 0))).to.eq(true);
    expect(Vector3.equals(positions[37], new Vector3(5, 4.166666666666667, 0))).to.eq(true);
    expect(Vector3.equals(positions[38], new Vector3(4, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[39], new Vector3(5, 5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0.5, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.5, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[16], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[17], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[18], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[19], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[20], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[21], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[22], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[23], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[24], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[25], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[26], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[27], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[28], new Vector2(0.5, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[29], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[30], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[31], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[32], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[33], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[34], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[35], new Vector2(0.5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[36], new Vector2(0.5, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[37], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[38], new Vector2(0.5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[39], new Vector2(1, 0))).to.eq(true);

    sprite.border = new Vector4(0.3, 0.5, 0.3, 0.5);
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 56; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0.6, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0.6, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(0.6, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(1.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(0.6, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(1.4, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(1.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(2.2, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(1.4, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(2.2, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(2.2, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(3.0000000000000004, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(2.2, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(3.0000000000000004, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[16], new Vector3(3.0000000000000004, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[17], new Vector3(3.8000000000000003, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[18], new Vector3(3.0000000000000004, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[19], new Vector3(3.8000000000000003, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[20], new Vector3(3.8000000000000003, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[21], new Vector3(4.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[22], new Vector3(3.8000000000000003, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[23], new Vector3(4.4, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[24], new Vector3(4.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[25], new Vector3(5, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[26], new Vector3(4.4, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[27], new Vector3(5, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[28], new Vector3(0, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[29], new Vector3(0.6, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[30], new Vector3(0, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[31], new Vector3(0.6, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[32], new Vector3(0.6, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[33], new Vector3(1.4, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[34], new Vector3(0.6, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[35], new Vector3(1.4, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[36], new Vector3(1.4, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[37], new Vector3(2.2, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[38], new Vector3(1.4, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[39], new Vector3(2.2, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[40], new Vector3(2.2, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[41], new Vector3(3.0000000000000004, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[42], new Vector3(2.2, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[43], new Vector3(3.0000000000000004, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[44], new Vector3(3.0000000000000004, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[45], new Vector3(3.8000000000000003, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[46], new Vector3(3.0000000000000004, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[47], new Vector3(3.8000000000000003, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[48], new Vector3(3.8000000000000003, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[49], new Vector3(4.4, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[50], new Vector3(3.8000000000000003, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[51], new Vector3(4.4, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[52], new Vector3(4.4, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[53], new Vector3(5, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[54], new Vector3(4.4, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[55], new Vector3(5, 5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[16], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[17], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[18], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[19], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[20], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[21], new Vector2(0.5999999999999996, 1))).to.eq(true);
    expect(Vector2.equals(uvs[22], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[23], new Vector2(0.5999999999999996, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[24], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[25], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[26], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[27], new Vector2(1, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[28], new Vector2(0, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[29], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[30], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[31], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[32], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[33], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[34], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[35], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[36], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[37], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[38], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[39], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[40], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[41], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[42], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[43], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[44], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[45], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[46], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[47], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[48], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[49], new Vector2(0.5999999999999996, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[50], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[51], new Vector2(0.5999999999999996, 0))).to.eq(true);
    expect(Vector2.equals(uvs[52], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[53], new Vector2(1, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[54], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[55], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 56; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0.5769230769230769, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0.5769230769230769, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(0.5769230769230769, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(1.3692307692307693, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(0.5769230769230769, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(1.3692307692307693, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(1.3692307692307693, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(2.1384615384615384, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(1.3692307692307693, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(2.1384615384615384, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(2.1384615384615384, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(2.907692307692308, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(2.1384615384615384, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(2.907692307692308, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[16], new Vector3(2.907692307692308, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[17], new Vector3(3.6769230769230767, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[18], new Vector3(2.907692307692308, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[19], new Vector3(3.6769230769230767, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[20], new Vector3(3.6769230769230767, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[21], new Vector3(4.423076923076923, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[22], new Vector3(3.6769230769230767, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[23], new Vector3(4.423076923076923, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[24], new Vector3(4.423076923076923, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[25], new Vector3(5, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[26], new Vector3(4.423076923076923, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[27], new Vector3(5, 1.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[28], new Vector3(0, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[29], new Vector3(0.5769230769230769, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[30], new Vector3(0, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[31], new Vector3(0.5769230769230769, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[32], new Vector3(0.5769230769230769, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[33], new Vector3(1.3692307692307693, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[34], new Vector3(0.5769230769230769, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[35], new Vector3(1.3692307692307693, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[36], new Vector3(1.3692307692307693, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[37], new Vector3(2.1384615384615384, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[38], new Vector3(1.3692307692307693, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[39], new Vector3(2.1384615384615384, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[40], new Vector3(2.1384615384615384, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[41], new Vector3(2.907692307692308, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[42], new Vector3(2.1384615384615384, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[43], new Vector3(2.907692307692308, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[44], new Vector3(2.907692307692308, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[45], new Vector3(3.6769230769230767, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[46], new Vector3(2.907692307692308, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[47], new Vector3(3.6769230769230767, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[48], new Vector3(3.6769230769230767, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[49], new Vector3(4.423076923076923, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[50], new Vector3(3.6769230769230767, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[51], new Vector3(4.423076923076923, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[52], new Vector3(4.423076923076923, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[53], new Vector3(5, 3.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[54], new Vector3(4.423076923076923, 5, 0))).to.eq(true);
    expect(Vector3.equals(positions[55], new Vector3(5, 5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[16], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[17], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[18], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[19], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[20], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[21], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[22], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[23], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[24], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[25], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[26], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[27], new Vector2(1, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[28], new Vector2(0, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[29], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[30], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[31], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[32], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[33], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[34], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[35], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[36], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[37], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[38], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[39], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[40], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[41], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[42], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[43], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[44], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[45], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[46], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[47], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[48], new Vector2(0.3, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[49], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[50], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[51], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[52], new Vector2(0.7, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[53], new Vector2(1, 0.5))).to.eq(true);
    expect(Vector2.equals(uvs[54], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[55], new Vector2(1, 0))).to.eq(true);

    sprite.border = new Vector4(0.3, 0.3, 0.3, 0.3);
    spriteRenderer.width = 0.5;
    spriteRenderer.height = 0.5;
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 16; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(0.5, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(0, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(0.5, 0.5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 16; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(0.25, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(0.5, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(0, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(0, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(0.25, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(0.5, 0.25, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(0.25, 0.5, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(0.5, 0.5, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.width = 0.01;
    spriteRenderer.height = 0.01;
    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 16; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0.005, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(0.005, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(0.01, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(0.01, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(0, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(0, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(0.005, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(0.01, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(0.005, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(0.01, 0.01, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 16; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0.005, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(0.005, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(0.01, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(0.01, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(0, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(0, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(0.005, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(0.005, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(0.01, 0.005, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(0.005, 0.01, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(0.01, 0.01, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.width = 100000;
    spriteRenderer.height = 100000;
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 4; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(100000, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 100000, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(100000, 100000, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 4; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(100000, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 100000, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(100000, 100000, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.width = 3;
    spriteRenderer.height = 4;
    spriteRenderer.tileMode = SpriteTileMode.Continuous;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 80; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0.6, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0.6, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(0.6, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(1.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(0.6, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(1.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(1.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(2.2, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(1.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(2.2, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(2.2, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(2.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(2.2, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(2.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[16], new Vector3(2.4, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[17], new Vector3(3, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[18], new Vector3(2.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[19], new Vector3(3, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[20], new Vector3(0, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[21], new Vector3(0.6, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[22], new Vector3(0, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[23], new Vector3(0.6, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[24], new Vector3(0.6, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[25], new Vector3(1.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[26], new Vector3(0.6, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[27], new Vector3(1.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[28], new Vector3(1.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[29], new Vector3(2.2, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[30], new Vector3(1.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[31], new Vector3(2.2, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[32], new Vector3(2.2, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[33], new Vector3(2.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[34], new Vector3(2.2, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[35], new Vector3(2.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[36], new Vector3(2.4, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[37], new Vector3(3, 0.9, 0))).to.eq(true);
    expect(Vector3.equals(positions[38], new Vector3(2.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[39], new Vector3(3, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[40], new Vector3(0, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[41], new Vector3(0.6, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[42], new Vector3(0, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[43], new Vector3(0.6, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[44], new Vector3(0.6, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[45], new Vector3(1.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[46], new Vector3(0.6, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[47], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[48], new Vector3(1.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[49], new Vector3(2.2, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[50], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[51], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[52], new Vector3(2.2, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[53], new Vector3(2.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[54], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[55], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[56], new Vector3(2.4, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[57], new Vector3(3, 2.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[58], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[59], new Vector3(3, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[60], new Vector3(0, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[61], new Vector3(0.6, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[62], new Vector3(0, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[63], new Vector3(0.6, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[64], new Vector3(0.6, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[65], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[66], new Vector3(0.6, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[67], new Vector3(1.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[68], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[69], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[70], new Vector3(1.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[71], new Vector3(2.2, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[72], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[73], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[74], new Vector3(2.2, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[75], new Vector3(2.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[76], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[77], new Vector3(3, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[78], new Vector3(2.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[79], new Vector3(3, 4, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(0.4, 1))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(0.4, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[16], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[17], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[18], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[19], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[20], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[21], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[22], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[23], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[24], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[25], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[26], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[27], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[28], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[29], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[30], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[31], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[32], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[33], new Vector2(0.4, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[34], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[35], new Vector2(0.4, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[36], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[37], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[38], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[39], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[40], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[41], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[42], new Vector2(0, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(uvs[43], new Vector2(0.3, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(uvs[44], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[45], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[46], new Vector2(0.3, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(uvs[47], new Vector2(0.7, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(uvs[48], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[49], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[50], new Vector2(0.3, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(uvs[51], new Vector2(0.7, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(uvs[52], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[53], new Vector2(0.4, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[54], new Vector2(0.3, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(uvs[55], new Vector2(0.4, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(uvs[56], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[57], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[58], new Vector2(0.7, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(uvs[59], new Vector2(1, 0.3666666666666667))).to.eq(true);
    expect(Vector2.equals(uvs[60], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[61], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[62], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[63], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[64], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[65], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[66], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[67], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[68], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[69], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[70], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[71], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[72], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[73], new Vector2(0.4, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[74], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[75], new Vector2(0.4, 0))).to.eq(true);
    expect(Vector2.equals(uvs[76], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[77], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[78], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[79], new Vector2(1, 0))).to.eq(true);

    spriteRenderer.tileMode = SpriteTileMode.Adaptive;
    // @ts-ignore
    spriteRenderer._assembler.updatePositions(spriteRenderer);
    // @ts-ignore
    spriteRenderer._assembler.updateUVs(spriteRenderer);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 80; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(Vector3.equals(positions[0], new Vector3(0, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[1], new Vector3(0.6428571428571428, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[2], new Vector3(0, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[3], new Vector3(0.6428571428571428, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[4], new Vector3(0.6428571428571428, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[5], new Vector3(1.4571428571428573, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[6], new Vector3(0.6428571428571428, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[7], new Vector3(1.4571428571428573, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[8], new Vector3(1.4571428571428573, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[9], new Vector3(2.357142857142857, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[10], new Vector3(1.4571428571428573, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[11], new Vector3(2.357142857142857, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[12], new Vector3(2.357142857142857, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[13], new Vector3(3, 0, 0))).to.eq(true);
    expect(Vector3.equals(positions[14], new Vector3(2.357142857142857, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[15], new Vector3(3, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[16], new Vector3(0, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[17], new Vector3(0.6428571428571428, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[18], new Vector3(0, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[19], new Vector3(0.6428571428571428, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[20], new Vector3(0.6428571428571428, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[21], new Vector3(1.4571428571428573, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[22], new Vector3(0.6428571428571428, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[23], new Vector3(1.4571428571428573, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[24], new Vector3(1.4571428571428573, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[25], new Vector3(2.357142857142857, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[26], new Vector3(1.4571428571428573, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[27], new Vector3(2.357142857142857, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[28], new Vector3(2.357142857142857, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[29], new Vector3(3, 0.857142857142857, 0))).to.eq(true);
    expect(Vector3.equals(positions[30], new Vector3(2.357142857142857, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[31], new Vector3(3, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[32], new Vector3(0, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[33], new Vector3(0.6428571428571428, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[34], new Vector3(0, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[35], new Vector3(0.6428571428571428, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[36], new Vector3(0.6428571428571428, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[37], new Vector3(1.4571428571428573, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[38], new Vector3(0.6428571428571428, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[39], new Vector3(1.4571428571428573, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[40], new Vector3(1.4571428571428573, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[41], new Vector3(2.357142857142857, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[42], new Vector3(1.4571428571428573, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[43], new Vector3(2.357142857142857, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[44], new Vector3(2.357142857142857, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[45], new Vector3(3, 2.0428571428571427, 0))).to.eq(true);
    expect(Vector3.equals(positions[46], new Vector3(2.357142857142857, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[47], new Vector3(3, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[48], new Vector3(0, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[49], new Vector3(0.6428571428571428, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[50], new Vector3(0, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[51], new Vector3(0.6428571428571428, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[52], new Vector3(0.6428571428571428, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[53], new Vector3(1.4571428571428573, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[54], new Vector3(0.6428571428571428, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[55], new Vector3(1.4571428571428573, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[56], new Vector3(1.4571428571428573, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[57], new Vector3(2.357142857142857, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[58], new Vector3(1.4571428571428573, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[59], new Vector3(2.357142857142857, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[60], new Vector3(2.357142857142857, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[61], new Vector3(3, 3.1428571428571432, 0))).to.eq(true);
    expect(Vector3.equals(positions[62], new Vector3(2.357142857142857, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[63], new Vector3(3, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[64], new Vector3(0.6, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[65], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[66], new Vector3(0.6, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[67], new Vector3(1.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[68], new Vector3(1.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[69], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[70], new Vector3(1.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[71], new Vector3(2.2, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[72], new Vector3(2.2, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[73], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[74], new Vector3(2.2, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[75], new Vector3(2.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[76], new Vector3(2.4, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[77], new Vector3(3, 3.1, 0))).to.eq(true);
    expect(Vector3.equals(positions[78], new Vector3(2.4, 4, 0))).to.eq(true);
    expect(Vector3.equals(positions[79], new Vector3(3, 4, 0))).to.eq(true);
    expect(Vector2.equals(uvs[0], new Vector2(0, 1))).to.eq(true);
    expect(Vector2.equals(uvs[1], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[2], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[3], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[4], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[5], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[6], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[7], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[8], new Vector2(0.3, 1))).to.eq(true);
    expect(Vector2.equals(uvs[9], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[10], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[11], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[12], new Vector2(0.7, 1))).to.eq(true);
    expect(Vector2.equals(uvs[13], new Vector2(1, 1))).to.eq(true);
    expect(Vector2.equals(uvs[14], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[15], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[16], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[17], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[18], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[19], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[20], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[21], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[22], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[23], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[24], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[25], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[26], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[27], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[28], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[29], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[30], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[31], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[32], new Vector2(0, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[33], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[34], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[35], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[36], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[37], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[38], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[39], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[40], new Vector2(0.3, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[41], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[42], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[43], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[44], new Vector2(0.7, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[45], new Vector2(1, 0.7))).to.eq(true);
    expect(Vector2.equals(uvs[46], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[47], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[48], new Vector2(0, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[49], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[50], new Vector2(0, 0))).to.eq(true);
    expect(Vector2.equals(uvs[51], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[52], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[53], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[54], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[55], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[56], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[57], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[58], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[59], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[60], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[61], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[62], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[63], new Vector2(1, 0))).to.eq(true);
    expect(Vector2.equals(uvs[64], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[65], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[66], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[67], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[68], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[69], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[70], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[71], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[72], new Vector2(0.3, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[73], new Vector2(0.4, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[74], new Vector2(0.3, 0))).to.eq(true);
    expect(Vector2.equals(uvs[75], new Vector2(0.4, 0))).to.eq(true);
    expect(Vector2.equals(uvs[76], new Vector2(0.7, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[77], new Vector2(1, 0.3))).to.eq(true);
    expect(Vector2.equals(uvs[78], new Vector2(0.7, 0))).to.eq(true);
    expect(Vector2.equals(uvs[79], new Vector2(1, 0))).to.eq(true);
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
    const noneMaterial = spriteRenderer.getMaterial();

    spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    expect(spriteRenderer.maskInteraction).to.eq(SpriteMaskInteraction.VisibleInsideMask);
    const insideMaterial = spriteRenderer.getMaterial();

    spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    expect(spriteRenderer.maskInteraction).to.eq(SpriteMaskInteraction.VisibleOutsideMask);
    const outsideMaterial = spriteRenderer.getMaterial();

    spriteRenderer.maskInteraction = SpriteMaskInteraction.None;
    expect(spriteRenderer.maskInteraction).to.eq(SpriteMaskInteraction.None);
    expect(spriteRenderer.getMaterial()).to.eq(noneMaterial);

    spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    expect(spriteRenderer.getMaterial()).to.eq(insideMaterial);

    spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    expect(spriteRenderer.getMaterial()).to.eq(outsideMaterial);

    spriteRenderer.setMaterial(noneMaterial.clone());
    spriteRenderer.maskInteraction = SpriteMaskInteraction.None;
    expect(spriteRenderer.getMaterial()).to.not.eq(noneMaterial);

    spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    expect(spriteRenderer.getMaterial()).to.not.eq(insideMaterial);

    spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    expect(spriteRenderer.getMaterial()).to.not.eq(outsideMaterial);

    spriteRenderer.setMaterial(noneMaterial);
    spriteRenderer.maskInteraction = SpriteMaskInteraction.None;
    expect(spriteRenderer.getMaterial()).to.eq(noneMaterial);

    spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    expect(spriteRenderer.getMaterial()).to.eq(insideMaterial);

    spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    expect(spriteRenderer.getMaterial()).to.eq(outsideMaterial);

    const cloneRenderers = rootEntity.clone().getComponents(SpriteRenderer, []);
    expect(cloneRenderers[cloneRenderers.length - 1].getMaterial()).to.eq(outsideMaterial);
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

    spriteRenderer.drawMode = SpriteDrawMode.Tiled;
    // @ts-ignore
    spriteRenderer._dirtyUpdateFlag &= ~0x7;
    sprite.width = 11;
    // @ts-ignore
    expect(!!(spriteRenderer._dirtyUpdateFlag & 0x7)).to.eq(true);

    spriteRenderer.drawMode = SpriteDrawMode.Sliced;
    // @ts-ignore
    spriteRenderer._dirtyUpdateFlag &= ~0x5;
    sprite.width = 12;
    // @ts-ignore
    expect(!!(spriteRenderer._dirtyUpdateFlag & 0x5)).to.eq(true);

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
    const spriteRendererClones = rootEntityClone.getComponents(SpriteRenderer, []);
    expect(spriteRendererClones[spriteRendererClones.length - 1].sprite).to.deep.eq(spriteRenderer.sprite);
    expect(spriteRendererClones[spriteRendererClones.length - 1].drawMode).to.eq(SpriteDrawMode.Sliced);
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
    expect(spriteRenderer._chunk).to.eq(null);
  });

  it("_render", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    const texture2d = new Texture2D(engine, 100, 200);
    const context = { camera: { engine: engine, _renderPipeline: { pushRenderData: () => {} } } };
    // @ts-ignore
    spriteRenderer._render(context);
    // @ts-ignore
    const { _chunk: chunk } = spriteRenderer;
    const vertices = chunk._data._vertices;
    const positions: Array<Vector3> = [];
    const uvs: Array<Vector2> = [];
    let index = chunk._vAera.start;
    for (let i = 0; i < 4; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    expect(positions[0]).to.deep.eq(new Vector3(0, 0, 0));
    expect(positions[1]).to.deep.eq(new Vector3(0, 0, 0));
    expect(positions[2]).to.deep.eq(new Vector3(0, 0, 0));
    expect(positions[3]).to.deep.eq(new Vector3(0, 0, 0));

    expect(uvs[0]).to.deep.eq(new Vector2(0, 0));
    expect(uvs[1]).to.deep.eq(new Vector2(0, 0));
    expect(uvs[2]).to.deep.eq(new Vector2(0, 0));
    expect(uvs[3]).to.deep.eq(new Vector2(0, 0));
    // @ts-ignore
    const { min, max } = spriteRenderer._bounds;
    expect(min).to.deep.eq(new Vector3(0, 0, 0));
    expect(max).to.deep.eq(new Vector3(0, 0, 0));

    const sprite = new Sprite(engine, texture2d);
    spriteRenderer.sprite = sprite;
    // @ts-ignore
    spriteRenderer._render(context);
    positions.length = 0;
    uvs.length = 0;
    index = chunk._vAera.start;
    for (let i = 0; i < 4; ++i) {
      positions.push(new Vector3(vertices[index], vertices[index + 1], vertices[index + 2]));
      uvs.push(new Vector2(vertices[index + 3], vertices[index + 4]));
      index += 9;
    }
    // @ts-ignore
    expect(positions[0]).to.deep.eq(new Vector3(-0.5, -1, 0));
    expect(positions[1]).to.deep.eq(new Vector3(0.5, -1, 0));
    expect(positions[2]).to.deep.eq(new Vector3(-0.5, 1, 0));
    expect(positions[3]).to.deep.eq(new Vector3(0.5, 1, 0));
    expect(uvs[0]).to.deep.eq(new Vector2(0, 1));
    expect(uvs[1]).to.deep.eq(new Vector2(1, 1));
    expect(uvs[2]).to.deep.eq(new Vector2(0, 0));
    expect(uvs[3]).to.deep.eq(new Vector2(1, 0));
    // @ts-ignore
    expect(min).to.deep.eq(new Vector3(-0.5, -1, 0));
    expect(max).to.deep.eq(new Vector3(0.5, 1, 0));
  });
});
