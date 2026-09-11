import { Logger, ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { getParsedShaderPassPayload, ShaderSourceParser } from "@galacean/engine-shader-parser/internal";
import { describe, expect, it, vi } from "vitest";

const targets = [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300];
const prototype = "float helper(float value);";
const definition = "float helper(float value) { return value + 0.5; }";
const vertex = "void vert() { gl_Position = vec4(helper(0.0)); }";
const fragment = "void frag() { gl_FragColor = vec4(helper(0.0)); }";

function shader(pass: string, shaderScope = "", subShaderScope = ""): string {
  return `Shader "function-prototype-lifetime" {
${shaderScope}
SubShader "s" {
${subShaderScope}
Pass "p" {
${pass}
VertexShader = vert; FragmentShader = frag;
} } }`;
}

const forwardBody = `${vertex}\n${definition}\n${fragment}`;
const unsupported = [
  { name: "Shader scope", source: shader(forwardBody, prototype) },
  { name: "SubShader scope", source: shader(forwardBody, "", prototype) },
  { name: "Pass scope", source: shader(`${prototype}\n${forwardBody}`) },
  {
    name: "after a completed function and another prototype",
    source: shader(`void before() {}\nint other();\n${prototype}\n${forwardBody}`)
  },
  { name: "conditional global declaration", source: shader(`#ifdef FORWARD\n${prototype}\n#endif\n${forwardBody}`) },
  {
    name: "included global declaration",
    source: shader(`#include "forward.glsl"\n${forwardBody}`),
    includeMap: { "forward.glsl": prototype }
  }
];

function programs(source: string) {
  const analysis = ShaderAnalyzer.analyze(source);
  expect(analysis.diagnostics).toEqual([]);
  const pass = ShaderSourceParser.parse(source).subShaders[0].passes[0];
  const compiler = new ShaderCompiler();
  return targets.flatMap((target) => {
    const generated = [
      compiler.generate(analysis.passes[0], target),
      compiler._parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        target,
        "",
        pass.contentScopeStarts
      ),
      new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]
    ];
    return generated.map((program) => {
      expect(program).toBeDefined();
      if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected generated shader");
      return {
        target,
        vertex: ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map()),
        fragment: ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map())
      };
    });
  });
}

const supported = shader(`#if 0\n${prototype}\n#endif\n${definition}\n${vertex}\n${fragment}`);

