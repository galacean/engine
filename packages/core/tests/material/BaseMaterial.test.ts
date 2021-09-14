// @ts-nocheck
import { WebGLEngine } from "../../../rhi-webgl/src/WebGLEngine";
import { BaseMaterial, BlendMode, RenderFace } from "../../src/material";
import { CullMode, Shader } from "../../src/shader";

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

    expect(material.alphaCutoff).toBe(0);
    expect(material.isTransparent).toBe(false);
    expect(material.blendMode).toBe(BlendMode.Normal);
    expect(material.renderFace).toBe(RenderFace.Front);

    material.alphaCutoff = 0.5;
    material.isTransparent = true;
    material.blendMode = BlendMode.Additive;
    material.renderFace = RenderFace.Double;

    expect(material.alphaCutoff).toBe(0.5);
    expect(material.isTransparent).toBe(true);
    expect(material.blendMode).toBe(BlendMode.Additive);
    expect(material.renderFace).toBe(RenderFace.Double);
  });

  it("renderFace", () => {
    const material = new TestMaterial(engine);

    material.renderFace = RenderFace.Front;
    expect(material.renderState.rasterState.cullMode).toBe(CullMode.Back);
    material.renderFace = RenderFace.Back;
    expect(material.renderState.rasterState.cullMode).toBe(CullMode.Front);
    material.renderFace = RenderFace.Double;
    expect(material.renderState.rasterState.cullMode).toBe(CullMode.Off);
  });

  it("isTransparent", () => {
    const material = new TestMaterial(engine);

    expect(material.renderState.blendState.targetBlendState.enabled).toBeFalsy();
    expect(material.renderState.depthState.writeEnabled).toBeTruthy();

    material.isTransparent = true;

    expect(material.renderState.blendState.targetBlendState.enabled).toBeTruthy();
    expect(material.renderState.depthState.writeEnabled).toBeFalsy();
  });

  it("clone", () => {
    const material = new TestMaterial(engine);

    material.alphaCutoff = 0.5;
    material.isTransparent = true;
    material.blendMode = BlendMode.Additive;
    material.renderFace = RenderFace.Double;

    const clone = material.clone();

    expect(clone.alphaCutoff).toBe(0.5);
    expect(clone.isTransparent).toBe(true);
    expect(clone.blendMode).toBe(BlendMode.Additive);
    expect(clone.renderFace).toBe(RenderFace.Double);
  });
});
