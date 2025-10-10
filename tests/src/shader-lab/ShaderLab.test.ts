import {
  BlendFactor,
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

    // Test traditional syntax (first pass)
    const pass0 = passList[0];
    const { constantMap: constantMap0, variableMap: variableMap0 } = pass0.renderStates;

    expect(constantMap0).not.be.empty;
    expect(variableMap0).not.be.empty;
    expect(constantMap0[RenderStateElementKey.BlendStateBlendColor]).include({ r: 1, g: 1, b: 1, a: 1 });
    expect(constantMap0).include({
      // Inherited from Shader level
      [RenderStateElementKey.DepthStateEnabled]: true,
      // Inherited from SubShader level
      [RenderStateElementKey.BlendStateSourceColorBlendFactor0]: BlendFactor.SourceAlpha,
      // Pass level (traditional syntax)
      [RenderStateElementKey.BlendStateEnabled0]: true, // Pass overrides inherited "subShaderBlendEnabled"
      [RenderStateElementKey.BlendStateColorWriteMask0]: 0.8,
      [RenderStateElementKey.BlendStateAlphaBlendOperation0]: BlendOperation.Max,
      [RenderStateElementKey.StencilStateEnabled]: true,
      [RenderStateElementKey.StencilStateMask]: 1.3,
      [RenderStateElementKey.StencilStateWriteMask]: 0.32,
      [RenderStateElementKey.StencilStateCompareFunctionFront]: CompareFunction.Less,
      [RenderStateElementKey.StencilStatePassOperationBack]: StencilOperation.Zero
    });

    expect(variableMap0).include({
      [RenderStateElementKey.DepthStateWriteEnabled]: "depthWriteEnabled", // Pass overrides inherited "globalDepthWrite"
      [RenderStateElementKey.RenderQueueType]: "renderQueueType"
    });

    // Test syntax sugar (second pass)
    const pass1 = passList[1];
    const { constantMap: constantMap1, variableMap: variableMap1 } = pass1.renderStates;

    expect(constantMap1).not.be.empty;
    expect(variableMap1).not.be.empty;
    expect(constantMap1).include({
      // Inherited from Shader level
      [RenderStateElementKey.DepthStateEnabled]: true,
      // Inherited from SubShader level
      [RenderStateElementKey.BlendStateSourceColorBlendFactor0]: BlendFactor.SourceAlpha,
      // Pass level syntax sugar
      [RenderStateElementKey.DepthStateCompareFunction]: CompareFunction.LessEqual,
      [RenderStateElementKey.BlendStateEnabled0]: true, // Pass overrides inherited "subShaderBlendEnabled"
      [RenderStateElementKey.BlendStateDestinationColorBlendFactor0]: BlendFactor.OneMinusSourceAlpha
    });

    expect(variableMap1).include({
      [RenderStateElementKey.DepthStateWriteEnabled]: "depthWriteEnabled2" // Pass overrides inherited "globalDepthWrite"
    });

    // Test comprehensive override behavior (third pass)
    const pass2 = passList[2];
    const { constantMap: constantMap2, variableMap: variableMap2 } = pass2.renderStates;

    expect(constantMap2).not.be.empty;
    expect(variableMap2).not.be.empty;

    // Test: Variable → Constant override (DepthState)
    expect(constantMap2).include({
      [RenderStateElementKey.DepthStateWriteEnabled]: true, // Constant overrides variable
      [RenderStateElementKey.DepthStateEnabled]: true, // Constant overrides constant
      [RenderStateElementKey.DepthStateCompareFunction]: CompareFunction.Greater // New constant
    });
    expect(variableMap2[RenderStateElementKey.DepthStateWriteEnabled]).to.be.undefined; // Variable removed

    // Test: Constant → Variable override (BlendState)
    expect(variableMap2).include({
      [RenderStateElementKey.BlendStateEnabled0]: "blendEnabledVar" // Variable overrides constant
    });
    expect(constantMap2).include({
      [RenderStateElementKey.BlendStateSourceColorBlendFactor0]: BlendFactor.SourceAlpha, // Constant overrides constant
      [RenderStateElementKey.BlendStateDestinationColorBlendFactor0]: BlendFactor.OneMinusSourceAlpha // New constant
    });
    expect(constantMap2[RenderStateElementKey.BlendStateEnabled0]).to.be.undefined; // Constant removed

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
