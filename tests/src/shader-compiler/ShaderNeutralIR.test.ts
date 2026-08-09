import {
  ASTNode,
  ShaderBuiltinSemantic,
  ShaderCoreInfo,
  TreeNode,
  parseShaderPass,
  type ShaderClueIR
} from "@galacean/engine-shader-parser/internal/analyzer";
import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";

interface NeutralBackendSnapshot {
  entries: { vertex: string; fragment: string };
  io: { attributes: string[]; varyings: string[]; mrt: string[] };
  sourceFiles: string[];
  conditionalMacros: string[];
  builtinSemantics: ShaderBuiltinSemantic[];
}

function inspectNeutralIR(ir: ShaderClueIR, coreInfo: ShaderCoreInfo): NeutralBackendSnapshot {
  const conditionalMacros = new Set<string>();
  const builtinSemantics = new Set<ShaderBuiltinSemantic>();
  const visit = (node: TreeNode): void => {
    if (node instanceof ASTNode.VariableIdentifier && node.builtinSemantic !== undefined) {
      builtinSemantics.add(node.builtinSemantic);
    }
    for (const constraint of node._branch) {
      const condition = constraint.condition;
      if (condition?.kind === "defined" || condition?.kind === "comparison") {
        conditionalMacros.add(condition.name);
      } else if (condition?.kind === "expression") {
        for (const name of condition.names) conditionalMacros.add(name);
      } else {
        conditionalMacros.add(constraint.name);
      }
    }
    for (const child of node.children) {
      if (child instanceof TreeNode) visit(child);
    }
  };
  visit(ir.program);

  return {
    entries: { vertex: coreInfo.vertexEntry.name, fragment: coreInfo.fragmentEntry.name },
    io: {
      attributes: coreInfo.io.attributeStructs.map((node) => node.ident!.lexeme),
      varyings: coreInfo.io.varyingStructs.map((node) => node.ident!.lexeme),
      mrt: coreInfo.io.mrtStructs.map((node) => node.ident!.lexeme)
    },
    sourceFiles: [
      ...new Set(ir.sourceMap.map((segment) => segment.sourceFile).filter((file): file is string => !!file))
    ],
    conditionalMacros: [...conditionalMacros].sort(),
    builtinSemantics: [...builtinSemantics].sort()
  };
}

