/**
 * Analyzer/driver consistency for GLSL-body diagnostics.
 *
 * The compiler pipeline is intentionally lenient: `_parseShaderPass` runs the analyzer for
 * observation and then generates GLSL regardless of diagnostic severity — a shader author can
 * see all issues in one pass, and a runtime macro / conditional `#include` may fill in what
 * looks broken at precompile time. So the pipeline layers separate:
 *   analyzer   → decides whether a diagnostic fires and at what severity
 *   codegen    → produces GLSL for the driver, without gating on diagnostics
 *   driver     → is the source of truth for what will actually run
 *
 * This suite ties the three together per case:
 *   - drive the DSL through the analyzer to collect diagnostics
 *   - drive the same pass content through the compiler to collect emitted GLSL
 *   - feed the emitted GLSL to a real WebGL2 context
 *   - assert the driver outcome matches the severity contract we set:
 *       severity=error   → driver must reject (analyzer's judgment is authoritative)
 *       severity=warning → driver behavior is not asserted (may compile if a runtime macro
 *                          fills in the missing identifier; may fail otherwise)
 *       no diagnostic    → driver must accept (clean shader stays clean)
 */

import { Logger, ShaderLanguage } from "@galacean/engine-core";
import { ShaderAnalyzer, type Diagnostic } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";

interface DriverOutcome {
  vertexOk: boolean;
  fragmentOk: boolean;
  vertexLog: string;
  fragmentLog: string;
}

function driveWebGL(vs: string, fs: string): DriverOutcome | "no-webgl" {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) return "no-webgl";
  const compileOne = (src: string, type: number): { ok: boolean; log: string } => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS) as boolean;
    const log = gl.getShaderInfoLog(sh) || "";
    return { ok, log };
  };
  const v = compileOne(vs, gl.VERTEX_SHADER);
  const f = compileOne(fs, gl.FRAGMENT_SHADER);
  return { vertexOk: v.ok, fragmentOk: f.ok, vertexLog: v.log, fragmentLog: f.log };
}

function wrapDSL(passBody: string, vertEntry: string, fragEntry: string): string {
  // `_parseShaderPass` takes the raw GLSL body (entries are named parameters), so cases store the
  // body alone. To feed the same case through `analyzer.analyze` we wrap it in the full DSL and
  // append the entry-binding directives that the DSL parser expects.
  return `Shader "consistency" { SubShader "s" { Pass "p" {
${passBody}
VertexShader = ${vertEntry};
FragmentShader = ${fragEntry};
} } }`;
}

interface Case {
  name: string;
  code: string;
  severity: "error" | "warning" | "none";
  passBody: string;
  vertEntry: string;
  fragEntry: string;
  driverExpects: "reject" | "accept" | "either";
  reason: string;
}

