import {
  BaseMaterial,
  BlendFactor,
  BlendMode,
  CullMode,
  RenderFace,
  RenderQueueType,
  Shader,
  ShaderMacro
} from "@galacean/engine-core";
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
      const dest = new TestMaterial(this.engine);
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

  it("isTransparent with alphaCutoff", () => {
    const material = new TestMaterial(engine);

    // setIsTransparent(true) -> Transparent
    material.isTransparent = true;
    expect(material.shaderData.getInt("renderQueueType")).to.eq(RenderQueueType.Transparent);

    // setIsTransparent(false) with alphaCutoff = 0 -> Opaque
    material.alphaCutoff = 0;
    material.isTransparent = false;
    expect(material.shaderData.getInt("renderQueueType")).to.eq(RenderQueueType.Opaque);

    // setIsTransparent(false) with alphaCutoff > 0 -> AlphaTest
    material.alphaCutoff = 0.5;
    material.isTransparent = false;
    expect(material.shaderData.getInt("renderQueueType")).to.eq(RenderQueueType.AlphaTest);
  });

  it("blendMode", () => {
    const material = new TestMaterial(engine);

    // BlendMode.Normal
    material.blendMode = BlendMode.Normal;
    expect(material.shaderData.getInt("sourceColorBlendFactor")).to.eq(BlendFactor.SourceAlpha);
    expect(material.shaderData.getInt("destinationColorBlendFactor")).to.eq(BlendFactor.OneMinusSourceAlpha);
    expect(material.shaderData.getInt("sourceAlphaBlendFactor")).to.eq(BlendFactor.One);
    expect(material.shaderData.getInt("destinationAlphaBlendFactor")).to.eq(BlendFactor.OneMinusSourceAlpha);

    // BlendMode.Additive
    material.blendMode = BlendMode.Additive;
    expect(material.shaderData.getInt("sourceColorBlendFactor")).to.eq(BlendFactor.SourceAlpha);
    expect(material.shaderData.getInt("destinationColorBlendFactor")).to.eq(BlendFactor.One);
    expect(material.shaderData.getInt("sourceAlphaBlendFactor")).to.eq(BlendFactor.Zero);
    expect(material.shaderData.getInt("destinationAlphaBlendFactor")).to.eq(BlendFactor.One);
  });

  it("isTransparent shadowCaster and depthOnly queues", () => {
    const material = new TestMaterial(engine);
    const shadowCasterProp = "material_ShadowCasterRenderQueue";
    const depthOnlyProp = "material_DepthOnlyRenderQueue";

    // isTransparent = true -> shadowCaster=AlphaTest, depthOnly=Transparent
    material.isTransparent = true;
    expect(material.shaderData.getFloat(shadowCasterProp)).to.eq(RenderQueueType.AlphaTest);
    expect(material.shaderData.getFloat(depthOnlyProp)).to.eq(RenderQueueType.Transparent);

    // isTransparent = false with alphaCutoff = 0 -> shadowCaster=Opaque, depthOnly=Opaque
    material.alphaCutoff = 0;
    material.isTransparent = false;
    expect(material.shaderData.getFloat(shadowCasterProp)).to.eq(RenderQueueType.Opaque);
    expect(material.shaderData.getFloat(depthOnlyProp)).to.eq(RenderQueueType.Opaque);

    // isTransparent = false with alphaCutoff > 0 -> shadowCaster=AlphaTest, depthOnly=AlphaTest
    material.alphaCutoff = 0.5;
    material.isTransparent = true; // flip to trigger the _seIsTransparent branch on next change
    material.isTransparent = false;
    expect(material.shaderData.getFloat(shadowCasterProp)).to.eq(RenderQueueType.AlphaTest);
    expect(material.shaderData.getFloat(depthOnlyProp)).to.eq(RenderQueueType.AlphaTest);
  });

  it("alphaCutoff macro and render queues", () => {
    const material = new TestMaterial(engine);
    const alphaCutoffMacro = ShaderMacro.getByName("MATERIAL_IS_ALPHA_CUTOFF");
    const shadowCasterProp = "material_ShadowCasterRenderQueue";
    const depthOnlyProp = "material_DepthOnlyRenderQueue";
    // @ts-ignore
    const isAlphaCutoffEnabled = () => material.shaderData._macroCollection.isEnable(alphaCutoffMacro);

    // Initial state: alphaCutoff = 0, macro disabled
    expect(isAlphaCutoffEnabled()).to.eq(false);

    // alphaCutoff > 0 with isTransparent = false -> macro on, forward=AlphaTest, shadowCaster=AlphaTest, depthOnly=AlphaTest
    material.alphaCutoff = 0.5;
    expect(isAlphaCutoffEnabled()).to.eq(true);
    expect(material.shaderData.getInt("renderQueueType")).to.eq(RenderQueueType.AlphaTest);
    expect(material.shaderData.getFloat(shadowCasterProp)).to.eq(RenderQueueType.AlphaTest);
    expect(material.shaderData.getFloat(depthOnlyProp)).to.eq(RenderQueueType.AlphaTest);

    // alphaCutoff > 0 with isTransparent = true -> forward=Transparent, shadowCaster=AlphaTest, depthOnly=Transparent
    material.isTransparent = true;
    material.alphaCutoff = 0.8;
    expect(material.shaderData.getInt("renderQueueType")).to.eq(RenderQueueType.Transparent);
    expect(material.shaderData.getFloat(shadowCasterProp)).to.eq(RenderQueueType.AlphaTest);
    expect(material.shaderData.getFloat(depthOnlyProp)).to.eq(RenderQueueType.Transparent);

    // alphaCutoff = 0 with isTransparent = true -> macro off, forward=Transparent, shadowCaster=AlphaTest, depthOnly=Transparent
    material.alphaCutoff = 0;
    expect(isAlphaCutoffEnabled()).to.eq(false);
    expect(material.shaderData.getInt("renderQueueType")).to.eq(RenderQueueType.Transparent);
    expect(material.shaderData.getFloat(shadowCasterProp)).to.eq(RenderQueueType.AlphaTest);
    expect(material.shaderData.getFloat(depthOnlyProp)).to.eq(RenderQueueType.Transparent);

    // alphaCutoff = 0 with isTransparent = false -> macro off, forward=Opaque, shadowCaster=Opaque, depthOnly=Opaque
    material.isTransparent = false;
    material.alphaCutoff = 0.3; // prime it to != 0 so the next set triggers branch
    material.alphaCutoff = 0;
    expect(isAlphaCutoffEnabled()).to.eq(false);
    expect(material.shaderData.getInt("renderQueueType")).to.eq(RenderQueueType.Opaque);
    expect(material.shaderData.getFloat(shadowCasterProp)).to.eq(RenderQueueType.Opaque);
    expect(material.shaderData.getFloat(depthOnlyProp)).to.eq(RenderQueueType.Opaque);
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

  it("clone via BaseMaterial.clone()", () => {
    const material = new BaseMaterial(engine, Shader.find("BlinnPhong"));
    material.alphaCutoff = 0.3;
    material.renderFace = RenderFace.Back;

    const cloned = material.clone();

    expect(cloned).to.be.instanceOf(BaseMaterial);
    expect(cloned.alphaCutoff).to.eq(0.3);
    expect(cloned.renderFace).to.eq(RenderFace.Back);
    expect(cloned.name).to.eq("BlinnPhong(Clone)");
  });
});
