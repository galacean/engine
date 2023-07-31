import { ShaderLab } from "@galacean/engine-shader-lab";
import {
  Shader,
  CompareFunction,
  BlendFactor,
  BlendOperation,
  CullMode,
  RenderStateDataKey
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Color } from "@galacean/engine-math";

import fs from "fs";
import path from "path";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);
const demoShader = fs.readFileSync(path.join(__dirname, "demo.shader")).toString();

const shaderLab = new ShaderLab();
const canvas = document.createElement("canvas");

function toString(v: Color): string {
  return `Color(${v.r}, ${v.g}, ${v.b}, ${v.a})`;
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

    // Stencil State
    const stencilState = pass.renderStates[0];
    expect(stencilState).not.be.null;
    expect(stencilState.renderStateType).to.equal("StencilState");
    expect(stencilState.properties).to.have.lengthOf(2);

    const [stencilConstantProps, stencilVariableProps] = stencilState.properties;
    expect(stencilConstantProps).include({
      [RenderStateDataKey.StencilStateEnabled]: true,
      [RenderStateDataKey.StencilStateReferenceValue]: 2,
      [RenderStateDataKey.StencilStateMask]: 1.3,
      [RenderStateDataKey.StencilStateWriteMask]: 0.32,
      [RenderStateDataKey.StencilStateCompareFunctionFront]: CompareFunction.Less
    });

    // Blend State
    const blendState = pass.renderStates[1];
    expect(blendState).not.be.undefined;
    expect(blendState.renderStateType).to.equal("BlendState");
    const [blendConstantProps, blendVariableProps] = blendState.properties;
    expect(blendVariableProps).not.be.undefined;
    expect(toString(blendConstantProps[RenderStateDataKey.BlendStateBlendColor] as Color)).equal("Color(1, 1, 1, 1)");
    expect(blendConstantProps).include({
      [RenderStateDataKey.BlendStateEnabled0]: true,
      [RenderStateDataKey.BlendStateColorWriteMask0]: 0.8,
      [RenderStateDataKey.BlendStateAlphaBlendOperation0]: BlendOperation.Max
    });
    expect(blendVariableProps).include({
      [RenderStateDataKey.BlendStateSourceAlphaBlendFactor0]: "material_SrcBlend"
    });

    // Depth State
    const depthState = pass.renderStates[2];
    expect(depthState).not.be.undefined;
    expect(depthState.renderStateType).to.equal("DepthState");
    const [depthConstantProps, depthVariableProps] = depthState.properties;
    expect(depthConstantProps).include({
      [RenderStateDataKey.DepthStateEnabled]: true,
      [RenderStateDataKey.DepthStateWriteEnabled]: false,
      [RenderStateDataKey.DepthStateCompareFunction]: CompareFunction.Greater
    });

    // Raster State
    const rasterState = pass.renderStates[3];
    expect(rasterState).not.be.undefined;
    expect(rasterState.renderStateType).to.equal("RasterState");
    const [rasterConstantProps, rasterVariableProps] = rasterState.properties;
    expect(rasterConstantProps).include({
      [RenderStateDataKey.RasterStateCullMode]: CullMode.Front,
      [RenderStateDataKey.RasterStateDepthBias]: 0.1,
      [RenderStateDataKey.RasterStateSlopeScaledDepthBias]: 0.8
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
