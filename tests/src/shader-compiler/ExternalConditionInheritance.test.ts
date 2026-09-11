import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/offline";
import { afterAll, describe, expect, it } from "vitest";

type MacroValues = Record<string, string>;

interface Guard {
  name: string;
  opening: string;
  closing: string;
  active: (macros: MacroValues) => boolean;
}

interface Program {
  path: string;
  target: ShaderLanguage;
  pass: number;
  vertex: string;
  fragment: string;
}

const macroVariants: MacroValues[] = [
  { MODE: "0", ENABLED: "1", PRIOR: "0", ALT: "0" },
  { MODE: "1", ENABLED: "1", PRIOR: "0", ALT: "0" },
  { MODE: "2", ENABLED: "1", PRIOR: "0", ALT: "0" },
  { MODE: "1", ENABLED: "0", PRIOR: "0", ALT: "0" },
  { MODE: "1", ENABLED: "1", PRIOR: "1", ALT: "0" },
  { MODE: "0", ENABLED: "1", PRIOR: "0", ALT: "2" },
  { MODE: "1", ENABLED: "1", PRIOR: "0", ALT: "0", DISABLED: "1" }
];

const guards: Guard[] = [
  {
    name: "external comparison",
    opening: "#if MODE == 1",
    closing: "#endif",
    active: (macros) => macros.MODE === "1"
  },
  {
    name: "conjunction",
    opening: "#if MODE == 1 && ENABLED != 0",
    closing: "#endif",
    active: (macros) => macros.MODE === "1" && macros.ENABLED !== "0"
  },
  {
    name: "disjunction with defined guard",
    opening: "#if (MODE == 1 || ALT == 2) && !defined(DISABLED)",
    closing: "#endif",
    active: (macros) => (macros.MODE === "1" || macros.ALT === "2") && !("DISABLED" in macros)
  },
  {
    name: "nested comparisons",
    opening: "#if MODE == 1\n#if ENABLED != 0",
    closing: "#endif\n#endif",
    active: (macros) => macros.MODE === "1" && macros.ENABLED !== "0"
  },
  {
    name: "elif with an external preceding arm",
    opening: "#if PRIOR == 1\n#elif MODE == 1",
    closing: "#endif",
    active: (macros) => macros.PRIOR !== "1" && macros.MODE === "1"
  },
  {
    name: "else after external if and elif arms",
    opening: "#if PRIOR == 1\n#elif MODE == 1\n#else",
    closing: "#endif",
    active: (macros) => macros.PRIOR !== "1" && macros.MODE !== "1"
  },
  {
    name: "known elif after an external preceding arm",
    opening: "#if MODE == 1\n#elif 1",
    closing: "#endif",
    active: (macros) => macros.MODE !== "1"
  }
];

function guarded(guard: Guard, body: string): string {
  return `${guard.opening}\n${body}\n${guard.closing}`;
}

