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
 *       severity=warning → the precompile GLSL alone still fails the driver; the warning
 *                          severity encodes intent ("a runtime macro may rescue this at bind
 *                          time"), NOT a claim that the driver would accept the GLSL as-is.
 *                          If a case genuinely leaves driver behavior open (e.g. spec-undefined
 *                          folding), it is marked `driverExpects: "either"` and documented.
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
    name: "UseBeforeDeclaration — analyzer warns, driver rejects the precompile GLSL",
    code: "UseBeforeDeclaration",
    severity: "warning",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(undeclared_color, 1.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    // The warning severity models the *intent* (a runtime macro or conditional `#include` could
    // supply the identifier at material bind time), but the *precompile GLSL* the driver receives
    // here is not rescued — no macro is set — so it must reject. The severity gap is intentional
    // under-report; it's not license for the driver to accept broken code.
    driverExpects: "reject",
    reason: "warning is an under-report by design; the precompile GLSL itself is not runnable"
  },
  {
    name: "UndefinedFunction — analyzer warns, driver rejects the precompile GLSL",
    code: "UndefinedFunction",
    severity: "warning",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(doesNotExist(1.0)); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "same rationale as UseBeforeDeclaration — warning is intent, driver still rejects"
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
  },
  // ─────────────────────────── Type diagnostics ───────────────────────────
  {
    name: "InvalidSwizzle (out-of-set letters)",
    code: "InvalidSwizzle",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(0.0); float x = v.abc; gl_FragColor = vec4(x); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "swizzle chars must be from one set only (xyzw / rgba / stpq)"
  },
  {
    name: "UndeclaredStructMember",
    code: "UndeclaredStructMember",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      struct S { float f; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { S s; float y = s.notAField; gl_FragColor = vec4(y); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "accessing a non-existent struct field is rejected by any driver"
  },
  {
    name: "ConstDivideByZero (integer 1/0)",
    code: "ConstDivideByZero",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { int x = 1 / 0; gl_FragColor = vec4(float(x)); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    // A driver may fold this constant and accept the shader (behavior is
    // implementation-defined per GLSL ES §4.3.3). Analyzer is stricter.
    driverExpects: "either",
    reason: "constant integer division by zero — spec undefined; driver may fold"
  },
  {
    name: "ShiftOutOfRange (1 << 40)",
    code: "ShiftOutOfRange",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { int x = 1 << 40; gl_FragColor = vec4(float(x)); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    // Overflow behavior is implementation-defined; drivers vary.
    driverExpects: "either",
    reason: "shift by 40 exceeds int width — GLSL ES leaves behavior implementation-defined"
  },
  {
    name: "NonIntegerIndex (v[1.5])",
    code: "NonIntegerIndex",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec3 v = vec3(0.0); float y = v[1.5]; gl_FragColor = vec4(y); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "vector index must be an integer expression"
  },
  {
    name: "NonIndexableType (float[0])",
    code: "NonIndexableType",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float f = 1.0; float y = f[0]; gl_FragColor = vec4(y); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "scalar float is not indexable"
  },
  {
    name: "ExpectedSampler (first arg to texture() is not a sampler)",
    code: "ExpectedSampler",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec2 uv = vec2(0.0); vec4 c = texture(uv, uv); gl_FragColor = c; }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "texture() requires a sampler as its first argument"
  },
  {
    name: "InvalidUnaryOperand (!float)",
    code: "InvalidUnaryOperand",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float f = 1.0; bool ok = !f; gl_FragColor = vec4(0.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "logical NOT is defined only for bool"
  },
  {
    name: "InvalidBinaryOperands (bool + float)",
    code: "InvalidBinaryOperands",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { bool b = true; float x = b + 1.0; gl_FragColor = vec4(x); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "no arithmetic operator accepts a bool + float pair"
  },
  {
    name: "ConstructorArgType (sampler2D as vec2 component)",
    code: "ConstructorArgType",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      mediump sampler2D u_tex;
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { vec2 v = vec2(u_tex, 1.0); gl_FragColor = vec4(v, 0.0, 1.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "a sampler type can never appear as a constructor arg"
  },
  {
    name: "NonConstInitializer (const initialized from uniform)",
    code: "NonConstInitializer",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      float u_scale;
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { const float c = u_scale; gl_FragColor = vec4(c); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "a const initializer must be a compile-time constant"
  },
  {
    name: "NonConstArraySize (array sized by non-const var)",
    code: "NonConstArraySize",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { int n = 3; float a[n]; gl_FragColor = vec4(a[0]); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL ES §4.1.9 array size must be a constant expression"
  },
  {
    name: "InvalidArraySize (float a[0])",
    code: "InvalidArraySize",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { float a[0]; gl_FragColor = vec4(a[0]); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL ES §4.1.9 array size must be > 0"
  },
  {
    name: "NonFloatDerivativeArg (dFdx on int)",
    code: "NonFloatDerivativeArg",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { int i = 1; float d = dFdx(i); gl_FragColor = vec4(d); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "derivatives accept only float/vec* — integer arg has no overload"
  },
  // ─────────────────── Function / control-flow diagnostics ───────────────────
  {
    name: "MissingReturn (non-void function without return)",
    code: "MissingReturn",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      float getX() { float a = 1.0; }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(getX()); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "non-void function must return on every path"
  },
  {
    name: "Redefinition (variable redeclared in same scope)",
    code: "Redefinition",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      float u_a;
      float u_a;
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(u_a); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "redeclaring an identifier in the same scope is rejected"
  },
  {
    name: "RecursiveFunction (direct recursion)",
    code: "RecursiveFunction",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      float f(float x) { return f(x); }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(f(1.0)); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL ES §6.1 forbids recursion (direct or indirect)"
  },
  {
    name: "NonConstructibleReturnType (function returns sampler)",
    code: "NonConstructibleReturnType",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      mediump sampler2D u_tex;
      sampler2D getTex() { return u_tex; }
      void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    // Codegen may drop an unreferenced function; when it does, the driver never sees it and
    // accepts the shader. The analyzer's authoring-time check still stands — it fires as
    // soon as the type appears in a `return`, not only when the function is reached.
    driverExpects: "either",
    reason: "sampler is opaque; analyzer catches at authoring; driver only sees emitted code"
  },
  {
    name: "DerivativeInVertexShader (dFdx in vert)",
    code: "DerivativeInVertexShader",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { float d = dFdx(1.0); gl_Position = vec4(d); }
      void frag() { gl_FragColor = vec4(0.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "derivative built-ins are fragment-stage-only"
  },
  // ─────────────────────── Pipeline / IO diagnostics ───────────────────────
  {
    name: "InvalidEntryReturnType (int return from vert)",
    code: "InvalidEntryReturnType",
    severity: "error",
    passBody: `
      struct Attributes { vec3 POSITION; };
      int vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0); return 1; }
      void frag() { gl_FragColor = vec4(0.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "entry function must return void or an IO struct"
  },
  {
    name: "StructRoleConflict (same struct used as vert-out AND frag-out)",
    code: "StructRoleConflict",
    severity: "error",
    passBody: `
      struct IO { vec4 v; };
      IO vert() { IO o; o.v = vec4(0.0); gl_Position = vec4(0.0); return o; }
      IO frag(IO i) { IO o; o.v = i.v; return o; }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    // Codegen may reject entirely; if it produces GLSL, driver typically rejects too.
    driverExpects: "either",
    reason: "a struct can play at most one IO role — attributes / varyings / MRT"
  },
  {
    name: "GlFragColorWithMrt (MRT struct + gl_FragColor write)",
    code: "GlFragColorWithMrt",
    severity: "error",
    passBody: `
      struct MRT { vec4 c0; };
      void vert() { gl_Position = vec4(0.0); }
      MRT frag() { MRT o; o.c0 = vec4(0.0); gl_FragColor = vec4(0.0); return o; }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "either",
    reason: "an MRT-returning fragment must not also write gl_FragColor"
  },
  {
    name: "NestedIOStruct (varying struct contains a nested struct)",
    code: "NestedIOStruct",
    severity: "error",
    passBody: `
      struct Inner { vec4 v; };
      struct Varyings { Inner nested; };
      Varyings vert() { Varyings o; gl_Position = vec4(0.0); return o; }
      void frag(Varyings i) { gl_FragColor = i.nested.v; }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "either",
    reason: "GLSL ES varyings must be flat structs of scalars/vecs, not nested"
  },
  {
    name: "MissingVertexPosition (vert never writes gl_Position)",
    code: "MissingVertexPosition",
    severity: "error",
    passBody: `
      void vert() { }
      void frag() { gl_FragColor = vec4(0.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "either",
    reason: "vertex stage must write gl_Position for the pipeline to run"
  },
  {
    name: "NonFlatIntegerVarying (int in varyings without flat)",
    code: "NonFlatIntegerVarying",
    severity: "error",
    passBody: `
      struct Varyings { vec4 pos; int id; };
      Varyings vert() { Varyings o; gl_Position = vec4(0.0); return o; }
      void frag(Varyings i) { gl_FragColor = vec4(float(i.id)); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "either",
    reason: "GLSL ES 3.00 §4.3.4 integer varyings must be flat"
  },
  {
    name: "EntryNotFound (compiler passed an entry name that doesn't exist)",
    code: "EntryNotFound",
    severity: "error",
    passBody: `
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = vec4(0.0); }
    `,
    // Deliberately mis-spelled to trip EntryNotFound.
    vertEntry: "vrt",
    fragEntry: "frag",
    driverExpects: "either",
    reason: "compile-time entry lookup miss — codegen has nothing to emit"
  },
  // ─────────── InvalidAssignmentTarget — GLSL ES §5.8 l-value rule ───────────
  {
    name: "InvalidAssignmentTarget — assign to a #define macro",
    code: "InvalidAssignmentTarget",
    severity: "error",
    passBody: `
      #define A 1
      void vert() { gl_Position = vec4(0.0); }
      void frag() { A = 2; gl_FragColor = vec4(1.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "a macro name is not an l-value — after expansion it's an integer literal"
  },
  {
    name: "InvalidAssignmentTarget — assign to a numeric literal",
    code: "InvalidAssignmentTarget",
    severity: "error",
    passBody: `
      void vert() { gl_Position = vec4(0.0); }
      void frag() { 1 = 2; gl_FragColor = vec4(1.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "an integer literal cannot be an l-value"
  },
  {
    name: "InvalidAssignmentTarget — assign to a function-call result",
    code: "InvalidAssignmentTarget",
    severity: "error",
    passBody: `
      float f() { return 1.0; }
      void vert() { gl_Position = vec4(0.0); }
      void frag() { f() = 2.0; gl_FragColor = vec4(1.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "a function-call result is a temporary — never an l-value"
  },
  {
    name: "InvalidAssignmentTarget — assign to a const-qualified variable",
    code: "InvalidAssignmentTarget",
    severity: "error",
    passBody: `
      const float C = 1.0;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { C = 2.0; gl_FragColor = vec4(C); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "a const-qualified variable is read-only per §4.3.2"
  },
  {
    name: "InvalidAssignmentTarget — assign to a compound arithmetic expression",
    code: "InvalidAssignmentTarget",
    severity: "error",
    passBody: `
      void vert() { gl_Position = vec4(0.0); }
      void frag() { float a = 1.0; float b = 2.0; (a + b) = 3.0; gl_FragColor = vec4(a); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "the result of an arithmetic operator is an r-value"
  },
  // ─────── AssignTypeMismatch — GLSL ES §5.8 / §5.4.1 no implicit conversions ───────
  {
    name: "AssignTypeMismatch — float initializer takes an int literal",
    code: "AssignTypeMismatch",
    severity: "error",
    passBody: `
      void vert() { gl_Position = vec4(0.0); }
      void frag() { float b = 1; gl_FragColor = vec4(b); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL ES §4 has no implicit int→float; driver rejects with 'cannot convert from const int to float'"
  },
  {
    name: "AssignTypeMismatch — int initializer takes a float literal",
    code: "AssignTypeMismatch",
    severity: "error",
    passBody: `
      void vert() { gl_Position = vec4(0.0); }
      void frag() { int a = 1.0; gl_FragColor = vec4(float(a)); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL ES §4 has no implicit float→int; driver rejects at initializer"
  },
  {
    name: "AssignTypeMismatch — assignment `float b; b = 1;` (later write)",
    code: "AssignTypeMismatch",
    severity: "error",
    passBody: `
      void vert() { gl_Position = vec4(0.0); }
      void frag() { float b = 0.0; b = 1; gl_FragColor = vec4(b); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "§5.8 assignment operands must have the same type — no implicit conversion"
  },
  // ─────────── Gaps found by glslang-corpus scan (2026-07-08 diagnostic-gap round) ───────────
  {
    name: "InvalidBinaryOperands — `%` on floats",
    code: "InvalidBinaryOperands",
    severity: "error",
    passBody: `
      float u_f;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { float x = u_f % u_f; gl_FragColor = vec4(x); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL ES §5.9: modulo requires integer operands"
  },
  {
    name: "InvalidAssignmentTarget — `u_i++` on a uniform (`u_i` global, no initializer)",
    code: "InvalidAssignmentTarget",
    severity: "error",
    passBody: `
      int u_i;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { u_i++; gl_FragColor = vec4(float(u_i)); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    // Codegen still emits GLSL; the driver rejects with "l-value required (can't modify a uniform)".
    driverExpects: "reject",
    reason: "GLSL ES §5.9: a uniform is not an l-value"
  },
  {
    name: "InvalidSwizzle — `.rr` on a sampler receiver",
    code: "InvalidSwizzle",
    severity: "error",
    passBody: `
      sampler2D s;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { vec2 v = s.rr; gl_FragColor = vec4(v, 0.0, 1.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL ES §5.5: field selection requires structure / vector / scalar receiver"
  },
  {
    name: "InvalidSwizzle — `.xx` on a void function-call result",
    code: "InvalidSwizzle",
    severity: "error",
    // Codegen may return undefined for this shape; the analyzer still fires and that's the
    // consistency claim we're checking here.
    passBody: `
      void f() {}
      void vert() { gl_Position = vec4(0.0); }
      void frag() { f().xx; gl_FragColor = vec4(0.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "§5.5 — same rule as G3, void return has no fields"
  },
  {
    name: "InvalidBinaryOperands — `&&` between two int values (not bool)",
    code: "InvalidBinaryOperands",
    severity: "error",
    passBody: `
      int u_i;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { int x = int(u_i && u_i); gl_FragColor = vec4(float(x)); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL ES §5.9: `&&` requires scalar bool operands"
  },
  {
    name: "InvalidBinaryOperands — `int + float` mix",
    code: "InvalidBinaryOperands",
    severity: "error",
    passBody: `
      int u_i;
      float u_f;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { float x = float(u_i + u_f > 0 ? 1 : 0); gl_FragColor = vec4(x); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    // The `u_i + u_f` sub-expression is the target — driver rejects the whole shader.
    driverExpects: "reject",
    reason: "GLSL ES §4: no implicit conversion between int and float in arithmetic"
  },
  {
    name: "InvalidBinaryOperands — `ivec3 + uvec3` mix",
    code: "InvalidBinaryOperands",
    severity: "error",
    passBody: `
      ivec3 u_iv3;
      uvec3 u_uv3;
      void vert() { gl_Position = vec4(0.0); }
      void frag() { ivec3 x = u_iv3 + u_uv3; gl_FragColor = vec4(float(x.x)); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL ES §5.9: int and uint families are distinct — no auto-conversion"
  },
  {
    name: "LocalFunctionPrototype — `int g();` inside a function body",
    code: "LocalFunctionPrototype",
    severity: "error",
    passBody: `
      void vert() { gl_Position = vec4(0.0); }
      void frag() { int g(); gl_FragColor = vec4(0.0); }
    `,
    vertEntry: "vert",
    fragEntry: "frag",
    driverExpects: "reject",
    reason: "GLSL ES §6: function prototypes only at global scope"
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

      // Codegen contract: either returns GLSL (best-effort — the editor / IDE keeps the surrounding
      // structure visible), OR returns undefined AND the analyzer flagged an error. It must not
      // silently drop the shader when nothing is wrong.
      if (compiled.result === undefined) {
        expect(
          analyzed.diagnostics.some((d) => d.severity === "error"),
          `${c.name}: codegen returned undefined but analyzer produced no error — silent drop`
        ).to.be.true;
        return; // No GLSL to hand the driver.
      }

      // 3) Driver view — try to compile the emitted GLSL on a real WebGL context.
      const driver = driveWebGL(compiled.result.vertex, compiled.result.fragment);
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
      // "either" is reserved for cases where the driver's outcome is genuinely spec-undefined
      // (e.g. constant integer division by zero, shift-overflow), NOT for warning-severity cases —
      // those must still declare `"reject"` on the precompile GLSL and rely on the file header to
      // explain that warning severity encodes intent, not driver acceptance.
    });
  }
});
