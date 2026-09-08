import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { afterAll, describe, expect, it } from "vitest";

const cases = [
  { expression: "MODE && 0", replacement: "1 || 0", selected: "0.25" },
  { expression: "0 && MODE", replacement: "1 || 1", selected: "0.25" },
  { expression: "(MODE || 1)", replacement: "0) && (0", selected: "0.75" },
  { expression: "MODE / 0", replacement: "1 || 1", selected: "0.25" },
  { expression: "MODE / 0", replacement: "0 && 1", selected: "0.75" },
  { expression: "MODE % 0", replacement: "1 || 1", selected: "0.25" },
  { expression: "MODE << 32", replacement: "1 || 1", selected: "0.25" },
  { expression: "MODE >> -1", replacement: "1 || 1", selected: "0.25" }
];

const contexts = new Map<ShaderLanguage, WebGLRenderingContext | WebGL2RenderingContext>();

afterAll(() => {
  for (const gl of contexts.values()) gl.getExtension("WEBGL_lose_context")?.loseContext();
});

function expectRenderedValue(target: ShaderLanguage, vertex: string, fragment: string, value: string): void {
  let gl = contexts.get(target);
  if (!gl) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    gl = canvas.getContext(target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl", {
      antialias: false,
      preserveDrawingBuffer: true
    }) as WebGLRenderingContext | WebGL2RenderingContext;
    expect(gl).not.toBeNull();
    contexts.set(target, gl);
  }
  const version = target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
  const program = gl.createProgram()!;
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment]
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(shader, `${version}precision mediump float;\n${source}`);
      gl.compileShader(shader);
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), gl.getShaderInfoLog(shader)).toBe(true);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program)).toBe(true);
    gl.useProgram(program);
    gl.viewport(0, 0, 1, 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, 1);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect(Array.from(pixel)).toEqual(Array(4).fill(Math.round(Number(value) * 255)));
  } finally {
    gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

describe("external macro replacement precedence", () => {
  it.each(cases)("keeps all compilation paths correct for $expression with MODE=$replacement", (fixture) => {
    const source = `Shader "external-macro-precedence" { SubShader "s" { Pass "p" {
void vert() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }
void frag() {
#if ${fixture.expression}
  gl_FragColor = vec4(0.25);
#else
  gl_FragColor = vec4(0.75);
#endif
}
VertexShader = vert; FragmentShader = frag;
} } }`;
    const analyzer = ShaderAnalyzer.analyze(source);
    expect(analyzer.diagnostics).toEqual([]);
    const compiler = new ShaderCompiler();
    const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      const programs = [
        ["analyzer", compiler.generate(analyzer.passes[0], target)],
        ["live", compiler._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, target)],
        ["offline", new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]]
      ] as const;
      for (const [path, program] of programs) {
        expect(program, path).toBeDefined();
        if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected generated shader");
        const macros = new Map([["MODE", fixture.replacement]]);
        const vertex = ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map(macros));
        const fragment = ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map(macros));
        expect(fragment, path).toContain(fixture.selected);
        expect(fragment, path).not.toContain(fixture.selected === "0.25" ? "0.75" : "0.25");
        expectRenderedValue(target, vertex, fragment, fixture.selected);
      }
    }
  });
});
