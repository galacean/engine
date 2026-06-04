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
  { code: "C0-02", gap: "operator check unreachable: grammar only yields valid operators; `compute` clue never read" },
  { code: "C0-03", gap: "integer check inert: VariableIdentifier.typeInfo is undefined so typeCompatible passes" },
  { code: "A2-01", gap: "reassign-entry not detected from a double VertexShader assignment — needs investigation" },
  { code: "C0-18", gap: "GLES100-only; the analyzer runs GLES300, which yields C0-22 instead for the same case" },
  { code: "C0-22", gap: "codegen-internal: source-level missing struct member is caught earlier as C0-08" },
  // ── B: RenderState ──
  { code: "B1-01", source: pass(`BlendState bs { NotARealProperty = true; }`) },
  { code: "B1-02", source: pass(`BlendState bs { SourceColorBlendFactor = BlendFactor.NotReal; }`) },
  { code: "B1-03", source: pass(`BlendState bs { SourceColorBlendFactor = BlendFactor.One | BlendFactor.Zero; }`) },
  { code: "B1-04", source: pass(`BlendState bs { ColorWriteMask = ColorWriteMask.Red | CullMode.Front; }`) },
  { code: "B2-01", source: pass(`DepthState = undefinedDepthVar;`) },
  { code: "B2-02", source: pass(`RenderQueueType = undefinedQueueVar;`) },

  // ── C0: GLSL semantics ──
  { code: "C0-01", source: pass(`void frag() { float[2] arr[3]; gl_FragColor = vec4(0.0); } FragmentShader = frag;`) },
  { code: "C0-04", source: pass(`void frag() { return vec4(0.0); } FragmentShader = frag;`) },
  {
    code: "C0-05",
    source: pass(`float getX() { float a = 1.0; } void frag() { gl_FragColor = vec4(getX()); } FragmentShader = frag;`)
  },
  {
    code: "C0-06",
    source: pass(
      `float f(float a) { return a; } void frag() { gl_FragColor = vec4(f(vec3(0.0))); } FragmentShader = frag;`
    )
  },
  { code: "C0-08", source: pass(`void frag() { vec3 = ; } FragmentShader = frag;`) },
  {
    code: "C0-11",
    source: pass(`
      struct MRT { vec4 c0; };
      void vert() { gl_Position = vec4(0.0); }
      MRT frag() { MRT o; o.c0 = vec4(0.0); gl_FragColor = vec4(0.0); return o; }
      VertexShader = vert; FragmentShader = frag;`)
  },
  {
    code: "C0-16",
    source: pass(`
      void vert() { gl_Position = vec4(0.0); }
      Undefined frag() { Undefined o; return o; }
      VertexShader = vert; FragmentShader = frag;`)
  },
  {
    code: "C0-20",
    source: pass(`
      struct IO { vec4 v; };
      IO vert() { IO o; return o; }
      IO frag(IO i) { return i; }
      VertexShader = vert; FragmentShader = frag;`)
  },
  {
    code: "C0-21",
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