describe("function prototype admission and capture lifetime", () => {
  it.each(unsupported)("rejects an unsupported forward prototype in $name in all compilation paths", (fixture) => {
    const errors = vi.spyOn(Logger, "error").mockImplementation(() => undefined);
    try {
      const analysis = ShaderAnalyzer.analyze(fixture.source, { includeMap: fixture.includeMap });
      expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toContain("SyntaxError");
      expect(analysis.passes).toHaveLength(1);
      const pass = ShaderSourceParser.parse(fixture.source).subShaders[0].passes[0];
      const compiler = new ShaderCompiler();
      compiler._setIncludeMap(fixture.includeMap ?? {});
      const precompiler = new ShaderPrecompiler();
      precompiler.setIncludeMap(fixture.includeMap ?? {});
      for (const target of targets) {
        expect(compiler.generate(analysis.passes[0], target)).toBeUndefined();
        expect(
          compiler._parseShaderPass(
            pass.contents,
            pass.vertexEntry,
            pass.fragmentEntry,
            target,
            "",
            pass.contentScopeStarts
          )
        ).toBeUndefined();
        expect(() => precompiler.precompile(fixture.source, target)).toThrow("precompile failed");
        // The compiler must recover after rejecting a declarator before its definition is complete.
        const validPass = ShaderSourceParser.parse(supported).subShaders[0].passes[0];
        const recovered = compiler._parseShaderPass(
          validPass.contents,
          validPass.vertexEntry,
          validPass.fragmentEntry,
          target,
          "",
          validPass.contentScopeStarts
        );
        expect(recovered).toBeDefined();
        expect(ShaderMacroProcessor.evaluate(recovered!.vertexShaderInstructions!, new Map())).toMatch(
          /float\s+helper\s*\([^{};]*\)\s*\{/
        );
      }
    } finally {
      errors.mockRestore();
    }
  });

  it("keeps an inactive prototype out of the next function's references and final programs", () => {
    for (const program of programs(supported)) {
      for (const source of [program.vertex, program.fragment]) {
        expect(source.match(/float\s+helper\s*\([^{};]*\)\s*\{/g)).toHaveLength(1);
        expect(source).toMatch(/helper\s*\(\s*0\.0\s*\)/);
      }
    }
  });

  it("restores variables, resolved calls and recursion identity after nested local prototypes", () => {
    const source = shader(`
float before() { return 0.25; }
float after() { return 0.5; }
${vertex.replace("helper(0.0)", "before()")}
void frag() {
  float first = before();
  { float local(float parameter); int another(); }
  float second = after();
  gl_FragColor = vec4(first + second);
}`);
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "LocalFunctionPrototype",
      "LocalFunctionPrototype"
    ]);
    const info = getParsedShaderPassPayload(analysis.passes[0]).coreInfo;
    expect(info.vertexEntry.functions.map((fn) => fn.ident)).toEqual(["vert"]);
    const fragmentFunction = info.fragmentEntry.functions[0];
    expect(fragmentFunction.ident).toBe("frag");
    expect(fragmentFunction.localVariables.map((variable) => variable.ident)).toEqual(["first", "second"]);
    expect(fragmentFunction.calledFunctions.map((fn) => fn.ident)).toEqual(["before", "after"]);
  });

  it("retains the enclosing recursion identity after a same-name local prototype", () => {
    const analysis = ShaderAnalyzer.analyze(
      shader(`
float recursive(float value) { float recursive(float parameter); return recursive(value); }
${vertex.replace("helper(0.0)", "recursive(0.0)")}
void frag() { gl_FragColor = vec4(1.0); }`)
    );
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code).sort()).toEqual([
      "LocalFunctionPrototype",
      "RecursiveFunction"
    ]);
  });
});

describe.skipIf(typeof document === "undefined")("function prototype artifact driver controls", () => {
  it("links the supported programs and the native GLSL forward-prototype reference", () => {
    for (const target of targets) {
      const gl = document
        .createElement("canvas")
        .getContext(target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl") as
        | WebGLRenderingContext
        | WebGL2RenderingContext;
      expect(gl).not.toBeNull();
      const version = target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
      const cases = programs(supported).filter((program) => program.target === target);
      // This language-valid reference documents why ShaderLab must reject before emitting a partial artifact.
      cases.push({
        target,
        vertex: `${prototype}\nvoid main() { gl_Position = vec4(helper(0.0)); }\n${definition}`,
        fragment:
          target === ShaderLanguage.GLSLES300
            ? "out vec4 color; void main() { color = vec4(1.0); }"
            : "void main() { gl_FragColor = vec4(1.0); }"
      });
      try {
        for (const source of cases) {
          const program = gl.createProgram()!;
          const stages: WebGLShader[] = [];
          try {
            for (const [text, type] of [
              [source.vertex, gl.VERTEX_SHADER],
              [source.fragment, gl.FRAGMENT_SHADER]
            ] as const) {
              const stage = gl.createShader(type)!;
              stages.push(stage);
              gl.shaderSource(stage, `${version}precision mediump float;\n${text}`);
              gl.compileShader(stage);
              expect(gl.getShaderParameter(stage, gl.COMPILE_STATUS), gl.getShaderInfoLog(stage) + "\n" + text).toBe(
                true
              );
              gl.attachShader(program, stage);
            }
            gl.linkProgram(program);
            expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program)).toBe(true);
          } finally {
            gl.deleteProgram(program);
            for (const stage of stages) gl.deleteShader(stage);
          }
        }
      } finally {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    }
  });
});
