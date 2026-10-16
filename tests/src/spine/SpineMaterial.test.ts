import { describe, beforeAll, expect, it } from "vitest";
import { BlendFactor, Shader, ShaderProperty, WebGLEngine } from "@galacean/engine";
import { SpineMaterial } from "../../../packages/spine/src/renderer/SpineMaterial";
import { SpineBlendMode } from "../../../packages/spine/src/enums/SpineBlendMode";

describe("SpineMaterial", () => {
  let engine: WebGLEngine;
  const srcColor = ShaderProperty.getByName("sourceColorBlendFactor");
  const dstColor = ShaderProperty.getByName("destinationColorBlendFactor");

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("uses the built-in 2D/Spine shader and defaults to Normal blend", () => {
    const material = new SpineMaterial(engine);
    expect(material.shader).to.equal(Shader.find("2D/Spine"));
    expect(material._getBlendMode()).to.equal(SpineBlendMode.Normal);
  });

  it("additive blend sets source=SourceAlpha, destination=One", () => {
    const material = new SpineMaterial(engine);
    material._setBlendMode(SpineBlendMode.Additive, false);
    expect(material._getBlendMode()).to.equal(SpineBlendMode.Additive);
    expect(material.shaderData.getInt(srcColor)).to.equal(BlendFactor.SourceAlpha);
    expect(material.shaderData.getInt(dstColor)).to.equal(BlendFactor.One);
  });

  it("premultipliedAlpha switches the source color factor to One", () => {
    const material = new SpineMaterial(engine);
    material._setBlendMode(SpineBlendMode.Normal, true);
    expect(material.shaderData.getInt(srcColor)).to.equal(BlendFactor.One);
    material._setBlendMode(SpineBlendMode.Normal, false);
    expect(material.shaderData.getInt(srcColor)).to.equal(BlendFactor.SourceAlpha);
  });
});
