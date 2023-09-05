import { Color, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { PBRMaterial, Texture2D } from "@galacean/engine-core";
import { expect } from "chai";

describe("PBRBaseMaterial",  () => {
  let engine: WebGLEngine;
  before(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("pbr base 参数测试", () => {
    const material = new PBRMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    expect(material.baseColor).to.deep.eq(new Color(1, 1, 1, 1));
    expect(material.emissiveColor).to.deep.eq(new Color(0, 0, 0, 1));
    expect(material.tilingOffset).to.deep.eq(new Vector4(1, 1, 0, 0));
    expect(material.normalTextureIntensity).to.eq(1);
    expect(material.occlusionTextureIntensity).to.eq(1);

    expect(material.baseTexture).to.be.undefined;
    expect(material.emissiveTexture).to.be.undefined;
    expect(material.normalTexture).to.be.undefined;
    expect(material.occlusionTexture).to.be.undefined;

    material.baseColor.set(1, 0, 0, 1);
    material.emissiveColor.set(1, 0, 0, 1);
    material.tilingOffset.set(1, 1, 1, 1);
    material.normalTextureIntensity = 2;
    material.occlusionTextureIntensity = 2;
    material.baseTexture = texture;
    material.emissiveTexture = texture;
    material.normalTexture = texture;
    material.occlusionTexture = texture;

    expect(material.baseColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(material.emissiveColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(material.tilingOffset).to.deep.eq(new Vector4(1, 1, 1, 1));
    expect(material.normalTextureIntensity).to.eq(2);
    expect(material.occlusionTextureIntensity).to.eq(2);
    expect(material.baseTexture).to.eq(texture);
    expect(material.emissiveTexture).to.eq(texture);
    expect(material.normalTexture).to.eq(texture);
    expect(material.occlusionTexture).to.eq(texture);

    material.baseTexture = null;
    material.emissiveTexture = null;
    material.normalTexture = null;
    material.occlusionTexture = null;

    expect(material.baseTexture).to.be.null;
    expect(material.emissiveTexture).to.be.null;
    expect(material.normalTexture).to.be.null;
    expect(material.occlusionTexture).to.be.null;
  });

  it("clone", () => {
    const material = new PBRMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    material.baseColor = new Color(1, 0, 0, 1);
    material.emissiveColor = new Color(1, 0, 0, 1);
    material.tilingOffset = new Vector4(1, 1, 1, 1);
    material.normalTextureIntensity = 2;
    material.occlusionTextureIntensity = 2;
    material.baseTexture = texture;
    material.emissiveTexture = texture;
    material.normalTexture = texture;
    material.occlusionTexture = texture;

    const clone = material.clone();

    expect(clone.baseColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(clone.emissiveColor).to.deep.eq(new Color(1, 0, 0, 1));
    expect(clone.tilingOffset).to.deep.eq(new Vector4(1, 1, 1, 1));
    expect(clone.normalTextureIntensity).to.eq(2);
    expect(clone.occlusionTextureIntensity).to.eq(2);
    expect(clone.baseTexture).to.eq(material.baseTexture);
    expect(clone.emissiveTexture).to.eq(material.emissiveTexture);
    expect(clone.normalTexture).to.eq(material.normalTexture);
    expect(clone.occlusionTexture).to.eq(material.occlusionTexture);
  });
});
