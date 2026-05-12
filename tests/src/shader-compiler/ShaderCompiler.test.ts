import {
  BlendFactor,
  BlendOperation,
  ColorWriteMask,
  CompareFunction,
  CullMode,
  RenderStateElementKey,
  StencilOperation
} from "@galacean/engine-core";
import { ShaderCompiler as ShaderCompilerRelease } from "@galacean/engine-shader-compiler";
import { ShaderCompiler as ShaderCompilerVerbose } from "@galacean/engine-shader-compiler/verbose";
import { glslValidate } from "./ShaderValidate";

import { Logger, WebGLEngine } from "@galacean/engine";
import { server } from "@vitest/browser/context";
import { describe, expect, it, vi } from "vitest";
const { readFile } = server.commands;
Logger.enable();

const shaderCompilerVerbose = new ShaderCompilerVerbose();
const shaderCompilerRelease = new ShaderCompilerRelease();

describe("ShaderCompiler", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const PBRSource = await readFile("../../../packages/shader/src/Shaders/PBR.shader");

  it("create shaderCompiler", async () => {
    expect(shaderCompilerVerbose).not.be.null;
    expect(shaderCompilerRelease).not.be.null;
  });

  it("PBR", async () => {
    const shader = shaderCompilerVerbose._parseShaderSource(PBRSource);
    const subShader = shader.subShaders[0];
    const passList = subShader.passes;
    const pass1 = passList[2];

    // shader name
    expect(shader.name).to.equal("PBR");
    expect(subShader.name).to.equal("Default");
    expect(pass1.name).to.equal("Forward Pass");
    expect(passList.length).to.eq(3);

    // Pass (ShadowCaster and DepthOnly are UsePass from Utility shaders)
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
    glslValidate(engine, PBRSource, shaderCompilerVerbose);
    glslValidate(engine, PBRSource, shaderCompilerRelease);

    // some material variants
    glslValidate(engine, PBRSource, shaderCompilerRelease, [
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
    const shader = shaderCompilerRelease._parseShaderSource(demoShader);
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
    const result = shaderCompilerVerbose._parseShaderSource(shaderSource);
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
    const result = shaderCompilerVerbose._parseShaderSource(shaderSource);
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
    const result = shaderCompilerVerbose._parseShaderSource(shaderSource);
    const pass = result.subShaders[0].passes[0];
    // ColorWriteMask should not appear in constantMap due to invalid syntax after '|'
    expect(pass.renderStates.constantMap[RenderStateElementKey.BlendStateColorWriteMask0]).to.be.undefined;
  });

  it("No frag shader args", async () => {
    const demoShader = await readFile("./shaders/noFragArgs.shader");
    glslValidate(engine, demoShader, shaderCompilerRelease);
  });

  it("water full shader(complex)", async () => {
    const demoShader = await readFile("./shaders/waterfull.shader");
    glslValidate(engine, demoShader, shaderCompilerRelease);
  });

  it("multi-pass", async () => {
    const shaderSource = await readFile("./shaders/multi-pass.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("macro-with-preprocessor", async () => {
    const shaderSource = await readFile("./shaders/macro-pre.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("macro-negate-number (!0, !1 in #if expressions)", async () => {
    const shaderSource = await readFile("./shaders/macro-negate-number.shader");
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("mrt-struct", async () => {
    const shaderSource = await readFile("./shaders/mrt-struct.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-struct-access-global (global #define with struct member access)", async () => {
    const shaderSource = await readFile("./shaders/define-struct-access-global.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);

    const shader = shaderCompilerVerbose._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex, fragment } = shaderCompilerVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0
    )!;

    const expectedVert = await readFile("./expected/define-struct-access-global.vert.glsl");
    const expectedFrag = await readFile("./expected/define-struct-access-global.frag.glsl");
    expect(vertex).to.equal(expectedVert);
    expect(fragment).to.equal(expectedFrag);
  });

  it("define-struct-access (function-body #define with struct member access)", async () => {
    const shaderSource = await readFile("./shaders/define-struct-access.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);

    const shader = shaderCompilerVerbose._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex, fragment } = shaderCompilerVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0
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
      glslValidate(engine, shaderSource, shaderCompilerRelease);

      // Also verify verbose mode (semantic analysis) succeeds — this was the original bug:
      // member access macros resolved to struct type "Varyings" instead of TypeAny,
      // causing builtin overload matching to fail.
      const shader = shaderCompilerVerbose._parseShaderSource(shaderSource);
      const passSource = shader.subShaders[0].passes[0];
      const { vertex, fragment } = shaderCompilerVerbose._parseShaderPass(
        passSource.contents,
        passSource.vertexEntry,
        passSource.fragmentEntry,
        0
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
    glslValidate(engine, shaderSource, shaderCompilerRelease);

    // Verify verbose mode: global "Varyings o;" should not produce "uniform Varyings o;"
    // and should not duplicate varying declarations.
    const shader = shaderCompilerVerbose._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex, fragment } = shaderCompilerVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0
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
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("paren-define (object-like with space-before-paren vs function-like without space)", async () => {
    const shaderSource = await readFile("./shaders/paren-define-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("macro-value-refs (uniforms referenced inside paren / operator / fn-call / unary / nested macro values)", async () => {
    const shaderSource = await readFile("./shaders/macro-value-refs.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("macro-call-struct-arg (struct-member access as function-like macro arg)", async () => {
    const shaderSource = await readFile("./shaders/macro-call-struct-arg-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("non-expression-define (replacement list is not an expression)", async () => {
    const shaderSource = await readFile("./shaders/non-expression-define-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("type-alias-repro (FXAA-style portability macros aliasing GLSL types)", async () => {
    const shaderSource = await readFile("./shaders/type-alias-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("type-alias-sampler-only (sampler2D alias alone — should pass via legacy path)", async () => {
    const shaderSource = await readFile("./shaders/type-alias-sampler-only.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("digit-ending-id-repro (struct field ending in digit: v0.xyz, uv1.xy)", async () => {
    const shaderSource = await readFile("./shaders/digit-ending-id-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("paren-member-access-repro (inline (v).v_uv release-mode flatten)", async () => {
    const shaderSource = await readFile("./shaders/paren-member-access-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("define-in-comment-repro (Issue 2980 ex.1: regex must not false-positive on /* #define */)", async () => {
    const shaderSource = await readFile("./shaders/define-in-comment-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("define-line-continuation-repro (Issue 2980 ex.2: \\-continuation in #define value)", async () => {
    const shaderSource = await readFile("./shaders/define-line-continuation-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("define-comment-in-peek (block comment between macro name and value)", async () => {
    const shaderSource = await readFile("./shaders/define-comment-in-peek.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("define-comment-with-dot (reviewer P1-1: `.` inside block comment must not route to AST)", async () => {
    const shaderSource = await readFile("./shaders/define-comment-with-dot.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("define-line-continuation-member-access (reviewer P1-2: `\\\\\\n` followed by .field must route to AST)", async () => {
    const shaderSource = await readFile("./shaders/define-line-continuation-member-access.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("define-line-continuation-no-dot (`\\\\\\n` in directive without member access — `_registerMacroDefine` must fold before regex)", async () => {
    const shaderSource = await readFile("./shaders/define-line-continuation-no-dot.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("define-multiline-params (`\\\\\\n` inside function-like macro header — `_scanUtilBreakLine`/`_scanMacroDefineParams` must honor line continuation)", async () => {
    const shaderSource = await readFile("./shaders/define-multiline-params.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("define-if-stack-balance (#if/#elif must keep branch-stack depth so #endif pops correct level)", async () => {
    const shaderSource = await readFile("./shaders/define-if-stack-balance.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("define-elif-polarity (#elif arm must not inherit previous arm's branch tag)", async () => {
    const shaderSource = await readFile("./shaders/define-elif-polarity.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });




  it("frag-return-vec4 (Cocos pattern: fragment entry returns vec4 instead of void)", async () => {
    const shaderSource = await readFile("./shaders/frag-return-vec4.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("macro-type-alias (macro-defined type aliases in declarations, params, struct members, return types)", async () => {
    const shaderSource = await readFile("./shaders/macro-type-alias.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("cross-if-declarator-collision (declarator name shadowed by #define in sibling #if arm)", async () => {
    // FXAA-style pattern: `#define lumaS …` in one `#if expr` arm and
    // `float lumaS = …;` in the mutually-exclusive arm. Locks two
    // distinct fixes:
    //
    //  (1) Grammar: `single_declaration → fully_specified_type MACRO_CALL
    //      [= initializer]` (added in 87cb2b5f0). Without it, the #else
    //      arm parse-errors because lexer tags `lumaS` as MACRO_CALL.
    //
    //  (2) Codegen: emitted GLSL must keep the #else-arm declaration. Use
    //      sites of `lumaS` are also lexed as MACRO_CALL, so the emitter
    //      can't rely solely on the "ID reference → global var" path; it
    //      must also resolve MACRO_CALL references back to a same-name
    //      sibling-arm declaration so the variant where `#if` is false
    //      still has `lumaS` defined.
    const shaderSource = await readFile("./shaders/cross-if-declarator-collision.shader");
    const sourceMeta = shaderCompilerVerbose._parseShaderSource(shaderSource);
    const passSource = sourceMeta.subShaders[0].passes[0];
    const passProgram = shaderCompilerVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0 /* GLSLES100 */
    );
    expect(passProgram, "fixture must compile (locks fix 1)").not.to.be.undefined;
    // Locks fix 2: the #else-arm declaration must survive into emitted GLSL.
    // ShaderLab silently drops the declaration when both the use sites and
    // the #else-arm declarator are tagged MACRO_CALL — driver then rejects
    // the variant where the #if condition is false (no `lumaS` defined).
    expect(passProgram!.vertex, "vertex must keep #else-arm `lumaS` declaration").to.match(
      /float\s+lumaS\s*=/
    );
    // The full shader pass should still validate end-to-end.
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("texture-generic (GVec4 → vec4 resolve)", async () => {
    const shaderSource = await readFile("./shaders/texture-generic.shader");
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("generic-return-type (builtin generic return as arg to user function)", async () => {
    const shaderSource = await readFile("./shaders/generic-return-type.shader");
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-nested-ifdef (branch stack: nested #ifdef registers entries under combined signatures)", async () => {
    const shaderSource = await readFile("./shaders/define-nested-ifdef.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);
  });

  it("define-branch-scoped-ast (per-branch filtering: same flag, both AST forms, different members)", async () => {
    const shaderSource = await readFile("./shaders/define-branch-scoped-ast.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);

    // Default macro state activates the `#else` branch — codegen must reference
    // `v_tangent`, not `v_normal`, in the macro substitution path.
    const shader = shaderCompilerVerbose._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { fragment } = shaderCompilerVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0
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
    glslValidate(engine, shaderSource, shaderCompilerRelease);
    glslValidate(engine, shaderSource, shaderCompilerVerbose);

    // Default macro state activates the legacy branch — generated GLSL must
    // reference `u_globalLightDir`, not the AST-form `v.v_normal` substitution.
    const shader = shaderCompilerVerbose._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { fragment } = shaderCompilerVerbose._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0
    )!;
    expect(fragment).to.contain("u_globalLightDir");
    expect(fragment).to.contain("normalize");
  });
});
