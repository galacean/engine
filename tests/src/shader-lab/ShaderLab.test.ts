import { ShaderLab } from "@galacean/engine-shader-lab";
import { CompareFunction, BlendOperation, CullMode, RenderStateDataKey } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { ISubShaderInfo, IShaderPassInfo } from "@galacean/engine-design";

import fs from "fs";
import path from "path";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);
const demoShader = fs.readFileSync(path.join(__dirname, "demo.shader")).toString();

const shaderLab = new ShaderLab();

function toString(v: Color): string {
  return `Color(${v.r}, ${v.g}, ${v.b}, ${v.a})`;
}

function addLineNum(str: string) {
  const lines = str.split("\n");
  const limitLength = (lines.length + 1).toString().length + 6;
  let prefix;
  return lines
    .map((line, index) => {
      prefix = `0:${index + 1}`;
      if (prefix.length >= limitLength) return prefix.substring(0, limitLength) + line;

      for (let i = 0; i < limitLength - prefix.length; i++) prefix += " ";

      return prefix + line;
    })
    .join("\n");
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
    const gl = document.createElement("canvas").getContext("webgl");
    expect(!!gl, "Not support webgl").to.be.true;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);

    const fsPrefix = `#version 100
    precision mediump float;
    precision mediump int;`;
    const fsSource = fsPrefix + pass.fragmentSource;
    const vsSource = "precision mediump float;" + pass.vertexSource;

    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);

    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);

    expect(
      gl.getShaderParameter(vs, gl.COMPILE_STATUS),
      `Error compiling vertex shader: ${gl.getShaderInfoLog(vs)}\n\n${addLineNum(vsSource)}`
    ).to.be.true;
    expect(
      gl.getShaderParameter(fs, gl.COMPILE_STATUS),
      `Error compiling fragment shader: ${gl.getShaderInfoLog(fs)}\n\n${addLineNum(fsSource)}`
    ).to.be.true;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    expect(gl.getProgramParameter(program, gl.LINK_STATUS), `Error link shader: ${gl.getProgramInfoLog(program)}`).to.be
      .true;
  });
});
