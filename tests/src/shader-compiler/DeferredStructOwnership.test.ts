import { Logger, ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { afterAll, describe, expect, it, vi } from "vitest";

const flags = Array.from({ length: 12 }, (_, index) => `defined(F${index})`);
const inheritedGuard = `(${flags.map((flag, index) => `(${flag} << ${index})`).join(" + ")}) != 0`;
const replacementGuard = flags.join(" || ");
const point = "gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0;";
const targets = [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300];
const variants = [{}, { F0: "0" }, { F11: "0" }];
const contexts = new Map<ShaderLanguage, WebGLRenderingContext | WebGL2RenderingContext>();
afterAll(() => {
  for (const gl of contexts.values()) gl.getExtension("WEBGL_lose_context")?.loseContext();
});

function interfaceShader(replacement: string, activateReplacement: boolean): string {
  return `Shader "deferred-struct-interface" {
#if ${inheritedGuard}
struct Varyings { vec4 tint; };
float selected() { return 0.0; }
Varyings vert() { Varyings value; value.tint = vec4(0.5); ${point} return value; }
void frag(Varyings value) { gl_FragColor = value.tint + selected(); }
#else
void vert() { ${point} }
void frag() { gl_FragColor = vec4(0.75); }
#endif
SubShader "s" { Pass "p" {
#if ${replacementGuard}
struct Varyings { ${replacement} };
${activateReplacement ? "float selected() { Varyings value; return 0.0; }" : ""}
#endif
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function ordinaryShader(options: {
  sourceFields: string;
  targetFields: string;
  member: string;
  retain?: boolean;
}): string {
  return `Shader "deferred-struct-fields" {
#if ${inheritedGuard}
struct Payload { ${options.sourceFields} };
vec4 inheritedValue(Payload item) { return item.${options.member}; }
vec4 selected() { Payload item; return inheritedValue(item); }
#endif
SubShader "s" { Pass "p" {
#if ${replacementGuard}
struct Payload { ${options.targetFields} };
vec4 selected() { Payload item; item.sharedColor = vec4(0.5); return ${options.retain === false ? "item.sharedColor" : "inheritedValue(item)"}; }
#endif
void vert() { ${point} }
void frag() {
#if ${replacementGuard}
gl_FragColor = selected();
#else
gl_FragColor = vec4(0.75);
#endif
}
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function* compile(source: string) {
  const compiler = new ShaderCompiler();
  const analysis = ShaderAnalyzer.analyze(source);
  expect(analysis.diagnostics).toEqual([]);
  const pass = compiler._parseShaderSource(source).subShaders[0].passes[0];
  for (const target of targets) {
    const paths = [
      ["analyzer", () => compiler.generate(analysis.passes[0], target)],
      [
        "live",
        () =>
          compiler._parseShaderPass(
            pass.contents,
            pass.vertexEntry,
            pass.fragmentEntry,
            target,
            undefined,
            pass.contentScopeStarts
          )
      ],
      ["offline", () => new ShaderPrecompiler().precompile(source, target).subShaders[0].passes[0]]
    ] as const;
    for (const [path, generate] of paths) yield { path, target, generate };
  }
}

function expectUnsupported(source: string): void {
  const log = vi.spyOn(Logger, "error").mockImplementation(() => undefined);
  try {
    for (const { path, generate } of compile(source)) {
      log.mockClear();
      if (path === "offline") expect(generate).toThrow(/precompile failed/);
      else expect(generate()).toBeUndefined();
      expect(
        log.mock.calls.some(([message]) => String(message).includes("UnsupportedDeferredDeclaration:")),
        path
      ).toBe(true);
    }
  } finally {
    log.mockRestore();
  }
}

function* programs(source: string) {
  for (const { path, target, generate } of compile(source)) {
    const output = generate();
    expect(output, path).toBeDefined();
    if (!output || ("isUsePass" in output && output.isUsePass)) throw new Error("Expected a compiled pass");
    for (const macros of variants) {
      yield {
        path,
        target,
        macros,
        vertex: ShaderMacroProcessor.evaluate(output.vertexShaderInstructions!, new Map(Object.entries(macros))),
        fragment: ShaderMacroProcessor.evaluate(output.fragmentShaderInstructions!, new Map(Object.entries(macros)))
      };
    }
  }
}

type Program = ReturnType<typeof programs> extends Generator<infer T> ? T : never;
function driver(program: Program): void {
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
  const label = `${program.path}/${program.target}/${JSON.stringify(program.macros)}`;
  const linked = gl.createProgram()!;
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, program.vertex],
      [gl.FRAGMENT_SHADER, program.fragment]
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(
        shader,
        `${program.target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : ""}precision mediump float;\n${source}`
      );
      gl.compileShader(shader);
      expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), `${label}: ${gl.getShaderInfoLog(shader)}`).toBe(true);
      gl.attachShader(linked, shader);
    }
    gl.linkProgram(linked);
    expect(gl.getProgramParameter(linked, gl.LINK_STATUS), `${label}: ${gl.getProgramInfoLog(linked)}`).toBe(true);
    gl.useProgram(linked);
    gl.viewport(0, 0, 1, 1);
    gl.drawArrays(gl.POINTS, 0, 1);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect(gl.getError(), label).toBe(gl.NO_ERROR);
    expect(Array.from(pixel), label).toEqual(Array(4).fill(Object.keys(program.macros).length ? 128 : 191));
  } finally {
    gl.deleteProgram(linked);
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

const sharedField = ordinaryShader({
  sourceFields: "vec4 oldField; vec4 sharedColor;",
  targetFields: "vec4 sharedColor;",
  member: "sharedColor"
});
const discardedConsumer = ordinaryShader({
  sourceFields: "vec4 oldField; vec4 sharedColor;",
  targetFields: "vec4 sharedColor;",
  member: "oldField",
  retain: false
});
const sameShapeIO = `Shader "deferred-same-shape" {
#if ${inheritedGuard}
struct Varyings { vec4 tint; };
#endif
SubShader "s" { Pass "p" {
#if ${replacementGuard}
struct Varyings { vec4 tint; };
Varyings vert() { Varyings value; value.tint = vec4(0.5); ${point} return value; }
void frag(Varyings value) { gl_FragColor = value.tint; }
#else
void vert() { ${point} }
void frag() { gl_FragColor = vec4(0.75); }
#endif
VertexShader = vert; FragmentShader = frag;
} } }`;

describe("deferred struct ownership admission", () => {
  it.each(["vec4 replacement;", "vec4 tint;", "float tint;"])(
    "rejects a selected ordinary owner replacing an interface consumer: %s",
    (replacement) => expectUnsupported(interfaceShader(replacement, true))
  );

  it.each([
    { sourceFields: "vec4 oldField; vec4 sharedColor;", targetFields: "vec4 sharedColor;", member: "oldField" },
    { sourceFields: "vec4 sharedColor;", targetFields: "float sharedColor;", member: "sharedColor" },
    {
      sourceFields: "vec4 values[2]; vec4 sharedColor;",
      targetFields: "vec4 values[1]; vec4 sharedColor;",
      member: "values[1]"
    },
    {
      sourceFields: "vec4 optional; vec4 sharedColor;",
      targetFields: "#ifdef FIELD\nvec4 optional;\n#endif\nvec4 sharedColor;",
      member: "optional"
    }
  ])("rejects unavailable or incompatible surviving field $member", (options) =>
    expectUnsupported(ordinaryShader(options))
  );

  it("rejects an incompatible member projected from an existing expression-macro owner", () => {
    const source = ordinaryShader({
      sourceFields: "vec4 oldField; vec4 sharedColor;",
      targetFields: "vec4 sharedColor;",
      member: "oldField"
    }).replace(
      "vec4 inheritedValue(Payload item) { return item.oldField; }",
      "vec4 inheritedValue(Payload item) { return READ(item); }"
    );
    expectUnsupported(source.replace(`\n#if ${inheritedGuard}`, `\n#define READ(p) p.oldField\n#if ${inheritedGuard}`));
  });

  it.each([
    ["same-shape IO", sameShapeIO],
    ["only shared ordinary fields", sharedField],
    [
      "shared expression-macro member",
      sharedField
        .replace(
          "vec4 inheritedValue(Payload item) { return item.sharedColor; }",
          "vec4 inheritedValue(Payload item) { return READ(item); }"
        )
        .replace(`\n#if ${inheritedGuard}`, `\n#define READ(p) p.sharedColor\n#if ${inheritedGuard}`)
    ],
    [
      "unreferenced ordinary replacement",
      `Shader "unused-struct" {
#if ${inheritedGuard}
struct Unused { float oldField; };
#endif
SubShader "s" { Pass "p" {
#if ${replacementGuard}
struct Unused { vec4 replacement; };
#endif
void vert() { ${point} }
void frag() {
#if ${replacementGuard}
gl_FragColor = vec4(0.5);
#else
gl_FragColor = vec4(0.75);
#endif
}
VertexShader = vert; FragmentShader = frag;
} } }`
    ],
    ["discarded incompatible consumer", discardedConsumer],
    ["unreferenced heterogeneous replacement", interfaceShader("vec4 replacement;", false)],
    ["unreferenced same-shape replacement", interfaceShader("vec4 tint;", false)]
  ])("preserves %s through all paths, targets and variants", (_name, source) => {
    for (const program of programs(source)) {
      expect(program.vertex).toContain("void main()");
      expect(program.fragment).toContain("void main()");
      expect(program.vertex + program.fragment).not.toContain("oldField");
      if (typeof document !== "undefined") driver(program);
    }
  });
});
