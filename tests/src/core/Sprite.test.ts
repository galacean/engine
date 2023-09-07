import { Sprite, Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Rect, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { expect } from "chai";

describe("Sprite", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const scene = engine.sceneManager.activeScene;

  engine.run();

  beforeEach(() => {
    scene.createRootEntity("root");
  });

  it("Constructor", () => {
    const sprite = new Sprite(engine);

    expect(sprite.texture).to.eq(null);
    expect(sprite.region).to.deep.include({ x: 0, y: 0, width: 1, height: 1 });
    expect(sprite.pivot).to.deep.include({ x: 0.5, y: 0.5 });
    expect(sprite.border).to.deep.include({ x: 0, y: 0, z: 0, w: 0 });
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

    expect(sprite.region).to.deep.include({ x: 0.1, y: 0.1, width: 0.7, height: 0.9 });
  });

  it("get set pivot", () => {
    const sprite = new Sprite(engine);
    const pivot = new Vector2(0.1, 0.1);
    sprite.pivot = pivot;
    expect(sprite.pivot).to.deep.include({ x: 0.1, y: 0.1 });
    sprite.pivot = sprite.pivot;
    expect(sprite.pivot).to.deep.include({ x: 0.1, y: 0.1 });
  });

  it("get set border", () => {
    const sprite = new Sprite(engine);
    const border = new Vector4(0.1, 0.1, 0.8, 0.8);
    sprite.border = border;
    expect(sprite.border).to.deep.include({ x: 0.1, y: 0.1, z: 0.8, w: 0.8 });
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

  it("_getPositions", () => {
    const sprite = new Sprite(engine, new Texture2D(engine, 100, 200));
    // @ts-ignore
    let positions = sprite._getPositions();
    expect(positions[0]).to.deep.eq(new Vector2(0, 0));
    expect(positions[1]).to.deep.eq(new Vector2(1, 0));
    expect(positions[2]).to.deep.eq(new Vector2(0, 1));
    expect(positions[3]).to.deep.eq(new Vector2(1, 1));

    sprite.region = new Rect(0, 0, 0.5, 0.5);
    // @ts-ignore
    positions = sprite._getPositions();
    expect(positions[0]).to.deep.eq(new Vector2(0, 0));
    expect(positions[1]).to.deep.eq(new Vector2(1, 0));
    expect(positions[2]).to.deep.eq(new Vector2(0, 1));
    expect(positions[3]).to.deep.eq(new Vector2(1, 1));
  });

  it("_getUVs", () => {
    const sprite = new Sprite(engine, new Texture2D(engine, 100, 200));
    // @ts-ignore
    let uvs = sprite._getUVs();
    expect(uvs[0]).to.deep.eq(new Vector2(0, 1));
    expect(uvs[1]).to.deep.eq(new Vector2(0, 1));
    expect(uvs[2]).to.deep.eq(new Vector2(1, 0));
    expect(uvs[3]).to.deep.eq(new Vector2(1, 0));

    sprite.region = new Rect(0, 0, 0.5, 0.5);
    // @ts-ignore
    uvs = sprite._getUVs();
    expect(uvs[0]).to.deep.eq(new Vector2(0, 1));
    expect(uvs[1]).to.deep.eq(new Vector2(0, 1));
    expect(uvs[2]).to.deep.eq(new Vector2(0.5, 0.5));
    expect(uvs[3]).to.deep.eq(new Vector2(0.5, 0.5));

    sprite.atlasRegion = new Rect(0, 0, 0.5, 0.5);
    // @ts-ignore
    uvs = sprite._getUVs();
    expect(uvs[0]).to.deep.eq(new Vector2(0, 0.5));
    expect(uvs[1]).to.deep.eq(new Vector2(0, 0.5));
    expect(uvs[2]).to.deep.eq(new Vector2(0.25, 0.25));
    expect(uvs[3]).to.deep.eq(new Vector2(0.25, 0.25));
  });

  it("_getBounds", () => {
    const sprite = new Sprite(engine, new Texture2D(engine, 100, 200));
    // @ts-ignore
    let bounds = sprite._getBounds();
    expect(bounds.min).to.deep.eq(new Vector3(0, 0, 0));
    expect(bounds.max).to.deep.eq(new Vector3(1, 1, 0));
    sprite.region = new Rect(0, 0, 0.5, 0.5);
    // @ts-ignore
    bounds = sprite._getBounds();
    expect(bounds.min).to.deep.eq(new Vector3(0, 0, 0));
    expect(bounds.max).to.deep.eq(new Vector3(1, 1, 0));
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
    expect(sprite1.atlasRotated).to.eq(sprite2.atlasRotated);
    expect(sprite1.atlasRegion).to.deep.eq(sprite2.atlasRegion);
    expect(sprite1.atlasRegionOffset).to.deep.eq(sprite2.atlasRegionOffset);
    expect(sprite1.width).to.eq(sprite2.width);
    expect(sprite1.height).to.eq(sprite2.height);
  });
});
