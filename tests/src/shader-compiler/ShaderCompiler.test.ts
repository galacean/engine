import {
  BlendFactor,
  BlendOperation,
  ColorWriteMask,
  CompareFunction,
  CullMode,
  RenderStateElementKey,
  ShaderLanguage,
  StencilOperation
} from "@galacean/engine-core";
import { ShaderCompiler as ShaderCompilerRelease } from "@galacean/engine-shader-compiler";
import { ShaderSourceParser } from "@galacean/engine-shader-parser/internal";
import { glslValidate } from "./ShaderValidate";

import { Logger, WebGLEngine } from "@galacean/engine";
import { describe, expect, it, vi } from "vitest";
import { server } from "@vitest/browser/context";
const { readFile } = server.commands;

Logger.enable();

const shaderCompilerRelease = new ShaderCompilerRelease();

describe("ShaderCompiler", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const PBRSource = await readFile("packages/shader/src/Shaders/PBR.shader");

  it("create shaderCompiler", async () => {
    expect(shaderCompilerRelease).not.be.null;
  });

  it("PBR", async () => {
    const shader = shaderCompilerRelease._parseShaderSource(PBRSource);
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
    const demoShader = await readFile("tests/src/shader-compiler/shaders/render-state.shader");
    const { shaderSource: shader } = ShaderSourceParser.parseWithErrors(demoShader);
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
    const result = ShaderSourceParser.parseWithErrors(shaderSource);
    expect(result.errors.some((error) => error.message.includes("Bitwise OR '|' is not supported"))).to.equal(true);
    const shader = result.shaderSource;
    const pass = shader.subShaders[0].passes[0];
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
    const result = ShaderSourceParser.parseWithErrors(shaderSource);
    expect(result.errors.some((error) => error.message.includes("Cannot mix enum types"))).to.equal(true);
    const pass = result.shaderSource.subShaders[0].passes[0];
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
    const result = ShaderSourceParser.parseWithErrors(shaderSource);
    expect(result.errors.some((error) => error.message.includes("Invalid syntax after '|'"))).to.equal(true);
    const pass = result.shaderSource.subShaders[0].passes[0];
    // ColorWriteMask should not appear in constantMap due to invalid syntax after '|'
    expect(pass.renderStates.constantMap[RenderStateElementKey.BlendStateColorWriteMask0]).to.be.undefined;
  });

  it("No frag shader args", async () => {
    const demoShader = await readFile("tests/src/shader-compiler/shaders/noFragArgs.shader");
    glslValidate(engine, demoShader, shaderCompilerRelease);
  });

  it("water full shader(complex)", async () => {
    const demoShader = await readFile("tests/src/shader-compiler/shaders/waterfull.shader");
    glslValidate(engine, demoShader, shaderCompilerRelease);
  });

  it("multi-pass", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/multi-pass.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("macro-with-preprocessor", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/macro-pre.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  // Function-like parameters and cross-arm macro names are not undeclared references.
  it("function-like macro form params and macro names don't warn as undeclared", async () => {
    const src = await readFile("tests/src/shader-compiler/shaders/macro-form-params-no-warn.shader");
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: any[]) => warns.push(args.join(" "));
    try {
      glslValidate(engine, src, shaderCompilerRelease);
    } finally {
      console.warn = origWarn;
    }
    const undeclared = warns.filter((w) => /will be declared before used/.test(w));
    expect(undeclared, `unexpected undeclared warnings:\n${undeclared.join("\n")}`).to.deep.equal([]);
  });

  it("macro-negate-number (!0, !1 in #if expressions)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/macro-negate-number.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("mrt-struct", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/mrt-struct.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);

    const shader = shaderCompilerRelease._parseShaderSource(shaderSource);
    const pass = shader.subShaders[0].passes[0];
    const program = shaderCompilerRelease._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES100
    )!;
    expect(program.fragment).not.toContain("null");
  });

  // Same-named entry parameters resolve their struct role independently per stage.
  it("struct-based-attribute (same-named params across stages routes per stage)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/struct-based-attribute.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);

    const shader = shaderCompilerRelease._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex } = shaderCompilerRelease._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0
    )!;

    expect(vertex).to.match(/attribute\s+vec4\s+POSITION\s*;/);
    expect(vertex).to.match(/attribute\s+vec3\s+NORMAL\s*;/);
  });

  it("define-struct-access-global (global #define with struct member access)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-struct-access-global.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);

    const shader = shaderCompilerRelease._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex, fragment } = shaderCompilerRelease._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0
    )!;

    const expectedVert = await readFile("tests/src/shader-compiler/expected/define-struct-access-global.vert.glsl");
    const expectedFrag = await readFile("tests/src/shader-compiler/expected/define-struct-access-global.frag.glsl");
    expect(vertex).to.equal(expectedVert.trimEnd());
    expect(fragment).to.equal(expectedFrag.trimEnd());
  });

  it("define-struct-access (function-body #define with struct member access)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-struct-access.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);

    const shader = shaderCompilerRelease._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex, fragment } = shaderCompilerRelease._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0
    )!;

    const expectedVert = await readFile("tests/src/shader-compiler/expected/define-struct-access.vert.glsl");
    const expectedFrag = await readFile("tests/src/shader-compiler/expected/define-struct-access.frag.glsl");
    expect(vertex).to.equal(expectedVert);
    expect(fragment).to.equal(expectedFrag);
  });

  it("macro-member-access-builtin-arg (member access macro as builtin fn arg)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/macro-member-access-builtin-arg.shader");

    glslValidate(engine, shaderSource, shaderCompilerRelease);

    // Member-access macros must resolve to TypeAny, not the concrete struct type, so builtin
    // overload matching succeeds and the macros expand into the output.
    const shader = shaderCompilerRelease._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex, fragment } = shaderCompilerRelease._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0
    )!;

    expect(vertex).to.be.a("string").and.not.empty;
    expect(fragment).to.be.a("string").and.not.empty;
    expect(fragment).to.contain("normalize");
    expect(fragment).to.contain("dot");
    expect(fragment).to.contain("texture2D");
  });

  it("global-varying-var (global Varyings var with #define macros)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/global-varying-var.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);

    // A global "Varyings o;" must neither become a uniform nor duplicate varying declarations
    const shader = shaderCompilerRelease._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { vertex, fragment } = shaderCompilerRelease._parseShaderPass(
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
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-ctor-with-member.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("paren-define (object-like with space-before-paren vs function-like without space)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/paren-define-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("macro-value-refs (uniforms referenced inside paren / operator / fn-call / unary / nested macro values)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/macro-value-refs.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("macro-call-struct-arg (struct-member access as function-like macro arg)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/macro-call-struct-arg-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("macro-top-level-comma (replacement list with top-level `,` — GLSL ES 3.00 §3.4)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/macro-top-level-comma-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("macro-leading-dot-float (`.5` is a legal GLSL ES §4.1.4 float literal)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/macro-leading-dot-float.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  const assertOpaqueMacro = async (fixturePath: string, expectedDirective: string) => {
    const source = await readFile(fixturePath);
    glslValidate(engine, source, shaderCompilerRelease);
    const parsed = shaderCompilerRelease._parseShaderSource(source);
    const pass = parsed.subShaders[0].passes.find((p) => !p.isUsePass);
    if (!pass) throw new Error("test fixture missing a non-usepass");
    const result = shaderCompilerRelease._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES100
    );
    expect(result).to.not.be.undefined;
    expect(result!.fragment).to.include(expectedDirective);
  };

  it("preserves a trailing-comma macro replacement list", async () => {
    await assertOpaqueMacro(
      "tests/src/shader-compiler/shaders/macro-token-fragment-trailing-comma.shader",
      "#define BAD u_a, u_b,"
    );
  });

  it("preserves an unbalanced-bracket macro replacement list", async () => {
    await assertOpaqueMacro(
      "tests/src/shader-compiler/shaders/macro-token-fragment-unbalanced-bracket.shader",
      "#define BAD u_a[u_b"
    );
  });

  it("preserves an unbalanced-parenthesis macro replacement list", async () => {
    await assertOpaqueMacro(
      "tests/src/shader-compiler/shaders/macro-token-fragment-unbalanced-paren.shader",
      "#define BAD u_a("
    );
  });

  it("type-alias-repro (FXAA-style portability macros aliasing GLSL types)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/type-alias-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("type-alias-sampler-only (sampler2D alias alone — should pass via legacy path)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/type-alias-sampler-only.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("digit-ending-id-repro (struct field ending in digit: v0.xyz, uv1.xy)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/digit-ending-id-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("paren-member-access-repro (inline (v).v_uv release-mode flatten)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/paren-member-access-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-in-comment-repro (regex must not false-positive on /* #define */)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-in-comment-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-line-continuation-repro (\\-continuation in #define value)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-line-continuation-repro.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-comment-in-peek (block comment between macro name and value)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-comment-in-peek.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-comment-with-dot (`.` inside block comment must not route to AST)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-comment-with-dot.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-line-continuation-member-access (`\\\\\\n` followed by .field must route to AST)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-line-continuation-member-access.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-line-continuation-no-dot (`\\\\\\n` in directive without member access — `_registerMacroDefine` must fold before regex)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-line-continuation-no-dot.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-multiline-params (`\\\\\\n` inside function-like macro header — `_scanUtilBreakLine`/`_scanMacroDefineParams` must honor line continuation)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-multiline-params.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-if-stack-balance (#if/#elif must keep branch-stack depth so #endif pops correct level)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-if-stack-balance.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-elif-polarity (#elif arm must not inherit previous arm's branch tag)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-elif-polarity.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("frag-return-vec4 (fragment entry returns vec4 instead of void)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/frag-return-vec4.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("macro-type-alias (macro-defined type aliases in declarations, params, struct members, return types)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/macro-type-alias.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
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
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/cross-if-declarator-collision.shader");
    const sourceMeta = shaderCompilerRelease._parseShaderSource(shaderSource);
    const passSource = sourceMeta.subShaders[0].passes[0];
    const passProgram = shaderCompilerRelease._parseShaderPass(
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
    expect(passProgram!.vertex, "vertex must keep #else-arm `lumaS` declaration").to.match(/float\s+lumaS\s*=/);
    // The full shader pass should still validate end-to-end.
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("texture-generic (GVec4 → vec4 resolve)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/texture-generic.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("generic-return-type (builtin generic return as arg to user function)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/generic-return-type.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-nested-ifdef (branch stack: nested #ifdef registers entries under combined signatures)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-nested-ifdef.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);
  });

  it("define-branch-scoped-ast (per-branch filtering: same flag, both AST forms, different members)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-branch-scoped-ast.shader");
    glslValidate(engine, shaderSource, shaderCompilerRelease);

    // Default macro state activates the `#else` branch — codegen must reference
    // `v_tangent`, not `v_normal`, in the macro substitution path.
    const shader = shaderCompilerRelease._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { fragment } = shaderCompilerRelease._parseShaderPass(
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

  it("define-mixed-form-repro (AST/legacy mixed across #ifdef branches must not pollute call-site type)", async () => {
    const shaderSource = await readFile("tests/src/shader-compiler/shaders/define-mixed-form-repro.shader");

    // Both branches of the mixed `#define LIGHT_INPUT` are legal GLSL on their
    // own. The bug was that `MacroCallSymbol.hasAstValue` used `.some(...)`,
    // setting the flag whenever *any* branch was AST-form, which silently
    // disabled call-site type inference and stranded `TypeAny` whenever the
    // legacy branch was active. Fix: switch to `.every(...)` so mixed forms
    // fall back to legacy `referenceSymbolNames`-based inference.
    glslValidate(engine, shaderSource, shaderCompilerRelease);

    // Default macro state activates the legacy branch — generated GLSL must
    // reference `u_globalLightDir`, not the AST-form `v.v_normal` substitution.
    const shader = shaderCompilerRelease._parseShaderSource(shaderSource);
    const passSource = shader.subShaders[0].passes[0];
    const { fragment } = shaderCompilerRelease._parseShaderPass(
      passSource.contents,
      passSource.vertexEntry,
      passSource.fragmentEntry,
      0
    )!;
    expect(fragment).to.contain("u_globalLightDir");
    expect(fragment).to.contain("normalize");
  });

  it("preserves unused token-fragment macro replacement lists", () => {
    const shaderSource = `Shader "macro-token-fragments" { SubShader "Default" { Pass "p" {
      #define ADD +
      #define OPEN (
      #define TRAILING value +
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`;
    const parsed = shaderCompilerRelease._parseShaderSource(shaderSource);
    const pass = parsed.subShaders[0].passes[0];
    const output = shaderCompilerRelease._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, 0);
    expect(output).to.not.be.undefined;
    expect(output!.fragment).to.include("#define ADD +");
    expect(output!.fragment).to.include("#define OPEN (");
    expect(output!.fragment).to.include("#define TRAILING value +");
  });

  // A struct with conflicting pipeline roles must not produce duplicate stage declarations.
  it("struct-role-conflict codegen: no duplicate in/out declarations for the same struct name", () => {
    const conflict = `Shader "conf" { SubShader "s" { Pass "p" {
      struct IO { vec4 v; };
      IO vert(IO attr) { IO o; gl_Position = vec4(0.0); return o; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`;
    const parsed = shaderCompilerRelease._parseShaderSource(conflict);
    const pass = parsed.subShaders[0].passes[0];
    const out = shaderCompilerRelease._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, 0);
    expect(out, "codegen still returns a result").not.to.be.undefined;
    // An ambiguous role emits neither direction.
    const combined = out!.vertex + "\n" + out!.fragment;
    expect(combined).not.to.match(/^\s*in\s+IO\b/m);
    expect(combined).not.to.match(/^\s*out\s+IO\b/m);
    // `attribute IO` / `varying IO` cover the GLSL ES 1.00 codegen path (same rationale).
    expect(combined).not.to.match(/^\s*attribute\s+IO\b/m);
    expect(combined).not.to.match(/^\s*varying\s+IO\b/m);
  });

  it("missing entry codegen: rejects before backend generation without corrupting visitor state", () => {
    const missingEntry = `Shader "miss" { SubShader "s" { Pass "p" {
      struct Attributes { vec3 POSITION; };
      void realVert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = notReal;
      FragmentShader = frag;
    } } }`;
    const parsed = shaderCompilerRelease._parseShaderSource(missingEntry);
    const pass = parsed.subShaders[0].passes[0];
    const out = shaderCompilerRelease._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, 0);
    expect(out, "a missing entry is a structural generation failure").to.be.undefined;

    const valid = shaderCompilerRelease._parseShaderPass(
      `void vert() { gl_Position = vec4(0.0); }
       void frag() { gl_FragColor = vec4(1.0); }`,
      "vert",
      "frag",
      0
    );
    expect(valid, "a failed entry lookup must not corrupt the next compile").not.to.be.undefined;
  });
});
