import { BlendOperation, CompareFunction, CullMode, RenderStateElementKey } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { PBRSource, registerIncludes } from "@galacean/engine-shader-shaderlab";
import { ShaderLab as ShaderLabRelease } from "@galacean/engine-shaderlab";
import { ShaderLab as ShaderLabVerbose } from "@galacean/engine-shaderlab/verbose";
import { glslValidate } from "./ShaderValidate";

import { WebGLEngine, Logger } from "@galacean/engine";
import { IShaderSource } from "@galacean/engine-design";
import { server } from "@vitest/browser/context";
import { beforeAll, describe, expect, it } from "vitest";
const { readFile } = server.commands;
Logger.enable();
function toString(v: Color): string {
  return `Color(${v.r}, ${v.g}, ${v.b}, ${v.a})`;
}

const shaderLabVerbose = new ShaderLabVerbose();
const shaderLabRelease = new ShaderLabRelease();

describe("ShaderLab", async () => {
  let shader: IShaderSource;
  let subShader: IShaderSource["subShaders"][number];
  let passList: IShaderSource["subShaders"][number]["passes"];
  let pass1: IShaderSource["subShaders"][number]["passes"][number];
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });

  beforeAll(() => {
    shader = shaderLabVerbose._parseShaderSource(PBRSource);
    subShader = shader.subShaders[0];
    passList = subShader.passes;
    expect(passList[0].isUsePass).to.be.true;
    expect(passList[1].name).eq("Forward Pass");
    pass1 = passList[1];
    registerIncludes();
  });

  it("create shaderLab", async () => {
    expect(shaderLabVerbose).not.be.null;
  });

  it("shader name", () => {
    expect(shader.name).to.equal("PBRShaderName");
    expect(subShader.name).to.equal("Default");
    expect(pass1.name).to.equal("Forward Pass");
    expect(passList.length).to.eq(2);
  });

  it("render state", () => {
    expect(pass1.renderStates).not.be.null;

    const { constantMap, variableMap } = pass1.renderStates;
    expect(Object.values(variableMap).includes("renderQueueType")).to.be.true;

    // expect(constantMap).not.be.null;
    // expect(toString(constantMap[RenderStateElementKey.BlendStateBlendColor] as Color)).eq("Color(1, 1, 1, 1)");

    // expect(constantMap).include({
    //   // Stencil State
    //   [RenderStateElementKey.StencilStateEnabled]: true,
    //   [RenderStateElementKey.StencilStateMask]: 1.3,
    //   [RenderStateElementKey.StencilStateWriteMask]: 0.32,
    //   [RenderStateElementKey.StencilStateCompareFunctionFront]: CompareFunction.Less,
    //   // Blend State
    //   [RenderStateElementKey.BlendStateEnabled0]: true,
    //   [RenderStateElementKey.BlendStateColorWriteMask0]: 0.8,
    //   [RenderStateElementKey.BlendStateAlphaBlendOperation0]: BlendOperation.Max,

    //   // Depth State
    //   [RenderStateElementKey.DepthStateEnabled]: true,
    //   [RenderStateElementKey.DepthStateWriteEnabled]: false,
    //   [RenderStateElementKey.DepthStateCompareFunction]: CompareFunction.Greater,

    //   // Raster State
    //   [RenderStateElementKey.RasterStateCullMode]: CullMode.Front,
    //   [RenderStateElementKey.RasterStateDepthBias]: 0.1,
    //   [RenderStateElementKey.RasterStateSlopeScaledDepthBias]: 0.8
    // });

    expect(variableMap).include({
      [RenderStateElementKey.BlendStateSourceAlphaBlendFactor0]: "sourceAlphaBlendFactor"
    });
  });

  // it("shader tags", () => {
  //   expect(subShader.tags).not.be.undefined;
  //   expect(subShader.tags).include({
  //     LightMode: "ForwardBase"
  //   });
  //   expect(pass1.tags).include({
  //     ReplacementTag: "Opaque",
  //     pipelineStage: "DepthOnly"
  //   });
  // });

  it("engine shader", async () => {
    glslValidate(engine, PBRSource, shaderLabVerbose);
    glslValidate(engine, PBRSource, shaderLabRelease);
  });

  it("planarShadow shader", async () => {
    const demoShader = await readFile("./shaders/planarShadow.shader");
    glslValidate(engine, demoShader, shaderLabVerbose);
    glslValidate(engine, demoShader, shaderLabRelease);
  });

  it("Empty macro shader", async () => {
    const demoShader = await readFile("./shaders/triangle.shader");
    glslValidate(engine, demoShader, shaderLabVerbose);
    glslValidate(engine, demoShader, shaderLabRelease);
  });

  it("No frag shader args", async () => {
    const demoShader = await readFile("./shaders/noFragArgs.shader");
    glslValidate(engine, demoShader, shaderLabVerbose);
    glslValidate(engine, demoShader, shaderLabRelease);
  });

  it("water full shader(complex)", async () => {
    const demoShader = await readFile("./shaders/waterfull.shader");
    glslValidate(engine, demoShader, shaderLabVerbose);
    glslValidate(engine, demoShader, shaderLabRelease);
  });

  it("glass shader", async () => {
    const demoShader = await readFile("./shaders/glass.shader");
    glslValidate(engine, demoShader, shaderLabVerbose);
    glslValidate(engine, demoShader, shaderLabRelease);
  });

  it("template shader", async () => {
    const demoShader = await readFile("./shaders/template.shader");
    glslValidate(engine, demoShader, shaderLabVerbose);
    glslValidate(engine, demoShader, shaderLabRelease);
  });

  // it("multi-pass", async () => {
  //   const shaderSource = await readFile("./shaders/multi-pass.shader");
  //   debugger;
  //   glslValidate(engine, shaderSource, shaderLabVerbose);
  //   glslValidate(engine, shaderSource, shaderLabRelease);
  // });

  // it("macro-with-preprocessor", async () => {
  //   const shaderSource = await readFile("./shaders/macro-pre.shader");
  //   glslValidate(engine, shaderSource, shaderLabVerbose);
  //   glslValidate(engine, shaderSource, shaderLabRelease);
  // });

  it("mrt-normal", async () => {
    const shaderSource = await readFile("./shaders/mrt-normal.shader");
    glslValidate(engine, shaderSource, shaderLabVerbose, {});
    glslValidate(engine, shaderSource, shaderLabRelease, {});
  });

  it("mrt-struct", async () => {
    const shaderSource = await readFile("./shaders/mrt-struct.shader");
    glslValidate(engine, shaderSource, shaderLabVerbose, {});
    glslValidate(engine, shaderSource, shaderLabVerbose, {});
  });
});
