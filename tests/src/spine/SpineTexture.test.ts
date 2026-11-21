import { describe, beforeAll, expect, it } from "vitest";
import { Texture2D, TextureFilterMode, WebGLEngine } from "@galacean/engine";
import { TextureFilter as TextureFilter42 } from "@esotericsoftware/spine-core";
import { SpineTexture as SpineTexture42 } from "../../../packages/spine-core-4.2/src/SpineTexture";
import { SpineTexture as SpineTexture38 } from "../../../packages/spine-core-3.8/src/SpineTexture";
import { TextureFilter as TextureFilter38 } from "../../../packages/spine-core-3.8/src/spine-core/Texture";

describe("SpineTexture.setFilters", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("maps atlas min filters to engine filter modes (4.2)", () => {
    const texture = new Texture2D(engine, 4, 4);
    const spineTexture = new SpineTexture42(texture);

    spineTexture.setFilters(TextureFilter42.Nearest, TextureFilter42.Nearest);
    expect(texture.filterMode).to.equal(TextureFilterMode.Point);

    spineTexture.setFilters(TextureFilter42.Linear, TextureFilter42.Linear);
    expect(texture.filterMode).to.equal(TextureFilterMode.Bilinear);

    // Atlases pair a MipMap* min filter with a plain Linear mag filter — the min filter
    // alone decides whether mipmap sampling (Trilinear) is requested.
    spineTexture.setFilters(TextureFilter42.MipMapLinearLinear, TextureFilter42.Linear);
    expect(texture.filterMode).to.equal(TextureFilterMode.Trilinear);
  });

  it("maps atlas min filters to engine filter modes (3.8)", () => {
    const texture = new Texture2D(engine, 4, 4);
    const spineTexture = new SpineTexture38(texture);

    spineTexture.setFilters(TextureFilter38.Nearest, TextureFilter38.Nearest);
    expect(texture.filterMode).to.equal(TextureFilterMode.Point);

    spineTexture.setFilters(TextureFilter38.Linear, TextureFilter38.Linear);
    expect(texture.filterMode).to.equal(TextureFilterMode.Bilinear);

    spineTexture.setFilters(TextureFilter38.MipMapLinearLinear, TextureFilter38.Linear);
    expect(texture.filterMode).to.equal(TextureFilterMode.Trilinear);
  });
});
