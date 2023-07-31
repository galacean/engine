import { ShaderLab } from "@galacean/engine-shader-lab";
import { CompareFunction, BlendOperation, CullMode, RenderStateDataKey } from "@galacean/engine-core";
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
  let gl: WebGL2RenderingContext;

  before(() => {
    shader = shaderLab.parseShader(demoShader);
    gl = canvas.getContext("webgl2");
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

    const [constantState, variableState] = pass.renderStates;
    expect(constantState).not.be.null;

    expect(toString(constantState[RenderStateDataKey.BlendStateBlendColor] as Color)).eq("Color(1, 1, 1, 1)");

    expect(constantState).include({
      // Stencil State
      [RenderStateDataKey.StencilStateEnabled]: true,
      [RenderStateDataKey.StencilStateReferenceValue]: 2,
      [RenderStateDataKey.StencilStateMask]: 1.3,
      [RenderStateDataKey.StencilStateWriteMask]: 0.32,
      [RenderStateDataKey.StencilStateCompareFunctionFront]: CompareFunction.Less,
      // Blend State
      [RenderStateDataKey.BlendStateEnabled0]: true,
      [RenderStateDataKey.BlendStateColorWriteMask0]: 0.8,
      [RenderStateDataKey.BlendStateAlphaBlendOperation0]: BlendOperation.Max,

      // Depth State
      [RenderStateDataKey.DepthStateEnabled]: true,
      [RenderStateDataKey.DepthStateWriteEnabled]: false,
      [RenderStateDataKey.DepthStateCompareFunction]: CompareFunction.Greater,

      // Raster State
      [RenderStateDataKey.RasterStateCullMode]: CullMode.Front,
      [RenderStateDataKey.RasterStateDepthBias]: 0.1,
      [RenderStateDataKey.RasterStateSlopeScaledDepthBias]: 0.8
    });

    expect(variableState).include({
      [RenderStateDataKey.BlendStateSourceAlphaBlendFactor0]: "material_SrcBlend"
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
});
