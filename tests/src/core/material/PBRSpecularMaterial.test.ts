import { Color } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Texture2D, PBRSpecularMaterial } from "@galacean/engine-core";
import { describe, beforeAll, expect, it } from "vitest";

describe("PBRSpecularMaterial", () => {
  let engine: WebGLEngine;
  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("pbr specular 参数测试", () => {
    const material = new PBRSpecularMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    expect(material.specularColor).to.deep.eq(new Color(1, 1, 1, 1));
    expect(material.glossiness).to.eq(1);
    expect(material.specularGlossinessTexture).to.be.undefined;

    material.specularColor.set(1, 0, 0, 1);
    material.glossiness = 2;
    material.specularGlossinessTexture = texture;

    expect(material.specularColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(material.glossiness).to.eq(2);
    expect(material.specularGlossinessTexture).to.eq(texture);

    material.specularGlossinessTexture = null;

    expect(material.specularGlossinessTexture).to.be.null;
  });

  it("clone", () => {
    const material = new PBRSpecularMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    material.specularColor = new Color(1, 0, 0, 1);
    material.glossiness = 2;
    material.specularGlossinessTexture = texture;

    const clone = material.clone();

    expect(clone.specularColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(clone.glossiness).to.eq(2);
    expect(clone.specularGlossinessTexture).to.eq(material.specularGlossinessTexture);
  });
});
