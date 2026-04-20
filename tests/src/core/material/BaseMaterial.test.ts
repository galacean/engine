import { BaseMaterial, BlendMode, CullMode, RenderFace, Shader } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { describe, beforeAll, expect, it } from "vitest";

describe("BaseMaterial", () => {
  let engine: WebGLEngine;
  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  class TestMaterial extends BaseMaterial {
    constructor(engine) {
      super(engine, Shader.find("BlinnPhong"));
    }

    clone(): TestMaterial {
      const dest = new TestMaterial(this._engine);
      this.cloneTo(dest);
      return dest;
    }
  }

  it("base 参数测试", () => {
    const material = new TestMaterial(engine);

    expect(material.alphaCutoff).to.eq(0);
    expect(material.isTransparent).to.eq(false);
    expect(material.blendMode).to.eq(BlendMode.Normal);
    expect(material.renderFace).to.eq(RenderFace.Front);

    material.alphaCutoff = 0.5;
    material.isTransparent = true;
    material.blendMode = BlendMode.Additive;
    material.renderFace = RenderFace.Double;

    expect(material.alphaCutoff).to.eq(0.5);
    expect(material.isTransparent).to.eq(true);
    expect(material.blendMode).to.eq(BlendMode.Additive);
    expect(material.renderFace).to.eq(RenderFace.Double);
  });

  it("renderFace", () => {
    const material = new TestMaterial(engine);

    expect(material.renderFace).to.eq(RenderFace.Front);

    material.renderFace = RenderFace.Back;
    expect(material.shaderData.getInt("rasterStateCullMode")).to.eq(CullMode.Front);
    material.renderFace = RenderFace.Double;
    expect(material.shaderData.getInt("rasterStateCullMode")).to.eq(CullMode.Off);
    material.renderFace = RenderFace.Front;
    expect(material.shaderData.getInt("rasterStateCullMode")).to.eq(CullMode.Back);
  });

  it("isTransparent", () => {
    const material = new TestMaterial(engine);

    expect(material.isTransparent).to.eq(false);

    material.isTransparent = true;

    expect(material.shaderData.getInt("blendEnabled")).to.eq(1);
    expect(material.shaderData.getInt("depthWriteEnabled")).to.eq(0);

    material.isTransparent = false;

    expect(material.shaderData.getInt("blendEnabled")).to.eq(0);
    expect(material.shaderData.getInt("depthWriteEnabled")).to.eq(1);
  });

  it("clone", () => {
    const material = new TestMaterial(engine);

    material.alphaCutoff = 0.5;
    material.isTransparent = true;
    material.blendMode = BlendMode.Additive;
    material.renderFace = RenderFace.Double;

    const clone = material.clone();

    expect(clone.alphaCutoff).to.eq(0.5);
    expect(clone.isTransparent).to.eq(true);
    expect(clone.blendMode).to.eq(BlendMode.Additive);
    expect(clone.renderFace).to.eq(RenderFace.Double);
  });
});
