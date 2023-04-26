import { Color, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { BlinnPhongMaterial, Texture2D } from "@galacean/engine-core";
import { expect } from "chai";

describe("BlinnPhongMaterial",  () => {
  let engine: WebGLEngine;
  before(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("参数测试", () => {
    const material = new BlinnPhongMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    expect(material.baseColor).to.deep.eq(new Color(1, 1, 1, 1));
    expect(material.specularColor).to.deep.eq(new Color(1, 1, 1, 1));
    expect(material.emissiveColor).to.deep.eq(new Color(0, 0, 0, 1));
    expect(material.baseTexture).to.be.undefined;
    expect(material.specularTexture).to.be.undefined;
    expect(material.emissiveTexture).to.be.undefined;
    expect(material.normalTexture).to.be.undefined;
    expect(material.normalIntensity).to.eq(1);
    expect(material.shininess).to.eq(16);
    expect(material.tilingOffset).to.deep.eq(new Vector4(1, 1, 0, 0));

    material.baseColor.set(1, 0, 0, 1);
    material.specularColor.set(1, 0, 0, 1);
    material.emissiveColor.set(1, 0, 0, 1);
    material.baseTexture = texture;
    material.specularTexture = texture;
    material.emissiveTexture = texture;
    material.normalTexture = texture;
    material.normalIntensity = 2;
    material.shininess = 32;
    material.tilingOffset.set(1, 1, 1, 1);

    expect(material.baseColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(material.specularColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(material.emissiveColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(material.baseTexture).to.eq(texture);
    expect(material.specularTexture).to.eq(texture);
    expect(material.emissiveTexture).to.eq(texture);
    expect(material.normalTexture).to.eq(texture);
    expect(material.normalIntensity).to.eq(2);
    expect(material.shininess).to.eq(32);
    expect(material.tilingOffset).to.deep.eq(new Vector4(1, 1, 1, 1));

    material.baseTexture = null;
    material.specularTexture = null;
    material.emissiveTexture = null;
    material.normalTexture = null;
    material.shininess = 0;

    expect(material.baseTexture).to.be.null;
    expect(material.specularTexture).to.be.null;
    expect(material.emissiveTexture).to.be.null;
    expect(material.normalTexture).to.be.null;
    expect(material.shininess).to.eq(1e-4);
  });

  it("clone", () => {
    const material = new BlinnPhongMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    material.baseColor = new Color(1, 0, 0, 1);
    material.specularColor = new Color(1, 0, 0, 1);
    material.emissiveColor = new Color(1, 0, 0, 1);
    material.baseTexture = texture;
    material.specularTexture = texture;
    material.emissiveTexture = texture;
    material.normalTexture = texture;
    material.normalIntensity = 2;
    material.shininess = 32;
    material.tilingOffset = new Vector4(1, 1, 1, 1);

    const clone = material.clone();

    expect(clone.baseColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(clone.specularColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(clone.emissiveColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(clone.baseTexture).to.eq(material.baseTexture);
    expect(clone.specularTexture).to.eq(material.specularTexture);
    expect(clone.emissiveTexture).to.eq(material.emissiveTexture);
    expect(clone.normalTexture).to.eq(material.normalTexture);
    expect(clone.normalIntensity).to.eq(2);
    expect(clone.shininess).to.eq(32);
    expect(clone.tilingOffset).to.deep.eq(new Vector4(1, 1, 1, 1));
  });
});
