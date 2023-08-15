import { ShaderLab } from "@galacean/engine-shader-lab";
import { CompareFunction, BlendOperation, CullMode, RenderStateDataKey } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { ISubShaderInfo, IShaderPassInfo } from "@galacean/engine-design";
import { glslValidate } from "./ShaderValidate";

import fs from "fs";
import path from "path";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);
const demoShader = fs.readFileSync(path.join(__dirname, "shaders/demo.shader")).toString();

const shaderLab = new ShaderLab();

function toString(v: Color): string {
  return `Color(${v.r}, ${v.g}, ${v.b}, ${v.a})`;
}

describe("ShaderLab", () => {
  let shader: ReturnType<typeof shaderLab.parseShader>;
  let subShader: ISubShaderInfo;
  let pass: IShaderPassInfo;

  before(() => {
    shader = shaderLab.parseShader(demoShader);
    subShader = shader.subShaders[0];
    pass = subShader.passes[0];
  });

  it("create shaderLab", async () => {
    expect(shaderLab).not.be.null;
  });

  it("shader name", () => {
    expect(shader.name).to.equal("Water");
    expect(pass.name).equal("default");
  });

  it("render state", () => {
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

  it("shader tags", () => {
    expect(subShader.tags).not.be.undefined;
    expect(subShader.tags).include({
      LightMode: "ForwardBase",
      Tag2: true,
      Tag3: 1.2
    });
    expect(pass.tags).include({
      ReplacementTag: "Opaque",
      Tag2: true,
      Tag3: 1.9
    });
  });

  it("engine shader", async () => {
    glslValidate(demoShader);
  });
});

describe("glsl syntax", () => {
  it("unlit", () => {
    const demoShader = fs.readFileSync(path.join(__dirname, "shaders/unlit.shader")).toString();
    glslValidate(demoShader);
  });
});
