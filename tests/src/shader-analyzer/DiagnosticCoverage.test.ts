import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { describe, expect, it } from "vitest";

/**
 * Coverage map: every diagnostic code in the registry must have a shader that
 * triggers it through the production analyzer. A code with no triggering case is
 * either untested or dead — both are findings. Presence (not multiplicity) is
 * asserted here; report-once is enforced in ShaderIOAnalyzer.test.ts.
 */

const analyzer = new ShaderAnalyzer();

function pass(body: string): string {
  return `Shader "cov" { SubShader "s" { Pass "p" {\n${body}\n} } }`;
}

// Each case: a shader expected to produce `code`. `gap` marks codes with no
// analyzer-reachable trigger (dead / backend-specific) — documented, not dropped.
const cases: { code: string; source?: string; gap?: string }[] = [
  {
    code: "DuplicateEntryAssignment",
    source: pass(`
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void vert2(Attributes attr) { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert; VertexShader = vert2; FragmentShader = frag;`)
  },
  {
    code: "UndeclaredStructMember",
    source: pass(`
      struct Varyings { vec4 v; };
      Varyings vert() { Varyings o; o.v = vec4(0.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.notAField; }
      VertexShader = vert; FragmentShader = frag;`)
  },
  // ── B: RenderState ──
  { code: "InvalidRenderStateProperty", source: pass(`BlendState bs { NotARealProperty = true; }`) },
  { code: "InvalidEnumValue", source: pass(`BlendState bs { SourceColorBlendFactor = BlendFactor.NotReal; }`) },
  {
    code: "BitwiseOrOnNonBitmask",
    source: pass(`BlendState bs { SourceColorBlendFactor = BlendFactor.One | BlendFactor.Zero; }`)
  },
  { code: "MixedEnumTypes", source: pass(`BlendState bs { ColorWriteMask = ColorWriteMask.Red | CullMode.Front; }`) },
  { code: "InvalidRenderStateVariable", source: pass(`DepthState = undefinedDepthVar;`) },
  { code: "InvalidRenderQueueVariable", source: pass(`RenderQueueType = undefinedQueueVar;`) },

  // ── C0: GLSL semantics ──
  { code: "ReturnInVoidFunction", source: pass(`void frag() { return vec4(0.0); } FragmentShader = frag;`) },
  {
    code: "GlFragData",
    source: pass(`
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragData[0] = vec4(0.0); }
      VertexShader = vert; FragmentShader = frag;`)
  },
  {
    code: "MissingReturn",
    source: pass(`float getX() { float a = 1.0; } void frag() { gl_FragColor = vec4(getX()); } FragmentShader = frag;`)
  },
  {
    code: "NonConstructibleReturnType",
    source: pass(
      `mediump sampler2D u_tex; sampler2D getTex() { return u_tex; } void frag() { gl_FragColor = vec4(0.0); } FragmentShader = frag;`
    )
  },
  {
    code: "NestedIOStruct",
    source: pass(
      `struct Inner { vec4 v; }; struct Varyings { Inner nested; }; Varyings vert() { Varyings o; return o; } void frag(Varyings i) { gl_FragColor = i.nested.v; } VertexShader = vert; FragmentShader = frag;`
    )
  },
  {
    code: "ConstDivideByZero",
    source: pass(`void frag() { float x = 1.0 / 0.0; gl_FragColor = vec4(x); } FragmentShader = frag;`)
  },
  {
    code: "ShiftOutOfRange",
    source: pass(`void frag() { int x = 1 << 40; gl_FragColor = vec4(float(x)); } FragmentShader = frag;`)
  },
  {
    code: "IndexOutOfBounds",
    source: pass(`void frag() { vec3 v = vec3(0.0); float y = v[5]; gl_FragColor = vec4(y); } FragmentShader = frag;`)
  },
  {
    code: "InvalidUnaryOperand",
    source: pass(`void frag() { float u_f = 1.0; bool ok = !u_f; gl_FragColor = vec4(0.0); } FragmentShader = frag;`)
  },
  {
    code: "InvalidBinaryOperands",
    source: pass(`void frag() { bool b = true; float x = b + 1.0; gl_FragColor = vec4(x); } FragmentShader = frag;`)
  },
  {
    code: "NonIntegerIndex",
    source: pass(`void frag() { vec3 v = vec3(0.0); float y = v[1.5]; gl_FragColor = vec4(y); } FragmentShader = frag;`)
  },
  {
    code: "NonIndexableType",
    source: pass(`void frag() { float f = 1.0; float y = f[0]; gl_FragColor = vec4(y); } FragmentShader = frag;`)
  },
  {
    code: "ExpectedSampler",
    source: pass(
      `void frag() { vec2 uv = vec2(0.0); vec4 c = texture(uv, uv); gl_FragColor = c; } FragmentShader = frag;`
    )
  },
  {
    code: "InvalidConversion",
    source: pass(
      `mediump sampler2D u_tex; void frag() { float x = float(u_tex); gl_FragColor = vec4(x); } FragmentShader = frag;`
    )
  },
  {
    code: "ConstructorArgType",
    source: pass(
      `mediump sampler2D u_tex; void frag() { vec2 v = vec2(u_tex, 1.0); gl_FragColor = vec4(v, 0.0, 1.0); } FragmentShader = frag;`
    )
  },
  {
    code: "ConstructorArgCount",
    source: pass(`void frag() { vec3 v = vec3(1.0, 2.0); gl_FragColor = vec4(v, 1.0); } FragmentShader = frag;`)
  },
  {
    code: "NonConstInitializer",
    source: pass(
      `float u_scale; void frag() { const float c = u_scale; gl_FragColor = vec4(c); } FragmentShader = frag;`
    )
  },
  {
    code: "NonConstArraySize",
    source: pass(`void frag() { int n = 3; float a[n]; gl_FragColor = vec4(a[0]); } FragmentShader = frag;`)
  },
  {
    code: "MissingVertexPosition",
    source: pass(
      `void vert() { } void frag() { gl_FragColor = vec4(0.0); } VertexShader = vert; FragmentShader = frag;`
    )
  },
  {
    code: "NonFlatIntegerVarying",
    source: pass(
      `struct Varyings { vec4 pos; int id; }; Varyings vert() { Varyings o; gl_Position = vec4(0.0); return o; } void frag(Varyings i) { gl_FragColor = vec4(float(i.id)); } VertexShader = vert; FragmentShader = frag;`
    )
  },
  {
    code: "UnreachableCode",
    source: pass(`void frag() { gl_FragColor = vec4(0.0); return; gl_FragColor = vec4(1.0); } FragmentShader = frag;`)
  },
  {
    code: "MisplacedControlFlow",
    source: pass(`void frag() { gl_FragColor = vec4(0.0); break; } FragmentShader = frag;`)
  },
  {
    code: "NoMatchingOverload",
    source: pass(
      `float f(float a) { return a; } void frag() { gl_FragColor = vec4(f(vec3(0.0))); } FragmentShader = frag;`
    )
  },
  { code: "SyntaxError", source: pass(`void frag() { vec3 = ; } FragmentShader = frag;`) },
  {
    code: "GlFragColorWithMrt",
    source: pass(`
      struct MRT { vec4 c0; };
      void vert() { gl_Position = vec4(0.0); }
      MRT frag() { MRT o; o.c0 = vec4(0.0); gl_FragColor = vec4(0.0); return o; }
      VertexShader = vert; FragmentShader = frag;`)
  },
  {
    code: "InvalidMrtStruct",
    source: pass(`
      void vert() { gl_Position = vec4(0.0); }
      Undefined frag() { Undefined o; return o; }
      VertexShader = vert; FragmentShader = frag;`)
  },
  {
    code: "StructRoleConflict",
    source: pass(`
      struct IO { vec4 v; };
      IO vert() { IO o; return o; }
      IO frag(IO i) { return i; }
      VertexShader = vert; FragmentShader = frag;`)
  },
  {
    code: "StructRoleConflict",
    source: pass(`
      struct IO { vec4 v; };
      void vert(IO attr) { gl_Position = vec4(0.0); }
      IO frag() { IO o; return o; }
      VertexShader = vert; FragmentShader = frag;`)
  }
];

describe("diagnostic coverage map", () => {
  for (const c of cases) {
    // Codes with no analyzer-reachable trigger are recorded as skips with a reason, not dropped.
    if (c.gap) {
      it.skip(`${c.code} — ${c.gap}`, () => {});
      continue;
    }
    it(`${c.code} is produced`, () => {
      const codes = analyzer.analyze(c.source!).diagnostics.map((d) => d.code);
      expect(codes, `expected ${c.code}, got [${[...new Set(codes)].join(", ")}]`).to.include(c.code);
    });
  }
});
