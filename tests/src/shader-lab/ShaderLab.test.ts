import {
  BlendFactor,
  BlendOperation,
  ColorWriteMask,
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
import { describe, expect, it, vi } from "vitest";
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
    const pass1 = passList[2];

    // shader name
    expect(shader.name).to.equal("PBRShaderName");
    expect(subShader.name).to.equal("Default");
    expect(pass1.name).to.equal("Forward Pass");
    expect(passList.length).to.eq(3);

    // Pass
    expect(passList[0].isUsePass).to.be.true;
    expect(passList[1].isUsePass).to.be.true;
    expect(passList[2].name).eq("Forward Pass");

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
      [RenderStateElementKey.BlendStateColorWriteMask0]:
        ColorWriteMask.Red | ColorWriteMask.Green | ColorWriteMask.Blue,
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
      [RenderStateElementKey.DepthStateWriteEnabled]: "depthWriteEnabled2", // Pass overrides inherited "globalDepthWrite"
      // ColorWriteMask variable declaration
      [RenderStateElementKey.BlendStateColorWriteMask0]: "colorWriteMaskVar"
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

  it("render state error - bitwise OR on non-bitmask enum", async () => {
    const shaderSource = `Shader "test" {
      SubShader "Default" {
        Pass "0" {
          DepthState = {
            CompareFunction = CompareFunction.Less | CompareFunction.Greater;
          }
        }
      }
    }`;
    const result = shaderLabVerbose._parseShaderSource(shaderSource);
    const pass = result.subShaders[0].passes[0];
    // CompareFunction should not appear in constantMap because bitwise OR is not allowed on non-bitmask enums
    expect(pass.renderStates.constantMap[RenderStateElementKey.DepthStateCompareFunction]).to.be.undefined;
  });

  it("render state error - mixed enum types in bitwise OR", async () => {
    const shaderSource = `Shader "test" {
      SubShader "Default" {
        Pass "0" {
          BlendState = {
            ColorWriteMask[0] = ColorWriteMask.Red | BlendFactor.One;
          }
        }
      }
    }`;
    const result = shaderLabVerbose._parseShaderSource(shaderSource);
    const pass = result.subShaders[0].passes[0];
    // Mixed enum types should be rejected
    expect(pass.renderStates.constantMap[RenderStateElementKey.BlendStateColorWriteMask0]).to.be.undefined;
  });

  it("render state error - invalid syntax after bitwise OR", async () => {
    const shaderSource = `Shader "test" {
      SubShader "Default" {
        Pass "0" {
          BlendState = {
            ColorWriteMask[0] = ColorWriteMask.Red | invalidToken;
          }
        }
      }
    }`;
    const result = shaderLabVerbose._parseShaderSource(shaderSource);
    const pass = result.subShaders[0].passes[0];
    // ColorWriteMask should not appear in constantMap due to invalid syntax after '|'
    expect(pass.renderStates.constantMap[RenderStateElementKey.BlendStateColorWriteMask0]).to.be.undefined;
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

  it("macro-negate-number (!0, !1 in #if expressions)", async () => {
    const shaderSource = await readFile("./shaders/macro-negate-number.shader");
    glslValidate(engine, shaderSource, shaderLabVerbose);
    glslValidate(engine, shaderSource, shaderLabRelease);
  });

  it("mrt-struct", async () => {
    const shaderSource = await readFile("./shaders/mrt-struct.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
  });

  it("define-struct-access-global (global #define with struct member access)", async () => {
    const shaderSource = await readFile("./shaders/define-struct-access-global.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);

    const shader = shaderLabVerbose._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex, fragment } = shaderLabVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0,
      ""
    )!;

    const expectedVert = await readFile("./expected/define-struct-access-global.vert.glsl");
    const expectedFrag = await readFile("./expected/define-struct-access-global.frag.glsl");
    expect(vertex).to.equal(expectedVert);
    expect(fragment).to.equal(expectedFrag);
  });

  it("define-struct-access (function-body #define with struct member access)", async () => {
    const shaderSource = await readFile("./shaders/define-struct-access.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);

    const shader = shaderLabVerbose._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex, fragment } = shaderLabVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0,
      ""
    )!;

    const expectedVert = await readFile("./expected/define-struct-access.vert.glsl");
    const expectedFrag = await readFile("./expected/define-struct-access.frag.glsl");
    expect(vertex).to.equal(expectedVert);
    expect(fragment).to.equal(expectedFrag);
  });

  it("macro-member-access-builtin-arg (Cocos FSInput pattern: member access macro as builtin fn arg)", async () => {
    const shaderSource = await readFile("./shaders/macro-member-access-builtin-arg.shader");

    // Regression guard: before the preprocessor/AST deduplication fix, each
    // AST-form member-access macro (e.g. `#define FSInput_worldNormal v.v_normal.xyz`)
    // fired a spurious "has an unrecognized value" warning on every access.
    const warnSpy = vi.spyOn(Logger, "warn");
    try {
      glslValidate(engine, shaderSource, shaderLabRelease);

      // Also verify verbose mode (semantic analysis) succeeds — this was the original bug:
      // member access macros resolved to struct type "Varyings" instead of TypeAny,
      // causing builtin overload matching to fail.
      const shader = shaderLabVerbose._parseShaderSource(shaderSource);
      const passSource = shader.subShaders[0].passes[0];
      const { vertex, fragment } = shaderLabVerbose._parseShaderPass(
        passSource.contents,
        passSource.vertexEntry,
        passSource.fragmentEntry,
        0,
        ""
      )!;

      expect(vertex).to.be.a("string").and.not.empty;
      expect(fragment).to.be.a("string").and.not.empty;

      // Verify key builtins are present in output (macros expanded correctly)
      expect(fragment).to.contain("normalize");
      expect(fragment).to.contain("dot");
      expect(fragment).to.contain("texture2D");

      const unrecognizedCalls = warnSpy.mock.calls.filter((args) =>
        args.some((a) => typeof a === "string" && a.includes("unrecognized value"))
      );
      expect(unrecognizedCalls).to.have.lengthOf(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("global-varying-var (Cocos VSOutput pattern: global Varyings var with #define macros)", async () => {
    const shaderSource = await readFile("./shaders/global-varying-var.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);

    // Verify verbose mode: global "Varyings o;" should not produce "uniform Varyings o;"
    // and should not duplicate varying declarations.
    const shader = shaderLabVerbose._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex, fragment } = shaderLabVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0,
      ""
    )!;

    expect(vertex).to.be.a("string").and.not.empty;
    expect(fragment).to.be.a("string").and.not.empty;

    // No "uniform Varyings o;" in output
    expect(vertex).to.not.contain("uniform Varyings");
    expect(fragment).to.not.contain("uniform Varyings");

    // Macros should be transformed: "o.v_worldPos" → "v_worldPos"
    expect(vertex).to.contain("#define VSOutput_worldPos v_worldPos");
    expect(vertex).to.contain("#define VSOutput_worldNormal v_normal.xyz");

    // No duplicate varying declarations
    const varyingMatches = vertex.match(/varying vec3 v_worldPos/g);
    expect(varyingMatches).to.have.lengthOf(1);
  });

  it("define-ctor-with-member (constructor-style macro with struct member access)", async () => {
    const shaderSource = await readFile("./shaders/define-ctor-with-member.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("paren-define (object-like with space-before-paren vs function-like without space)", async () => {
    const shaderSource = await readFile("./shaders/paren-define-repro.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("macro-call-struct-arg (struct-member access as function-like macro arg)", async () => {
    const shaderSource = await readFile("./shaders/macro-call-struct-arg-repro.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("non-expression-define (replacement list is not an expression)", async () => {
    const shaderSource = await readFile("./shaders/non-expression-define-repro.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("type-alias-repro (FXAA-style portability macros aliasing GLSL types)", async () => {
    const shaderSource = await readFile("./shaders/type-alias-repro.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("type-alias-sampler-only (sampler2D alias alone — should pass via legacy path)", async () => {
    const shaderSource = await readFile("./shaders/type-alias-sampler-only.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("digit-ending-id-repro (struct field ending in digit: v0.xyz, uv1.xy)", async () => {
    const shaderSource = await readFile("./shaders/digit-ending-id-repro.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("paren-member-access-repro (inline (v).v_uv release-mode flatten)", async () => {
    const shaderSource = await readFile("./shaders/paren-member-access-repro.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("define-in-comment-repro (Issue 2980 ex.1: regex must not false-positive on /* #define */)", async () => {
    const shaderSource = await readFile("./shaders/define-in-comment-repro.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("define-line-continuation-repro (Issue 2980 ex.2: \\-continuation in #define value)", async () => {
    const shaderSource = await readFile("./shaders/define-line-continuation-repro.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("define-comment-in-peek (block comment between macro name and value)", async () => {
    const shaderSource = await readFile("./shaders/define-comment-in-peek.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("frag-return-vec4 (Cocos pattern: fragment entry returns vec4 instead of void)", async () => {
    const shaderSource = await readFile("./shaders/frag-return-vec4.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("texture-generic (GVec4 → vec4 resolve)", async () => {
    const shaderSource = await readFile("./shaders/texture-generic.shader");
    glslValidate(engine, shaderSource, shaderLabVerbose);
    glslValidate(engine, shaderSource, shaderLabRelease);
  });

  it("generic-return-type (builtin generic return as arg to user function)", async () => {
    const shaderSource = await readFile("./shaders/generic-return-type.shader");
    glslValidate(engine, shaderSource, shaderLabVerbose);
    glslValidate(engine, shaderSource, shaderLabRelease);
  });

  it("define-nested-ifdef (branch stack: nested #ifdef registers entries under combined signatures)", async () => {
    const shaderSource = await readFile("./shaders/define-nested-ifdef.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);
  });

  it("define-branch-scoped-ast (per-branch filtering: same flag, both AST forms, different members)", async () => {
    const shaderSource = await readFile("./shaders/define-branch-scoped-ast.shader");
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);

    // Default macro state activates the `#else` branch — codegen must reference
    // `v_tangent`, not `v_normal`, in the macro substitution path.
    const shader = shaderLabVerbose._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { fragment } = shaderLabVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0,
      ""
    )!;
    expect(fragment).to.contain("v_tangent");
    // The output preserves `#ifdef` so both members may textually appear in the
    // GLSL (driver picks one). What matters is that the AST-path substitution
    // for the call site uses the correct branch's value — `v_tangent`.
  });

  it("define-mixed-form-repro (Issue 2980 nit: AST/legacy mixed across #ifdef branches must not pollute call-site type)", async () => {
    const shaderSource = await readFile("./shaders/define-mixed-form-repro.shader");

    // Both branches of the mixed `#define LIGHT_INPUT` are legal GLSL on their
    // own. The bug was that `MacroCallSymbol.hasAstValue` used `.some(...)`,
    // setting the flag whenever *any* branch was AST-form, which silently
    // disabled call-site type inference and stranded `TypeAny` whenever the
    // legacy branch was active. Fix: switch to `.every(...)` so mixed forms
    // fall back to legacy `referenceSymbolNames`-based inference.
    glslValidate(engine, shaderSource, shaderLabRelease);
    glslValidate(engine, shaderSource, shaderLabVerbose);

    // Default macro state activates the legacy branch — generated GLSL must
    // reference `u_globalLightDir`, not the AST-form `v.v_normal` substitution.
    const shader = shaderLabVerbose._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { fragment } = shaderLabVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0,
      ""
    )!;
    expect(fragment).to.contain("u_globalLightDir");
    expect(fragment).to.contain("normalize");
  });
});
