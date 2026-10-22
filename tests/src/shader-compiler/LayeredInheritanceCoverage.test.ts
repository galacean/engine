import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { afterAll, describe, expect, it } from "vitest";

type Coverage = "layered" | "same-scope" | "incomplete";
const targets = [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300];
const contexts = new Map<ShaderLanguage, WebGLRenderingContext | WebGL2RenderingContext>();

afterAll(() => {
  for (const gl of contexts.values()) gl.getExtension("WEBGL_lose_context")?.loseContext();
});

function sourceFor(coverage: Coverage): string {
  const subShader = coverage === "same-scope" ? "" : "#ifdef A\nvec4 color() { return vec4(0.5); }\n#endif";
  const pass =
    coverage === "same-scope"
      ? "#ifdef A\nvec4 color() { return vec4(0.5); }\n#else\nvec4 color() { return vec4(0.75); }\n#endif"
      : `${coverage === "layered" ? "#ifndef A" : "#if !defined(A) && defined(B)"}\nvec4 color() { return vec4(0.75); }\n#endif`;
  return `Shader "layered-coverage" {
vec4 color() { return vec4(0.25); }
SubShader "s" {
${subShader}
Pass "p" {
${pass}
void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function expectPixel(target: ShaderLanguage, vertex: string, fragment: string, value: number): void {
  let gl = contexts.get(target);
  if (!gl) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    gl = canvas.getContext(target === ShaderLanguage.GLSLES100 ? "webgl" : "webgl2", {
      antialias: false,
      preserveDrawingBuffer: true
    }) as WebGLRenderingContext | WebGL2RenderingContext;
    expect(gl).not.toBeNull();
    contexts.set(target, gl);
  }
  const prefix = `${target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : ""}precision mediump float;\n`;
  const program = gl.createProgram()!;
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment]
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(shader, prefix + source);
      gl.compileShader(shader);
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), gl.getShaderInfoLog(shader) ?? "").toBe(true);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program) ?? "").toBe(true);
    gl.useProgram(program);
    gl.viewport(0, 0, 1, 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, 1);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    expect(Array.from(pixel)).toEqual(Array(4).fill(Math.round(value * 255)));
  } finally {
    gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

describe("inheritance coverage across ShaderLab source layers", () => {
  it.each(["layered", "same-scope"] as const)("accepts a complete %s union through every compiler path", (coverage) => {
    const source = sourceFor(coverage);
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).toEqual([]);
    const compiler = new ShaderCompiler();
    const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
    for (const target of targets) {
      const generated = [
        ["analyzer", compiler.generate(analysis.passes[0], target)],
        [
          "live",
          compiler._parseShaderPass(
            pass.contents,
            pass.vertexEntry,
            pass.fragmentEntry,
            target,
            undefined,
            pass.contentScopeStarts
          )
        ],
        ["offline", new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]]
      ] as const;
      for (const [path, program] of generated) {
        expect(program, path).toBeDefined();
        if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected a generated pass");
        for (const active of [false, true]) {
          const macros = new Map<string, string>(active ? [["A", "0"]] : []);
          const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, macros);
          const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, macros);
          expect(fragment.match(/vec4\s+color\s*\([^)]*\)\s*\{/g), path).toHaveLength(1);
          expect(fragment, path).not.toContain("0.25");
          expectPixel(target, vertex, fragment, active ? 0.5 : 0.75);
        }
      }
    }
  });

  it("retains an uncovered ancestor variant and diagnoses incomplete layered coverage", () => {
    const source = sourceFor("incomplete");
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).toContain("Redefinition");
    const compiler = new ShaderCompiler();
    const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
    for (const target of targets) {
      expect(() => new ShaderPrecompiler().precompile(source, target)).toThrow("Redefinition");
      const program = compiler._parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        target,
        undefined,
        pass.contentScopeStarts
      )!;
      const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map());
      const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map());
      expect(fragment.match(/vec4\s+color\s*\([^)]*\)\s*\{/g)).toHaveLength(1);
      expectPixel(target, vertex, fragment, 0.25);
    }
  });
});