function sourceFor(kind: string, guard: Guard): string {
  const declaration = (value: string) =>
    kind === "entry"
      ? `void vert() { gl_Position = vec4(${value}); }`
      : kind === "uniform"
        ? `${value === "0.5" ? "vec3" : "vec4"} color;`
        : `vec4 color() { return vec4(${value}); }`;
  const fallback = "void vert() { gl_Position = vec4(0.0); }";
  const entryGuard = {
    ...guard,
    opening: guard.opening.replace(/\n(#elif[^\n]*|#else)/g, `\n${fallback}\n$1`),
    closing: guard.opening.endsWith("#else")
      ? guard.closing
      : guard.closing.replace(/#endif/g, `#else\n${fallback}\n#endif`)
  };
  return `Shader "external-condition-${kind}" {
${guarded(guard, declaration("0.25"))}
SubShader "s" { Pass "p" {
${guarded(kind === "entry" ? entryGuard : guard, declaration("0.5"))}
${kind === "entry" ? "" : fallback}
void frag() {
  gl_FragColor = vec4(1.0);
${kind === "entry" ? "" : guarded(guard, `gl_FragColor = ${kind === "uniform" ? "vec4(color, 1.0)" : "color()"};`)}
}
VertexShader = vert; FragmentShader = frag;
} } }`;
}

function* programs(
  source: string,
  variants: MacroValues[] = macroVariants,
  options: {
    includeMap?: Record<string, string>;
    compiler?: ShaderCompiler;
    precompiler?: ShaderPrecompiler;
    runtimeOnly?: boolean;
  } = {}
): Generator<Program & { macros: MacroValues }> {
  const {
    includeMap = {},
    compiler = new ShaderCompiler(),
    precompiler = new ShaderPrecompiler(),
    runtimeOnly
  } = options;
  const analysis = runtimeOnly ? undefined : ShaderAnalyzer.analyze(source, { includeMap });
  if (analysis) expect(analysis.diagnostics).toEqual([]);
  compiler._setIncludeMap(includeMap);
  precompiler.setIncludeMap(includeMap);
  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    const parsed = compiler._parseShaderSource(source);
    const offline = runtimeOnly ? undefined : precompiler.precompile(source, target);
    for (const [passIndex, pass] of parsed.subShaders[0].passes.entries()) {
      const generated = [
        ...(analysis ? [["analyzer", compiler.generate(analysis.passes[passIndex], target)] as const] : []),
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
        ...(offline ? [["offline", offline.subShaders[0].passes[passIndex]] as const] : [])
      ] as const;
      for (const [path, program] of generated) {
        expect(program, `${path}, target ${target}, pass ${passIndex}`).toBeDefined();
        if (!program || ("isUsePass" in program && program.isUsePass)) throw new Error("Expected a generated pass");
        for (const macros of variants) {
          yield {
            path,
            target,
            pass: passIndex,
            macros,
            vertex: ShaderMacroProcessor.evaluate(program.vertexShaderInstructions!, new Map(Object.entries(macros))),
            fragment: ShaderMacroProcessor.evaluate(
              program.fragmentShaderInstructions!,
              new Map(Object.entries(macros))
            )
          };
        }
      }
    }
  }
}

const contexts = new Map<ShaderLanguage, WebGLRenderingContext | WebGL2RenderingContext>();

afterAll(() => {
  for (const gl of contexts.values()) gl.getExtension("WEBGL_lose_context")?.loseContext();
});

function expectDriverAcceptance(program: Program): void {
  let gl = contexts.get(program.target);
  if (!gl) {
    const contextType = program.target === ShaderLanguage.GLSLES300 ? "webgl2" : "webgl";
    gl = document.createElement("canvas").getContext(contextType) as WebGLRenderingContext | WebGL2RenderingContext;
    expect(gl, contextType).not.toBeNull();
    contexts.set(program.target, gl);
  }
  const version = program.target === ShaderLanguage.GLSLES300 ? "#version 300 es\n" : "";
  const shaders: WebGLShader[] = [];
  const linked = gl.createProgram()!;
  try {
    for (const [source, type] of [
      [program.vertex, gl.VERTEX_SHADER],
      [program.fragment, gl.FRAGMENT_SHADER]
    ] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(shader, `${version}precision mediump float;\n${source}`);
      gl.compileShader(shader);
      expect(
        gl.getShaderParameter(shader, gl.COMPILE_STATUS),
        `${program.path}, target ${program.target}: ${gl.getShaderInfoLog(shader)}\n${source}`
      ).toBe(true);
      gl.attachShader(linked, shader);
    }
    gl.linkProgram(linked);
    expect(gl.getProgramParameter(linked, gl.LINK_STATUS), gl.getProgramInfoLog(linked)).toBe(true);
  } finally {
    gl.deleteProgram(linked);
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

describe("external-condition ShaderLab inheritance", () => {
  for (const kind of ["helper", "entry", "uniform"]) {
    it.each(guards)(`replaces inherited ${kind} under $name in every compilation path`, (guard) => {
      for (const program of programs(sourceFor(kind, guard))) {
        const { vertex, fragment, macros, path, target } = program;
        const label = `${path}, target ${target}, macros ${JSON.stringify(macros)}`;
        const active = guard.active(macros);
        expect(vertex.match(/void\s+main\s*\(/g), label).toHaveLength(1);
        expect(vertex + fragment, label).not.toContain("0.25");
        if (kind === "entry") {
          expect(vertex, label).toContain(active ? "0.5" : "0.0");
        } else if (kind === "uniform") {
          expect(fragment.match(/uniform\s+vec3\s+color\s*;/g) ?? [], label).toHaveLength(active ? 1 : 0);
          expect(fragment, label).not.toMatch(/uniform\s+vec4\s+color/);
        } else {
          expect(fragment.match(/vec4\s+color\s*\(/g) ?? [], label).toHaveLength(active ? 1 : 0);
        }
        expectDriverAcceptance(program);
      }
    });
  }

  // Partially overlapping definitions remain unsupported by authoring diagnostics; live variants must retain candidates.
  it.each([
    ["", "MODE == 1", "#undef MODE\n#define MODE NEXT_MODE"],
    ["#define SELECTED MODE", "SELECTED == 1", "#undef MODE\n#define MODE NEXT_MODE"],
    ["#define SELECTED(x) x", "SELECTED(MODE) == 1", "#undef SELECTED\n#define SELECTED(x) NEXT_MODE"]
  ])("keeps inherited definitions when a condition dependency changes: %s, %s", (prefix, condition, mutation) => {
    const source = `Shader "changed-condition-dependency" {
${prefix}
#if ${condition}
vec4 color() { return vec4(0.25); }
#endif
SubShader "s" { Pass "p" {
${mutation}
#if ${condition}
vec4 color() { return vec4(0.5); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const program of programs(
      source,
      [
        { MODE: "1", NEXT_MODE: "0" },
        { MODE: "0", NEXT_MODE: "1" }
      ],
      { runtimeOnly: true }
    )) {
      const expected = program.macros.MODE === "1" ? "0.25" : "0.5";
      expect(program.fragment.match(/vec4\s+color\s*\(/g)).toHaveLength(1);
      expect(program.fragment).toContain(expected);
      expectDriverAcceptance(program);
    }
  });

  it.each([
    ["1", "0", "0.25"],
    ["0", "1", "0.5"]
  ])("retains conditions whose external macro hides a mutated dependency: %s to %s", (before, after, expected) => {
    const source = `Shader "hidden-condition-dependency" {
#define UNRELATED ${before}
#if MODE == 1
vec4 color() { return vec4(0.25); }
#endif
SubShader "s" { Pass "p" {
#undef UNRELATED
#define UNRELATED ${after}
#if MODE == 1
vec4 color() { return vec4(0.5); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const program of programs(source, [{ MODE: "UNRELATED" }], { runtimeOnly: true })) {
      expect(program.fragment.match(/vec4\s+color\s*\(/g)).toHaveLength(1);
      expect(program.fragment).toContain(expected);
      expectDriverAcceptance(program);
    }
  });

  it.each([
    ["5", "0.25"],
    ["6", "0.5"]
  ])("retains token grouping when external macro replacement changes precedence: %s", (value, expected) => {
    const source = `Shader "condition-token-grouping" {
#if A * 2 == ${value}
vec4 color() { return vec4(0.25); }
#endif
SubShader "s" { Pass "p" {
#if (A) * 2 == ${value}
vec4 color() { return vec4(0.5); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    for (const program of programs(source, [{ A: "1 + 2" }], { runtimeOnly: true })) {
      expect(program.fragment.match(/vec4\s+color\s*\(/g)).toHaveLength(1);
      expect(program.fragment).toContain(expected);
      expectDriverAcceptance(program);
    }
  });

  it.each(["elif", "else"])("keeps inherited %s definitions when preceding arms differ", (arm) => {
    const guard = (preceding: string) => `#if ${preceding} == 1\n#elif MODE == 1${arm === "else" ? "\n#else" : ""}`;
    const source = `Shader "different-preceding-arms" {
${guard("PRIOR")}
vec4 color() { return vec4(0.25); }
#endif
SubShader "s" { Pass "p" {
${guard("OTHER")}
vec4 color() { return vec4(0.5); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
} } }`;
    const mode = arm === "elif" ? "1" : "0";
    for (const program of programs(
      source,
      [
        { MODE: mode, PRIOR: "0", OTHER: "1" },
        { MODE: mode, PRIOR: "1", OTHER: "0" }
      ],
      { runtimeOnly: true }
    )) {
      expect(program.fragment.match(/vec4\s+color\s*\(/g)).toHaveLength(1);
      expect(program.fragment).toContain(program.macros.PRIOR === "0" ? "0.25" : "0.5");
      expectDriverAcceptance(program);
    }
  });

  it.each(["", "#define MODE 1"])(
    "preserves included condition identities across pass caches and reused source parsers: %s",
    (prefix) => {
      const compiler = new ShaderCompiler();
      const precompiler = new ShaderPrecompiler();
      const includeMap = {
        "shared.glsl": "/* # provenance */ #if MODE \\\n == 1\nvec4 color() { return vec4(0.25); }\n#endif\n"
      };
      for (const values of [
        ["0.5", "0.75"],
        ["0.75", "0.5"]
      ]) {
        const source = `Shader "cached-inheritance" {
${prefix}
#include "shared.glsl"
SubShader "s" {
${values
  .map(
    (value, index) => `Pass "p${index}" {
#if MODE == 1
vec4 color() { return vec4(${value}); }
#endif
void vert() { gl_Position = vec4(0.0); }
void frag() {
gl_FragColor = vec4(1.0);
#if MODE == 1
gl_FragColor = color();
#endif
}
VertexShader = vert; FragmentShader = frag;
}`
  )
  .join("\n")}
} }`;
        for (const program of programs(source, [{ MODE: "0" }, { MODE: "1" }], { includeMap, compiler, precompiler })) {
          const active = prefix !== "" || program.macros.MODE === "1";
          expect(program.fragment.match(/vec4\s+color\s*\(/g) ?? []).toHaveLength(active ? 1 : 0);
          expect(program.fragment).not.toContain("0.25");
          if (active) expect(program.fragment).toContain(values[program.pass]);
          expectDriverAcceptance(program);
        }
      }
    }
  );

  it("preserves intermediate macro mutations when a cached include restores its input state", () => {
    const compiler = new ShaderCompiler();
    const includeMap = {
      "temporary.glsl": `#undef UNRELATED
#define UNRELATED 0
#if MODE == 1
vec4 color() { return vec4(0.5); }
#endif
#undef UNRELATED
#define UNRELATED 1
`
    };
    for (const value of ["0.25", "0.375"]) {
      const source = `Shader "restored-include-state" {
#define UNRELATED 1
#if MODE == 1
vec4 color() { return vec4(${value}); }
#endif
SubShader "s" {
${["first", "cached"]
  .map(
    (name) => `Pass "${name}" {
#include "temporary.glsl"
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = color(); }
VertexShader = vert; FragmentShader = frag;
}`
  )
  .join("\n")}
} }`;
      for (const program of programs(source, [{ MODE: "UNRELATED" }], { includeMap, compiler, runtimeOnly: true })) {
        const label = `target ${program.target}, pass ${program.pass}, inherited value ${value}`;
        expect(program.fragment.match(/vec4\s+color\s*\(/g), label).toHaveLength(1);
        expect(program.fragment, label).toContain(value);
        expect(program.fragment, label).not.toContain("0.5");
        expectDriverAcceptance(program);
      }
    }
  });
});
