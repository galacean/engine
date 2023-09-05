import { Texture2D, UnlitMaterial } from "@galacean/engine-core";
import { Color, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("UnlitMaterial", () => {
  let engine: WebGLEngine;
  before(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("参数测试", () => {
    const material = new UnlitMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    expect(material.baseColor).to.deep.eq(new Color(1, 1, 1, 1));
    expect(material.tilingOffset).to.deep.eq(new Vector4(1, 1, 0, 0));
    expect(material.baseTexture).to.be.undefined;

    material.baseColor.set(1, 0, 0, 1);
    material.tilingOffset.set(1, 1, 1, 1);
    material.baseTexture = texture;

    expect(material.baseColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(material.tilingOffset).to.deep.eq(new Vector4(1, 1, 1, 1));
    expect(material.baseTexture).to.eq(texture);

    material.baseTexture = null;
    expect(material.baseTexture).to.be.null;
  });

  it("clone", () => {
    const material = new UnlitMaterial(engine);

    material.baseColor = new Color(1, 0, 0, 1);
    material.tilingOffset = new Vector4(1, 1, 1, 1);
    material.baseTexture = new Texture2D(engine, 1024, 1024);

    const clone = material.clone();
    expect(clone.baseColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(clone.tilingOffset).to.deep.eq(new Vector4(1, 1, 1, 1));
    expect(clone.baseTexture).to.eq(material.baseTexture);
  });
});
