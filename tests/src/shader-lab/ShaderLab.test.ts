import {
  BlendOperation,
  CompareFunction,
  CullMode,
  RenderStateElementKey,
  StencilOperation
} from "@galacean/engine-core";
import { PBRSource, registerIncludes } from "@galacean/engine-shader";
import { ShaderLab as ShaderLabRelease } from "@galacean/engine-shaderlab";
import { ShaderLab as ShaderLabVerbose } from "@galacean/engine-shaderlab/verbose";
import { glslValidate } from "./ShaderValidate";

import { Logger, WebGLEngine } from "@galacean/engine";
import { server } from "@vitest/browser/context";
import { describe, expect, it } from "vitest";
const { readFile } = server.commands;
Logger.enable();
registerIncludes();

const shaderLabVerbose = new ShaderLabVerbose();
const shaderLabRelease = new ShaderLabRelease();

describe("ShaderLab", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });

  it("create shaderLab", async () => {
    expect(shaderLabVerbose).not.be.null;
    expect(shaderLabRelease).not.be.null;
  });

  it("PBR", async () => {
    const shader = shaderLabVerbose._parseShaderSource(PBRSource);
    const subShader = shader.subShaders[0];
    const passList = subShader.passes;
    const pass1 = passList[1];

    // shader name
    expect(shader.name).to.equal("PBRShaderName");
    expect(subShader.name).to.equal("Default");
    expect(pass1.name).to.equal("Forward Pass");
    expect(passList.length).to.eq(2);

    // Pass
    expect(passList[0].isUsePass).to.be.true;
    expect(passList[1].name).eq("Forward Pass");

    // renderState
    expect(pass1.renderStates).not.be.null;
    const { constantMap, variableMap } = pass1.renderStates;

    expect(constantMap).be.empty;
    expect(variableMap).include({
      // depth
      [RenderStateElementKey.DepthStateWriteEnabled]: "depthWriteEnabled",

      // blend
      [RenderStateElementKey.BlendStateEnabled0]: "blendEnabled",
      [RenderStateElementKey.BlendStateSourceColorBlendFactor0]: "sourceColorBlendFactor",
      [RenderStateElementKey.BlendStateDestinationColorBlendFactor0]: "destinationColorBlendFactor",
      [RenderStateElementKey.BlendStateSourceAlphaBlendFactor0]: "sourceAlphaBlendFactor",
      [RenderStateElementKey.BlendStateDestinationAlphaBlendFactor0]: "destinationAlphaBlendFactor",

      // raster
      [RenderStateElementKey.RasterStateCullMode]: "rasterStateCullMode",

      // renderQueue
      [RenderStateElementKey.RenderQueueType]: "renderQueueType"
    });

    // Compile test
    glslValidate(engine, PBRSource, shaderLabVerbose);
    glslValidate(engine, PBRSource, shaderLabRelease);

    // some material variants
    glslValidate(engine, PBRSource, shaderLabRelease, [
      { name: "MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE" },
      { name: "MATERIAL_ENABLE_IRIDESCENCE" },
      { name: "MATERIAL_ENABLE_ANISOTROPY" },
      { name: "MATERIAL_ENABLE_SHEEN" },
      { name: "MATERIAL_HAS_SHEEN_TEXTURE" },
      { name: "REFRACTION_MODE", value: "1" },
      { name: "MATERIAL_ENABLE_TRANSMISSION" },
      { name: "MATERIAL_HAS_THICKNESS" }
    ]);
  });

  it("render state", async () => {
    const demoShader = await readFile("./shaders/render-state.shader");
    const shader = shaderLabRelease._parseShaderSource(demoShader);
    const subShader = shader.subShaders[0];
    const passList = subShader.passes;
    const pass0 = passList[0];

    const { constantMap, variableMap } = pass0.renderStates;

    expect(constantMap).not.be.empty;
    expect(variableMap).not.be.empty;
    expect(constantMap[RenderStateElementKey.BlendStateBlendColor]).include({ r: 1, g: 1, b: 1, a: 1 });
    expect(constantMap).include({
      // Blend State
      [RenderStateElementKey.BlendStateEnabled0]: true,
      [RenderStateElementKey.BlendStateColorWriteMask0]: 0.8,
      [RenderStateElementKey.BlendStateAlphaBlendOperation0]: BlendOperation.Max,
      // Stencil State
      [RenderStateElementKey.StencilStateEnabled]: true,
      [RenderStateElementKey.StencilStateMask]: 1.3,
      [RenderStateElementKey.StencilStateWriteMask]: 0.32,
      [RenderStateElementKey.StencilStateCompareFunctionFront]: CompareFunction.Less,
      [RenderStateElementKey.StencilStatePassOperationBack]: StencilOperation.Zero,
      // Raster State
      [RenderStateElementKey.RasterStateCullMode]: CullMode.Front,
      [RenderStateElementKey.RasterStateDepthBias]: 0.1,
      [RenderStateElementKey.RasterStateSlopeScaledDepthBias]: 0.8
    });

    expect(variableMap).include({
      [RenderStateElementKey.DepthStateWriteEnabled]: "depthWriteEnabled",
      [RenderStateElementKey.RenderQueueType]: "renderQueueType"
    });

    // tags
    expect(subShader.tags).be.empty;
    expect(pass0.tags).include({
      LightMode: "ForwardBase",
      ReplacementTag: "Opaque",
      pipelineStage: "DepthOnly"
    });
  });

  it("No frag shader args", async () => {
    const demoShader = await readFile("./shaders/noFragArgs.shader");
    glslValidate(engine, demoShader, shaderLabRelease);
  });

  it("water full shader(complex)", async () => {
    const demoShader = await readFile("./shaders/waterfull.shader");
    glslValidate(engine, demoShader, shaderLabRelease);
  });

  it("multi-pass", async () => {
    const shaderSource = await readFile("./shaders/multi-pass.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
  });

  it("macro-with-preprocessor", async () => {
    const shaderSource = await readFile("./shaders/macro-pre.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
  });

  it("mrt-struct", async () => {
    const shaderSource = await readFile("./shaders/mrt-struct.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
  });
});
