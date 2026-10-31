import { describe, beforeAll, expect, it } from "vitest";
import { Shader, WebGLEngine } from "@galacean/engine";
import { SpineMaterial } from "../../../packages/spine/src/renderer/SpineMaterial";

describe("SpineMaterial", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("defaults to the built-in Spine shader", () => {
    expect(new SpineMaterial(engine).shader).to.equal(Shader.find("2D/Spine"));
  });

  it("preserves shader and independent user parameters when instanced", () => {
    const material = new SpineMaterial(engine, Shader.find("2D/Sprite"));
    material.shaderData.setFloat("material_SpineTestEffect", 0.5);
    const clone = material.clone();
    expect(clone).to.be.instanceOf(SpineMaterial);
    expect(clone.shader).to.equal(material.shader);
    expect(clone.shaderData.getFloat("material_SpineTestEffect")).to.equal(0.5);
    clone.shaderData.setFloat("material_SpineTestEffect", 0.8);
    expect(material.shaderData.getFloat("material_SpineTestEffect")).to.equal(0.5);
  });
});
