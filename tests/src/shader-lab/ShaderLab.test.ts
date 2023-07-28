import { ShaderLab } from "@galacean/engine-shader-lab";
import { Shader, CompareFunction, BlendFactor, BlendOperation, CullMode } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Vector4 } from "@galacean/engine-math";

import fs from "fs";
import path from "path";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);
const demoShader = fs.readFileSync(path.join(__dirname, "demo.shader")).toString();

const shaderLab = new ShaderLab();
const canvas = document.createElement("canvas");

function toString(v: Vector4): string {
  return `vec4(${v.x}, ${v.y}, ${v.z}, ${v.w})`;
}

describe("ShaderLab", () => {
  let shader: ReturnType<typeof shaderLab.parseShader>;

  before(() => {
    shader = shaderLab.parseShader(demoShader);
  });

  it("create shaderLab", async () => {
    expect(shaderLab).not.be.null;
  });

  it("shader name", () => {
    expect(shader.name).to.equal("Water");
    const subShader = shader.subShaders[0];
    const pass = subShader.passes[0];
    expect(pass.name).equal("default");
  });

  it("render state", () => {
    const subShader = shader.subShaders[0];
    const pass = subShader.passes[0];
    expect(pass.renderStates).not.be.null;

    const stencilState = pass.renderStates[0];
    expect(stencilState).not.be.null;
    expect(stencilState.renderStateType).to.equal("StencilState");
    expect(stencilState.properties).to.have.lengthOf(6);
    expect(stencilState.properties[0]).eql({ property: "Enabled", value: true, index: undefined });
    expect(stencilState.properties[1]).eql({ property: "ReferenceValue", value: 2, index: undefined });
    expect(stencilState.properties[4]).eql({
      property: "CompareFunctionFront",
      value: CompareFunction.Less,
      index: undefined
    });

    const blendState = pass.renderStates[1];
    expect(blendState).not.be.undefined;
    expect(blendState.properties[0]).eql({ property: "Enabled", value: true, index: 2 });
    expect(blendState.properties[1]).eql({ property: "ColorWriteMask", value: 0.8, index: 2 });
    const { property, value } = blendState.properties[2];
    expect(property).equal("BlendColor");
    expect(toString(value)).equal("vec4(1, 1, 1, 1)");
    expect(blendState.properties[3]).eql({
      property: "SrcAlphaBlendFactor",
      value: BlendFactor.Zero,
      index: undefined
    });
    expect(blendState.properties[4]).eql({
      property: "AlphaBlendOperation",
      value: BlendOperation.Max,
      index: undefined
    });

    const depthState = pass.renderStates[2];
    expect(depthState).not.be.undefined;
    expect(depthState.properties[0]).eql({
      property: "Enabled",
      value: true,
      index: undefined
    });
    expect(depthState.properties[1]).eql({
      property: "WriteEnabled",
      value: false,
      index: undefined
    });
    expect(depthState.properties[2]).eql({
      property: "CompareFunction",
      value: CompareFunction.Greater,
      index: 1
    });

    const rasterState = pass.renderStates[3];
    expect(rasterState).not.be.undefined;
    expect(rasterState.properties[0]).eql({
      property: "CullMode",
      value: CullMode.Front,
      index: undefined
    });
    expect(rasterState.properties[1]).eql({
      property: "DepthBias",
      value: 0.1,
      index: undefined
    });
    expect(rasterState.properties[2]).eql({
      property: "SlopeScaledDepthBias",
      value: 0.8,
      index: undefined
    });
  });
});

describe("engine shader", () => {
  let engine: WebGLEngine;

  before(async () => {
    engine = await WebGLEngine.create({ canvas, shaderLab });
  });

  it("engine init", () => {
    expect(engine).not.be.null;
  });

  it("shader create", () => {
    const shader = Shader.create(demoShader);
    expect(shader).not.be.null;
  });
});
