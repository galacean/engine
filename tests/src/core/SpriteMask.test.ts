import { Sprite, SpriteMask, Texture2D } from "@oasis-engine/core";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { expect } from "chai";

describe("SpriteMask", () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);
  const scene = engine.sceneManager.activeScene;

  engine.run();

  beforeEach(() => {
    scene.createRootEntity("root");
  });

  it("Constructor", () => {
    const rootEntity = scene.getRootEntity();
    const spriteMask = rootEntity.addComponent(SpriteMask);

    expect(spriteMask instanceof SpriteMask).to.eq(true);
    expect(spriteMask.sprite).to.eq(null);
    expect(spriteMask.flipX).to.eq(false);
    expect(spriteMask.flipY).to.eq(false);
  });

  it("get set sprite", () => {
    const rootEntity = scene.getRootEntity();
    const spriteMask = rootEntity.addComponent(SpriteMask);
    const texture = new Texture2D(engine, 100, 100);
    const sprite = new Sprite(engine, texture);
    spriteMask.sprite = sprite;

    expect(spriteMask.sprite).to.eq(sprite);
  });

  it("get set alphaCutoff", () => {
    const rootEntity = scene.getRootEntity();
    const spriteMask = rootEntity.addComponent(SpriteMask);
    spriteMask.alphaCutoff = 1.0;

    expect(spriteMask.alphaCutoff).to.eq(1.0);
  });

  it("get set flip", () => {
    const rootEntity = scene.getRootEntity();
    const spriteMask = rootEntity.addComponent(SpriteMask);
    spriteMask.flipX = true;
    spriteMask.flipY = true;

    expect(spriteMask.flipY).to.eq(true);
    expect(spriteMask.flipY).to.eq(true);
  });
});