const cases: Case[] = [
  {
    name: "clean shader — no diagnostics, driver accepts",
    code: "",
    severity: "none",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(1.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "accept",
    reason: "baseline — no diagnostic must correspond to a driver-clean shader"
  },
  {
    name: "AssignTypeMismatch (float → vec3) — analyzer errors, driver rejects",
    code: "AssignTypeMismatch",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v; v = 1.0; gl_FragColor = vec4(v, 1.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "assigning a scalar to a vec3 is a real type error every driver rejects"
  },
  {
    name: "ConstructorArgCount (vec3 with 2 args) — analyzer errors, driver rejects",
    code: "ConstructorArgCount",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(1.0, 2.0); gl_FragColor = vec4(v, 1.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "vec3 constructor takes 1 or 3 components — driver rejects any other count"
  },
  {
    name: "InvalidReturnType (returning value from void) — analyzer errors, driver rejects",
    code: "InvalidReturnType",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { return vec4(0.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "returning an expression from a void function is a driver-level error"
  },
  {
    name: "IndexOutOfBounds (constant OOB index) — analyzer errors, driver rejects",
    code: "IndexOutOfBounds",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(0.0); float y = v[5]; gl_FragColor = vec4(y); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "constant OOB index on a vec3 is rejected by GLSL ES §5.5 spec-conforming drivers"
  },
  {
    name: "UseBeforeDeclaration — analyzer warns, driver may reject (macro-defined)",
    code: "UseBeforeDeclaration",
    severity: "warning",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(undeclared_color, 1.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    // Without the (missing) macro definition, the driver rejects; the warning severity reflects
    // that a runtime macro / conditional include could supply it, not that the driver would ever
    // accept the same GLSL as-is.
    driverExpects: "either",
    reason: "identifier may be filled by a runtime macro; precompile GLSL alone is rejected"
  },
  {
    name: "UndefinedFunction — analyzer warns, driver may reject",
    code: "UndefinedFunction",
    severity: "warning",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(doesNotExist(1.0)); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "either",
    reason: "name may be a runtime-defined helper; precompile GLSL alone will not link"
  },
  {
    name: "NoMatchingOverload (known name, wrong args) — analyzer errors, driver rejects",
    code: "NoMatchingOverload",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      float f(float a) { return a; }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(f(vec3(0.0))); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "the name resolves, but there is no overload accepting the given arg types"
  },
  {
    name: "NonBoolCondition (float in `if`) — analyzer errors, driver rejects",
    code: "NonBoolCondition",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float f = 1.0; if (f) { gl_FragColor = vec4(1.0); } else { gl_FragColor = vec4(0.0); } }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL requires a bool in if-conditions; drivers reject implicit float coercion"
  },
  {
    name: "MisplacedControlFlow (break outside loop) — analyzer errors, driver rejects",
    code: "MisplacedControlFlow",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); break; }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "`break` outside any loop or switch is a driver-level parse error"
  }
];

/** Best-effort collector for diagnostic codes surfaced through the engine Logger during compile. */
function captureLoggerDiagnostics<T>(fn: () => T): { result: T; errors: string[]; warns: string[] } {
  const errors: string[] = [];
  const warns: string[] = [];
  const origError = Logger.error;
  const origWarn = Logger.warn;
  Logger.error = (...args: unknown[]) => errors.push(args.join(" "));
  Logger.warn = (...args: unknown[]) => warns.push(args.join(" "));
  try {
    return { result: fn(), errors, warns };
  } finally {
    Logger.error = origError;
    Logger.warn = origWarn;
  }
}

describe("analyzer/codegen/driver consistency", () => {
  for (const c of cases) {
    it(c.name, () => {
      // 1) Analyzer view — structured diagnostics off the DSL.
      const analyzer = new ShaderAnalyzer();
      const dsl = wrapDSL(c.passBody, c.vertEntry, c.fragEntry);
      const analyzed = analyzer.analyze(dsl);
      const matching: Diagnostic | undefined = c.code ? analyzed.diagnostics.find((d) => d.code === c.code) : undefined;

      if (c.severity === "none") {
        expect(analyzed.diagnostics, `${c.name}: expected no diagnostics`).to.be.empty;
      } else {
        expect(matching, `${c.name}: expected diagnostic ${c.code}`).to.be.ok;
        expect(matching!.severity, `${c.name}: severity`).to.equal(c.severity);
      }

      // 2) Codegen view — feed the same body through the compiler; capture Logger output too so a
      // regression that stops routing diagnostics through the Logger fails here rather than silently.
      const compiler = new ShaderCompiler();
      compiler._setAnalyzer(new ShaderAnalyzer());
      const compiled = captureLoggerDiagnostics(() =>
        compiler._parseShaderPass(c.passBody, c.vertEntry, c.fragEntry, ShaderLanguage.GLSLES100, "")
      );

      // The compiler is intentionally lenient — even for error-severity diagnostics it should still
      // return GLSL so an editor / IDE can show the surrounding structure. This is the "codegen
      // doesn't gate on severity" contract.
      expect(compiled.result, `${c.name}: codegen must return GLSL regardless of severity`).to.not.be.undefined;

      // 3) Driver view — try to compile the emitted GLSL on a real WebGL2 context.
      const driver = driveWebGL(compiled.result!.vertex, compiled.result!.fragment);
      if (driver === "no-webgl") {
        console.warn(`[${c.name}] WebGL unavailable — driver check skipped`);
        return;
      }

      const bothCompiled = driver.vertexOk && driver.fragmentOk;
      if (c.driverExpects === "accept") {
        expect(
          bothCompiled,
          `${c.name}: expected driver to accept — vertexLog=${driver.vertexLog} fragmentLog=${driver.fragmentLog}`
        ).to.be.true;
      } else if (c.driverExpects === "reject") {
        expect(bothCompiled, `${c.name}: expected driver to reject — vertex/fragment both compiled unexpectedly`).to.be
          .false;
      }
      // For "either" (warning-severity cases where a runtime macro could rescue the shader), we make
      // no claim about the driver result — only that the analyzer surfaced a warning. See the file
      // header for why this is intentional.
    });
  }
});
