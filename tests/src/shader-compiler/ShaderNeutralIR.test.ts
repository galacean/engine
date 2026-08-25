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
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/src/ShaderPrecompiler";
import { GLESBackend } from "@galacean/engine-shader-compiler/src/GLESBackend";
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

    const generatedA = GLESBackend.generate(
      parsedA.ir!,
      ShaderCoreInfo.create(parsedA.ir!, "vertA", "fragA"),
      ShaderLanguage.GLSLES300
    );
    expect(generatedA).to.not.equal(undefined);
    const snapshotA = inspectNeutralIR(parsedA.ir!, ShaderCoreInfo.create(parsedA.ir!, "vertA", "fragA"));

    const parsedB = parseShaderPass(
      `void vertB() { gl_Position = vec4(2.0); } void fragB() { gl_FragColor = vec4(0.75); }`,
      {},
      new Map()
    );
    expect(parsedB.errors).to.have.lengthOf(0);
    GLESBackend.generate(parsedB.ir!, ShaderCoreInfo.create(parsedB.ir!, "vertB", "fragB"), ShaderLanguage.GLSLES100);

    expect(inspectNeutralIR(parsedA.ir!, ShaderCoreInfo.create(parsedA.ir!, "vertA", "fragA"))).to.deep.equal(
      snapshotA
    );
    expect(
      GLESBackend.generate(parsedA.ir!, ShaderCoreInfo.create(parsedA.ir!, "vertA", "fragA"), ShaderLanguage.GLSLES300)
    ).to.deep.equal(generatedA);
  });

  it("rejects shared parser results that contain blocking errors", () => {
    const source = `#include "missing.glsl"
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }`;
    const parsed = parseShaderPass(source, {}, new Map());
    expect(parsed.ir).to.equal(null);
    expect(parsed.errors).to.not.have.lengthOf(0);
    expect(parsed.blockingErrors).to.not.have.lengthOf(0);

    const generated = new ShaderCompiler()._parseShaderPass(source, "vert", "frag", ShaderLanguage.GLSLES100);
    expect(generated).to.equal(undefined);
  });

  it("rejects analyzer pass handoff when preprocessing expressions are malformed", () => {
    const source = `Shader "MalformedExpression" { SubShader "Default" { Pass "p" {
#if 123 defined(USE_VALUE)
float invalidValue;
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(1.0); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("PreprocessorError");
    expect(analysis.passes).to.have.lengthOf(1);
    expect(new ShaderCompiler().generate(analysis.passes[0], ShaderLanguage.GLSLES100)).to.equal(undefined);
  });

  it("rejects analyzer pass handoff when parser semantics prove a redefinition", () => {
    const source = `Shader "Redefinition" { SubShader "Default" { Pass "p" {
float repeated;
float repeated;
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(repeated); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).to.include("Redefinition");
    expect(analysis.passes).to.have.lengthOf(1);
    expect(new ShaderCompiler().generate(analysis.passes[0], ShaderLanguage.GLSLES100)).to.equal(undefined);
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
      new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES100, "shaders://root/Shaders/Root.shader")
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
    const compiler = new ShaderPrecompiler();
    compiler.setIncludeMap({
      "Shaders/chunks/Common.glsl": '#include "../shared/Value.glsl"\nfloat chunkValue() { return 0.25; }',
      "Shaders/shared/Value.glsl": "float brokenValue = ;"
    });

    expect(() => compiler.precompile(source, ShaderLanguage.GLSLES100, "shaders://root/Shaders/Root.shader")).to.throw(
      /Shaders\/shared\/Value\.glsl: CompilationError: Unexpected token ;\n1 \| float brokenValue = ;\n  \| {21}\^/
    );
  });

  it("canonicalizes compiler include maps exactly like the analyzer", () => {
    const source = `Shader "CanonicalIncludeMap" {
  SubShader "Default" {
    Pass "p" {
      #include "/User Effects/Common Math.glsl"
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(includedValue()); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const compiler = new ShaderPrecompiler();
    compiler.setIncludeMap({
      "User Effects/Common Math.glsl": "float includedValue() { return 1.0; }"
    });

    expect(() => compiler.precompile(source, ShaderLanguage.GLSLES100, "Shaders/Root.shader")).not.to.throw();
    expect(() =>
      compiler.setIncludeMap({
        "User/Common.glsl": "float firstValue;",
        "/User/Common.glsl": "float secondValue;"
      })
    ).to.throw('resolves to "User/Common.glsl"');
  });

  it("keeps analyzer and precompile attribution identical for nested expression errors", () => {
    const source = `Shader "InvalidExpressionInclude" {
  SubShader "Default" {
    Pass "p" {
      #include "./chunks/Common.glsl"
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
    const brokenSource = "#if 0\n#elif 123 defined(USE_VALUE)\n#endif";
    const includeMap = {
      "Shaders/chunks/Common.glsl": '#include "../shared/Broken.glsl"',
      "Shaders/shared/Broken.glsl": brokenSource
    };
    const sourceFile = "Shaders/Root.shader";
    const diagnostic = ShaderAnalyzer.analyze(source, { includeMap, sourceFile }).diagnostics.find(
      (candidate) => candidate.code === "PreprocessorError"
    );
    expect(diagnostic).to.be.ok;
    expect(diagnostic!.sourceFile).to.equal("Shaders/shared/Broken.glsl");
    expect(diagnostic!.relatedSource).to.equal(brokenSource);
    expect(diagnostic!.range.start.line).to.equal(2);
    expect(brokenSource.slice(diagnostic!.range.start.offset, diagnostic!.range.end.offset)).to.equal("defined");

    const compiler = new ShaderPrecompiler();
    compiler.setIncludeMap(includeMap);
    expect(() => compiler.precompile(source, ShaderLanguage.GLSLES100, sourceFile)).to.throw(
      /Shaders\/shared\/Broken\.glsl: PreprocessorError: Unexpected token 'defined'.*\n2 \| #elif 123 defined\(USE_VALUE\)\n  \| {11}\^{7}/s
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
    const result = ShaderAnalyzer.analyze(source);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).to.include("UndeclaredStructMember");
    const pass = new ShaderCompiler()._parseShaderSource(source).subShaders[0].passes[0];
    const generated = new ShaderCompiler()._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
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

    const generated = new ShaderCompiler()._parseShaderPass(source, "vert", "frag", ShaderLanguage.GLSLES100);
    expect(generated).to.not.equal(undefined);
    expect(generated!.vertex.match(/attribute\s+vec3\s+position\s*;/g)).to.have.lengthOf(1);
    expect(generated!.vertex.match(/varying\s+vec2\s+uv\s*;/g)).to.have.lengthOf(1);
  });
});
