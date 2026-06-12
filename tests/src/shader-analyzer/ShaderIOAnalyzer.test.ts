import {
  Lexer,
  Preprocessor,
  ShaderCompilerUtils,
  ShaderIOAnalyzer,
  ShaderSourceParser,
  ShaderTargetParser
} from "@galacean/engine-shader-parser";
import { describe, expect, it } from "vitest";

/**
 * Expectation-driven tests for the parser's IO semantic analysis. Each case asserts
 * the diagnostics the analysis SHOULD produce per RFC — one code per real problem,
 * correct code. Valid shaders (incl. the kind dev/2.0 compiles) must stay clean.
 */

const parser = ShaderTargetParser.create();

/** Run ShaderIOAnalyzer over a ShaderLab source; return the IO diagnostic codes (with multiplicity). */
function ioCodes(source: string): string[] {
  ShaderCompilerUtils.clearAllShaderCompilerObjectPool();
  const shaderSource = ShaderSourceParser.parse(source);
  const codes: string[] = [];
  for (const sub of shaderSource.subShaders) {
    for (const pass of sub.passes) {
      if (pass.isUsePass) continue;
      const macroDefineList = {};
      const content = Preprocessor.parse(pass.contents, "", {}, new Map());
      const lexer = new Lexer(content, macroDefineList);
      const tokens = lexer.tokenize();
      ShaderCompilerUtils.processingPassText = content;
      const program = parser.parse(tokens, macroDefineList);
      if (program) {
        const { errors } = ShaderIOAnalyzer.analyze(program.shaderData, pass.vertexEntry, pass.fragmentEntry, content);
        for (const e of errors) codes.push(e.code ?? "?");
      }
      ShaderCompilerUtils.processingPassText = undefined;
    }
  }
  return codes.sort();
}

function wrap(pass: string): string {
  return `Shader "io" { SubShader "Default" { Pass "test" {\n${pass}\n} } }`;
}

const cases: { name: string; source: string; expected: string[] }[] = [
  {
    name: "valid: plain frag, no IO struct → clean",
    expected: [],
    source: wrap(`
      mat4 renderer_MVPMat;
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "valid: full varying IO → clean",
    expected: [],
    source: wrap(`
      struct Attributes { vec3 POSITION; };
      struct Varyings { vec4 v_color; };
      Varyings vert(Attributes attr) { Varyings o; o.v_color = vec4(1.0); gl_Position = vec4(attr.POSITION, 1.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.v_color; }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "InvalidVaryingStruct: vertex returns undefined varying struct (once)",
    expected: ["InvalidVaryingStruct"],
    source: wrap(`
      struct Attributes { vec3 POSITION; };
      Varyings vert(Attributes attr) { Varyings o; return o; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "VertexEntryReturnType: vertex returns non-struct/void (once)",
    expected: ["VertexEntryReturnType"],
    source: wrap(`
      struct Attributes { vec3 POSITION; };
      float vert(Attributes attr) { return 1.0; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "InvalidAttributeStruct: vertex attribute param undefined struct (once)",
    expected: ["InvalidAttributeStruct"],
    source: wrap(`
      void vert(Attributes attr) { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "FragmentEntryReturnType: fragment returns non-struct/vec4 (once)",
    expected: ["FragmentEntryReturnType"],
    source: wrap(`
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      float frag() { return 1.0; }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "StructRoleConflict: same struct as Varying and Attribute — reported ONCE",
    expected: ["StructRoleConflict"],
    source: wrap(`
      struct IO { vec4 v; };
      IO vert(IO attr) { IO o; return o; }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;`)
  },
  {
    name: "GlFragColorWithMrt: fragment returns MRT yet writes gl_FragColor",
    expected: ["GlFragColorWithMrt"],
    source: wrap(`
      struct MRT { vec4 c0; };
      void vert() { gl_Position = vec4(0.0); }
      MRT frag() { MRT o; o.c0 = vec4(0.0); gl_FragColor = vec4(0.0); return o; }
      VertexShader = vert;
      FragmentShader = frag;`)
  }
];

describe("ShaderIOAnalyzer (expectation-driven)", () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(ioCodes(c.source)).to.deep.equal([...c.expected].sort());
    });
  }
});
