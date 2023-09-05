import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Texture2D, PBRMaterial } from "@galacean/engine-core";
import { expect } from "chai";

describe("PBRMaterial",  () => {
  let engine: WebGLEngine;
   before(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("pbr 参数测试", () => {
    const material = new PBRMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    expect(material.metallic).to.eq(1);
    expect(material.roughness).to.eq(1);
    expect(material.roughnessMetallicTexture).to.be.undefined;

    material.metallic = 2;
    material.roughness = 2;
    material.roughnessMetallicTexture = texture;

    expect(material.metallic).to.eq(2);
    expect(material.roughness).to.eq(2);
    expect(material.roughnessMetallicTexture).to.eq(texture);

    material.roughnessMetallicTexture = null;

    expect(material.roughnessMetallicTexture).to.be.null;
  });

  it("clone", () => {
    const material = new PBRMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    material.metallic = 2;
    material.roughness = 2;
    material.roughnessMetallicTexture = texture;

    const clone = material.clone();

    expect(clone.metallic).to.eq(2);
    expect(clone.roughness).to.eq(2);
    expect(clone.roughnessMetallicTexture).to.eq(material.roughnessMetallicTexture);
  });
});
