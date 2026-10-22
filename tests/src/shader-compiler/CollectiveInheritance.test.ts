import { Logger, ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { afterAll, describe, expect, it, vi } from "vitest";

type Kind = "helper" | "entry" | "uniform";
type Macros = Record<string, string>;

interface Program {
  path: string;
  target: ShaderLanguage;
  macros: Macros;
  vertex: string;
  fragment: string;
}

const rows: Macros[] = [{}, { A: "0" }, { B: "0" }, { A: "0", B: "0" }];
const contexts = new Map<ShaderLanguage, WebGLRenderingContext | WebGL2RenderingContext>();
const pointPosition = "gl_Position = vec4(0.0, 0.0, 0.0, 1.0);";

afterAll(() => {
  for (const gl of contexts.values()) gl.getExtension("WEBGL_lose_context")?.loseContext();
});

function collectiveSource(kind: Kind, inheritedGuard: boolean): string {
  const declaration = (value: string) => {
    if (kind === "uniform") return `${value === "0.25" ? "vec4" : "vec3"} color;`;
    if (kind === "helper") return `vec4 color() { return vec4(${value}); }`;
    return value === "0.25"
      ? "void vert() { gl_Position = vec4(0.25); }"
      : `void vert() { ${pointPosition} gl_PointSize = ${value === "0.5" ? "1.0" : "2.0"}; }`;
  };
  const alternatives = `#ifdef A\n${declaration("0.5")}\n#else\n${declaration("0.625")}\n#endif`;
  const inherited = inheritedGuard ? `#ifdef B\n${declaration("0.25")}\n#endif` : declaration("0.25");
  const fallbackEntry = `void vert() { ${pointPosition} gl_PointSize = 3.0; }`;
  const local = inheritedGuard
    ? `#ifdef B\n${alternatives}\n${kind === "entry" ? `#else\n${fallbackEntry}\n` : ""}#endif`
    : alternatives;
  const useColor = kind === "uniform" ? "vec4(color, 1.0)" : "color()";
  const fragment =
    kind === "entry"
      ? "gl_FragColor = vec4(0.5);"
      : inheritedGuard
        ? `gl_FragColor = vec4(0.75);\n#ifdef B\ngl_FragColor = ${useColor};\n#endif`
        : `gl_FragColor = ${useColor};`;
  return `Shader "collective-${kind}" {
${inherited}
SubShader "s" { Pass "p" {
${local}
${kind === "entry" ? "" : `void vert() { ${pointPosition} gl_PointSize = 1.0; }`}
void frag() { ${fragment} }
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function* programs(source: string, runtimeOnly = false): Generator<Program> {
  const compiler = new ShaderCompiler();
  const analysis = runtimeOnly ? undefined : ShaderAnalyzer.analyze(source);
  if (analysis) expect(analysis.diagnostics).toEqual([]);
  const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    const generated = [
      ...(analysis ? [["analyzer", compiler.generate(analysis.passes[0], target)] as const] : []),
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
      ...(runtimeOnly
        ? []
        : [["offline", new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]] as const])
    ] as const;
    for (const [path, program] of generated) {
      expect(program, path).toBeDefined();
      if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected a generated pass");
      for (const macros of rows) {
        yield {
          path,
          target,
          macros,
          vertex: ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map(Object.entries(macros))),
          fragment: ShaderMacroProcessor.evaluate(program.fragmentShaderInstructions!, new Map(Object.entries(macros)))
        };
      }
    }
  }
}

function expectRenderedColor(
  program: Program,
  value: number,
  uniform: boolean | { name: string; size: 1 | 3 | 4 },
  alpha?: number
): void {
  let gl = contexts.get(program.target);
  if (!gl) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    gl = canvas.getContext(program.target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl", {
      antialias: false,
      preserveDrawingBuffer: true
    }) as WebGLRenderingContext | WebGL2RenderingContext;
    expect(gl).not.toBeNull();
    contexts.set(program.target, gl);
  }
  const label = `${program.path}, target ${program.target}, macros ${JSON.stringify(program.macros)}`;
  const version = program.target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
  const linked = gl.createProgram()!;
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, program.vertex],
      [gl.FRAGMENT_SHADER, program.fragment]
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(shader, `${version}precision mediump float;\n${source}`);
      gl.compileShader(shader);
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), `${label}: ${gl.getShaderInfoLog(shader)}`).toBe(true);
      gl.attachShader(linked, shader);
    }
    gl.linkProgram(linked);
    expect(gl.getProgramParameter(linked, gl.LINK_STATUS), `${label}: ${gl.getProgramInfoLog(linked)}`).toBe(true);
    gl.useProgram(linked);
    if (uniform) {
      const binding = uniform === true ? { name: "color", size: 3 } : uniform;
      const location = gl.getUniformLocation(linked, binding.name);
      expect(location, label).not.toBeNull();
      if (binding.size === 1) gl.uniform1f(location, value);
      else if (binding.size === 3) gl.uniform3f(location, value, value, value);
      else gl.uniform4f(location, value, value, value, value);
    }
    gl.viewport(0, 0, 1, 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, 1);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect(gl.getError(), label).toBe(gl.NO_ERROR);
    const channel = Math.round(value * 255);
    const expectedAlpha = alpha ?? (uniform === true ? 1 : value);
    expect(Array.from(pixel), label).toEqual([channel, channel, channel, Math.round(expectedAlpha * 255)]);
  } finally {
    gl.deleteProgram(linked);
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

describe("collective ShaderLab inheritance coverage", () => {
  for (const kind of ["helper", "entry", "uniform"] as const) {
    it.each([false, true])(
      `replaces an inherited ${kind} with a complete if/else union; enclosing guard: %s`,
      (guard) => {
        for (const program of programs(collectiveSource(kind, guard))) {
          const active = !guard || "B" in program.macros;
          const first = "A" in program.macros;
          const label = `${program.path}, target ${program.target}, macros ${JSON.stringify(program.macros)}`;
          expect(program.vertex.match(/void\s+main\s*\(/g), label).toHaveLength(1);
          expect(program.fragment.match(/void\s+main\s*\(/g), label).toHaveLength(1);
          expect(program.vertex + program.fragment, label).not.toContain("0.25");
          if (kind === "helper") {
            expect(program.fragment.match(/vec4\s+color\s*\(/g) ?? [], label).toHaveLength(active ? 1 : 0);
          } else if (kind === "uniform") {
            expect(program.fragment.match(/uniform\s+vec3\s+color\s*;/g) ?? [], label).toHaveLength(active ? 1 : 0);
            expect(program.fragment, label).not.toMatch(/uniform\s+vec4\s+color/);
          } else {
            const pointSize = active ? (first ? "1\\.0" : "2\\.0") : "3\\.0";
            expect(program.vertex, label).toMatch(new RegExp(`gl_PointSize\\s*=\\s*${pointSize}`));
          }
          const value = kind === "entry" ? 0.5 : active ? (first ? 0.5 : 0.625) : 0.75;
          expectRenderedColor(program, value, kind === "uniform" && active);
        }
      }
    );
  }

  it("rejects an incomplete union and retains its inherited exclusive runtime variant", () => {
    const source = `Shader "incomplete-collective-coverage" {
vec4 color() { return vec4(0.25); }
SubShader "s" { Pass "p" {
#ifdef A
#ifdef B
vec4 color() { return vec4(0.5); }
#else
vec4 color() { return vec4(0.625); }
#endif
#endif
void vert() { ${pointPosition} gl_PointSize = 1.0; }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    expect(ShaderAnalyzer.analyze(source).diagnostics.map((diagnostic) => diagnostic.code)).toContain("Redefinition");
    for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
      expect(() => new ShaderPrecompiler().precompile(source, target)).toThrow("Redefinition");
    }
    for (const program of programs(source, true)) {
      if ("A" in program.macros) continue;
      expect(program.fragment.match(/vec4\s+color\s*\(/g)).toHaveLength(1);
      expect(program.fragment).toContain("0.25");
      expectRenderedColor(program, 0.25, false);
    }
  });

  it("uses a preceding arm's final function signature after its inherited candidate is removed", () => {
    const source = `Shader "preceding-final-function" {
vec4 color() { return vec4(0.25); }
SubShader "s" { Pass "p" {
#ifdef A
vec3 color() { return vec3(0.5); }
vec4 caller() { return vec4(color(), 1.0); }
#else
vec4 color() { return vec4(0.75); }
vec4 caller() { return color(); }
#endif
void vert() { ${pointPosition} gl_PointSize = 1.0; }
void frag() { gl_FragColor = caller(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const program of programs(source)) {
      const active = "A" in program.macros;
      expect(program.fragment).not.toMatch(/vec4\s+color\s*\([^)]*\)\s*;/);
      expectRenderedColor(program, active ? 0.5 : 0.75, false, active ? 1 : 0.75);
    }
  });

  it.each([2, 3])("preserves inherited callers across complete overrides in %i source layers", (layers) => {
    const source = `Shader "inherited-caller-layers" {
vec4 color() { return vec4(0.25); }
vec4 caller() { return color(); }
SubShader "s" {
${layers === 3 ? "#ifdef A\nvec4 color() { return vec4(0.375); }\n#else\nvec4 color() { return vec4(0.4375); }\n#endif" : ""}
Pass "p" {
#ifdef ${layers === 3 ? "B" : "A"}
vec4 color() { return vec4(0.5); }
#else
vec4 color() { return vec4(0.75); }
#endif
void vert() { ${pointPosition} gl_PointSize = 1.0; }
void frag() { gl_FragColor = caller(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const program of programs(source)) {
      const active = (layers === 3 ? "B" : "A") in program.macros;
      expect(program.fragment).not.toMatch(/0\.25|0\.375|0\.4375/);
      expect(program.fragment.match(/vec4\s+color\s*\([^)]*\)\s*\{/g)).toHaveLength(1);
      expectRenderedColor(program, active ? 0.5 : 0.75, false);
    }
  });

  it("accepts equivalent forward signatures with different parameter names and explicit input qualifiers", () => {
    const source = `Shader "forward-parameter-names" {
vec4 color(float inherited) { return vec4(inherited); }
vec4 caller() { return color(0.5); }
SubShader "s" { Pass "p" {
#ifdef A
vec4 color(float first) { return vec4(first); }
#else
vec4 color(in float second) { return vec4(second); }
#endif
void vert() { ${pointPosition} gl_PointSize = 1.0; }
void frag() { gl_FragColor = caller(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const program of programs(source)) expectRenderedColor(program, 0.5, false);
  });

  it.each(["single", "union"])("moves the final %s uniform declarations ahead of inherited references", (mode) => {
    const source = `Shader "inherited-uniform-reference" {
float u;
vec4 color() { return vec4(u); }
SubShader "s" { Pass "p" {
${mode === "single" ? "vec4 u;" : "#ifdef A\nvec4 u;\n#else\nfloat u;\n#endif"}
void vert() { ${pointPosition} gl_PointSize = 1.0; }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const program of programs(source)) {
      const vector = mode === "single" || "A" in program.macros;
      expect(program.fragment.match(/uniform\s+(float|vec4)\s+u\s*;/g)).toHaveLength(1);
      expect(program.fragment.indexOf("uniform")).toBeLessThan(program.fragment.indexOf("vec4 color"));
      expectRenderedColor(program, 0.5, { name: "u", size: vector ? 4 : 1 });
    }
  });

  it.each(["single", "union"])("moves the final %s struct definitions ahead of inherited type references", (mode) => {
    const declaration = "struct Data { vec4 value; };";
    const source = `Shader "inherited-struct-reference" {
${declaration}
Data copy(Data value) { return value; }
SubShader "s" { Pass "p" {
${mode === "single" ? declaration : `#ifdef A\n${declaration}\n#else\n${declaration}\n#endif`}
void vert() { ${pointPosition} gl_PointSize = 1.0; }
void frag() { Data value; value.value = vec4(0.5); Data result = copy(value); gl_FragColor = result.value; }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const program of programs(source)) {
      expect(program.fragment.match(/struct\s+Data\s*\{/g)).toHaveLength(1);
      expect(program.fragment.indexOf("struct Data")).toBeLessThan(program.fragment.indexOf("Data copy"));
      expectRenderedColor(program, 0.5, false);
    }
  });

  it.each([
    {
      name: "different forward function signatures",
      inherited: "float color() { return 0.25; }\nvec4 caller() { return vec4(color()); }",
      replacement: "#ifdef A\nfloat color() { return 0.5; }\n#else\nvec4 color() { return vec4(0.75); }\n#endif",
      call: "caller()"
    },
    {
      name: "struct macro context barrier",
      inherited: "struct Data { vec4 value; };\nData copy(Data value) { return value; }",
      replacement:
        "#define CONTEXT_CHANGE 1\nstruct Data { vec4 value; };\nvec4 caller() { Data value; value.value = vec4(0.5); return copy(value).value; }",
      call: "caller()"
    },
    {
      name: "uniform macro context barrier",
      inherited: "float u;\nvec4 color() { return vec4(u); }",
      replacement: "#define CONTEXT_CHANGE 1\nvec4 u;",
      call: "color()"
    }
  ])("rejects $name instead of emitting an invalid forward declaration", ({ inherited, replacement, call }) => {
    const source = `Shader "unsupported-forward-context" {
${inherited}
SubShader "s" { Pass "p" {
${replacement}
void vert() { ${pointPosition} gl_PointSize = 1.0; }
void frag() { gl_FragColor = ${call}; }
VertexShader = vert; FragmentShader = frag;
} } }`;
    const analysis = ShaderAnalyzer.analyze(source);
    expect(analysis.diagnostics).toEqual([]);
    const compiler = new ShaderCompiler();
    const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
    const errors = vi.spyOn(Logger, "error").mockImplementation(() => undefined);
    try {
      for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
        expect(compiler.generate(analysis.passes[0], target)).toBeUndefined();
        expect(
          compiler._parseShaderPass(
            pass.contents,
            pass.vertexEntry,
            pass.fragmentEntry,
            target,
            undefined,
            pass.contentScopeStarts
          )
        ).toBeUndefined();
        expect(() => new ShaderPrecompiler().precompile(source, target)).toThrow("precompile failed");
      }
      expect(errors.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
        "UnsupportedForwardDeclaration"
      );
    } finally {
      errors.mockRestore();
    }
  });
});