describe("neutral shader IR", () => {
  it("exposes include, conditional, entry, and IO facts without a GLES or analyzer dependency", () => {
    const source = `
#include "common.glsl"
struct Varyings { vec4 color; };
#if defined(USE_TINT)
vec4 tintColor;
#endif
Varyings vert(Attributes input) {
  Varyings output;
  gl_Position = vec4(input.position, 1.0);
  output.color = vec4(1.0);
  return output;
}
void frag(Varyings input) { gl_FragColor = input.color; }
`;
    const parsed = parseShaderPass(source, { "common.glsl": "struct Attributes { vec3 position; };" }, new Map());
    expect(parsed.errors).to.have.lengthOf(0);
    expect(parsed.ir).to.not.equal(null);

    const ir = parsed.ir!;
    const coreInfo = ShaderCoreInfo.create(ir, "vert", "frag");
    expect(inspectNeutralIR(ir, coreInfo)).to.deep.equal({
      entries: { vertex: "vert", fragment: "frag" },
      io: { attributes: ["Attributes"], varyings: ["Varyings"], mrt: [] },
      sourceFiles: ["common.glsl"],
      conditionalMacros: ["USE_TINT"],
      builtinSemantics: [ShaderBuiltinSemantic.FragmentOutput0, ShaderBuiltinSemantic.VertexPosition].sort()
    });
    expect(ir.program.shaderData).to.equal(ir.shaderData);
  });

  it("keeps a parsed pass valid after later parses and backend generations", () => {
    const sourceA = `
void vertA() { gl_Position = vec4(1.0); }
void fragA() { gl_FragColor = vec4(0.25); }
`;
    const parsedA = parseShaderPass(sourceA, {}, new Map());
    expect(parsedA.errors).to.have.lengthOf(0);
    expect(Object.isFrozen(parsedA)).to.equal(true);
    expect(Object.isFrozen(parsedA.sourceMap)).to.equal(true);
    expect(Object.isFrozen(parsedA.errors)).to.equal(true);

    const compiler = new ShaderCompiler();
    const generatedA = compiler._generateParsedShaderPass(parsedA, "vertA", "fragA", ShaderLanguage.GLSLES300);
    expect(generatedA).to.not.equal(undefined);
    const snapshotA = inspectNeutralIR(parsedA.ir!, ShaderCoreInfo.create(parsedA.ir!, "vertA", "fragA"));

    const parsedB = parseShaderPass(
      `void vertB() { gl_Position = vec4(2.0); } void fragB() { gl_FragColor = vec4(0.75); }`,
      {},
      new Map()
    );
    expect(parsedB.errors).to.have.lengthOf(0);
    expect(compiler._generateParsedShaderPass(parsedB, "vertB", "fragB", ShaderLanguage.GLSLES100)).to.not.equal(
      undefined
    );

    expect(inspectNeutralIR(parsedA.ir!, ShaderCoreInfo.create(parsedA.ir!, "vertA", "fragA"))).to.deep.equal(
      snapshotA
    );
    expect(compiler._generateParsedShaderPass(parsedA, "vertA", "fragA", ShaderLanguage.GLSLES300)).to.deep.equal(
      generatedA
    );
  });

  it("reuses the analyzer parse for codegen without changing runtime output", () => {
    const sourceFile = "Assets/Shaders/Root.shader";
    const includeMap = {
      "Assets/Shaders/chunks/Branch.glsl": `
#include "../shared/Value.glsl"
#if defined(USE_ALTERNATE)
  #define BRANCH_VALUE 2.0
#endif
`,
      "Assets/Shaders/shared/Value.glsl": `
#ifndef BRANCH_VALUE
  #define BRANCH_VALUE 1.0
#endif
`
    };
    const source = `Shader "SharedParse" {
  SubShader "Default" {
    Pass "p" {
      #include "./chunks/Branch.glsl"
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(BRANCH_VALUE); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;

    const analysisUnit = ShaderAnalyzer._analyze(source, { includeMap, sourceFile });
    expect(analysisUnit.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).to.have.lengthOf(0);
    expect(analysisUnit.parsedPasses).to.have.lengthOf(1);

    const compiler = new ShaderCompiler();
    compiler._setIncludeMap(includeMap);
    const analyzedPass = analysisUnit.parsedPasses[0];
    const reused = compiler._generateParsedShaderPass(
      analyzedPass.parsed,
      analyzedPass.vertexEntry,
      analyzedPass.fragmentEntry,
      ShaderLanguage.GLSLES300
    );
    expect(() =>
      compiler._precompile(source, ShaderLanguage.GLSLES100, "shaders://root/Assets/Shaders/Root.shader")
    ).not.to.throw();
    const precompiled = compiler._precompile(
      source,
      ShaderLanguage.GLSLES300,
      "shaders://root/Assets/Shaders/Root.shader"
    );
    const runtimePass = precompiled.subShaders[0].passes[0];

    expect(runtimePass.isUsePass).to.equal(false);
    if (runtimePass.isUsePass) throw new Error("Expected a compiled pass.");
    expect(reused?.vertexShaderInstructions).to.deep.equal(runtimePass.vertexShaderInstructions);
    expect(reused?.fragmentShaderInstructions).to.deep.equal(runtimePass.fragmentShaderInstructions);
    expect(
      analyzedPass.parsed.sourceMap.some((segment) => segment.sourceFile === "Assets/Shaders/shared/Value.glsl")
    ).to.equal(true);
  });

  it("rejects shared parser results that contain blocking errors", () => {
    const parsed = parseShaderPass(
      `#include "missing.glsl"
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }`,
      {},
      new Map()
    );
    expect(parsed.ir).to.not.equal(null);
    expect(parsed.errors).to.not.have.lengthOf(0);
    expect(parsed.blockingErrors).to.not.have.lengthOf(0);

    const generated = new ShaderCompiler()._generateParsedShaderPass(parsed, "vert", "frag", ShaderLanguage.GLSLES100);
    expect(generated).to.equal(undefined);
  });

  it("preserves a missing include path in precompile failures", () => {
    const source = `Shader "MissingInclude" {
  SubShader "Default" {
    Pass "p" {
      #include "./chunks/Missing.glsl"
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;

    expect(() =>
      new ShaderCompiler()._precompile(source, ShaderLanguage.GLSLES100, "shaders://root/Shaders/Root.shader")
    ).to.throw(
      /Shaders\/Root\.shader: PreprocessorError: Shader include "Shaders\/chunks\/Missing\.glsl" was not found\.\n1 \| #include "\.\/chunks\/Missing\.glsl"\n  \| \^/
    );
  });

  it("preserves the nested include source and syntax error in precompile failures", () => {
    const source = `Shader "InvalidInclude" {
  SubShader "Default" {
    Pass "p" {
      #include "./chunks/Common.glsl"
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(chunkValue()); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const compiler = new ShaderCompiler();
    compiler._setIncludeMap({
      "Shaders/chunks/Common.glsl": '#include "../shared/Value.glsl"\nfloat chunkValue() { return 0.25; }',
      "Shaders/shared/Value.glsl": "float brokenValue = ;"
    });

    expect(() => compiler._precompile(source, ShaderLanguage.GLSLES100, "shaders://root/Shaders/Root.shader")).to.throw(
      /Shaders\/shared\/Value\.glsl: CompilationError: Unexpected token ;\n1 \| float brokenValue = ;\n  \| {21}\^/
    );
  });

  it("does not treat analyzer-only diagnostics as backend-blocking errors", () => {
    const source = `Shader "AnalyzerOnly" {
  SubShader "Default" {
    Pass "p" {
      struct Attributes { vec3 position; };
      struct Varyings { vec4 color; };
      Varyings vert(Attributes input) {
        Varyings output;
        gl_Position = vec4(input.position, 1.0);
        output.color = vec4(1.0);
        return output;
      }
      void frag(Varyings input) { gl_FragColor = input.missing; }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const analysisUnit = ShaderAnalyzer._analyze(source);
    expect(analysisUnit.diagnostics.map((diagnostic) => diagnostic.code)).to.include("UndeclaredStructMember");
    const analyzedPass = analysisUnit.parsedPasses[0];
    expect(analyzedPass.parsed.errors).to.not.have.lengthOf(0);
    expect(analyzedPass.parsed.blockingErrors).to.have.lengthOf(0);

    const generated = new ShaderCompiler()._generateParsedShaderPass(
      analyzedPass.parsed,
      analyzedPass.vertexEntry,
      analyzedPass.fragmentEntry,
      ShaderLanguage.GLSLES300
    );
    expect(generated).to.not.equal(undefined);
  });

  it("emits shared IO declarations once for entry implementations in exclusive macro arms", () => {
    const source = `
struct Attributes { vec3 position; };
struct Varyings { vec2 uv; };
#ifdef USE_ALTERNATE
Varyings vert(Attributes input) {
  Varyings output;
  gl_Position = vec4(input.position, 1.0);
  output.uv = vec2(0.0);
  return output;
}
#else
Varyings vert(Attributes input) {
  Varyings output;
  gl_Position = vec4(input.position, 1.0);
  output.uv = vec2(1.0);
  return output;
}
#endif
void frag(Varyings input) { gl_FragColor = vec4(input.uv, 0.0, 1.0); }
`;
    const parsed = parseShaderPass(source, {}, new Map());
    expect(parsed.errors).to.have.lengthOf(0);

    const generated = new ShaderCompiler()._generateParsedShaderPass(parsed, "vert", "frag", ShaderLanguage.GLSLES100);
    expect(generated).to.not.equal(undefined);
    expect(generated!.vertex.match(/attribute\s+vec3\s+position\s*;/g)).to.have.lengthOf(1);
    expect(generated!.vertex.match(/varying\s+vec2\s+uv\s*;/g)).to.have.lengthOf(1);
  });
});
