import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { BaseMaterial, BlendMode, RenderFace, CullMode, Shader } from "@oasis-engine/core";
import { expect } from "chai";

describe("BaseMaterial", () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);

  class TestMaterial extends BaseMaterial {
    constructor(engine) {
      super(engine, Shader.find("blinn-phong"));
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

    material.renderFace = RenderFace.Front;
    expect(material.renderState.rasterState.cullMode).to.eq(CullMode.Back);
    material.renderFace = RenderFace.Back;
    expect(material.renderState.rasterState.cullMode).to.eq(CullMode.Front);
    material.renderFace = RenderFace.Double;
    expect(material.renderState.rasterState.cullMode).to.eq(CullMode.Off);
  });

  it("isTransparent", () => {
    const material = new TestMaterial(engine);

    expect(material.renderState.blendState.targetBlendState.enabled).to.eq(false);
    expect(material.renderState.depthState.writeEnabled).to.eq(true);

    material.isTransparent = true;

    expect(material.renderState.blendState.targetBlendState.enabled).to.eq(true);
    expect(material.renderState.depthState.writeEnabled).to.eq(false);
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
