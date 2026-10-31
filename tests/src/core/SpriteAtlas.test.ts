import { Sprite, SpriteAtlas, Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("SpriteAtlas", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getSprite returns the sprite when it exists", () => {
    const atlas = new SpriteAtlas(engine);
    const sprite = new Sprite(engine, new Texture2D(engine, 100, 100));
    sprite.name = "test";
    // @ts-ignore
    atlas._addSprite(sprite);

    const result = atlas.getSprite("test");
    expect(result).to.eq(sprite);
  });

  it("getSprite warns when sprite not found", () => {
    const atlas = new SpriteAtlas(engine);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = atlas.getSprite("nonexistent");
    expect(result).to.be.undefined;
    expect(warnSpy).toHaveBeenCalledWith("There is no sprite named nonexistent in the atlas.");
  });

  it("getSprites returns matching sprites", () => {
    const atlas = new SpriteAtlas(engine);
    const sprite1 = new Sprite(engine, new Texture2D(engine, 100, 100));
    const sprite2 = new Sprite(engine, new Texture2D(engine, 200, 200));
    sprite1.name = "shared";
    sprite2.name = "shared";
    // @ts-ignore
    atlas._addSprite(sprite1);
    // @ts-ignore
    atlas._addSprite(sprite2);

    const out: Sprite[] = [];
    const result = atlas.getSprites("shared", out);
    expect(result).to.eq(out);
    expect(out.length).to.be.greaterThan(0);
    for (const s of out) {
      expect(s.name).to.eq("shared");
    }
  });

  it("getSprites warns when sprite not found", () => {
    const atlas = new SpriteAtlas(engine);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const out: Sprite[] = [];
    const result = atlas.getSprites("nonexistent", out);
    expect(result).to.eq(out);
    expect(out.length).to.eq(0);
    expect(warnSpy).toHaveBeenCalledWith("There is no sprite named nonexistent in the atlas.");
  });
});
