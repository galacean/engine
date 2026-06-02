/**
 * Structured diagnostic produced by the shader analyzer.
 *
 * Follows LSP Diagnostic conventions for easy IDE integration.
 */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** Structured error code, e.g. "C0-01", "A1-01". */
  code: string;
  message: string;
  range: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  source: "galacean-shader-analyzer";
  /** Source text of the pass where the error occurred (for context display). */
  relatedSource?: string;
}

export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

/**
 * Error code registry. Codes are never reused; deprecated checks keep their code.
 *
 * Layer prefixes:
 *   A = ShaderLab structure & syntax
 *   B = RenderState
 *   C = GLSL semantics
 *   D = Builtin symbol linkage
 *   E = Cross-stage consistency
 *   F = Lint
 */
export const DiagnosticCode = {
  // ── C0: migrated from existing reportError / _reportError ──
  C0_01: "C0-01", // Array of array not supported
  C0_02: "C0-02", // Not implemented operator
  C0_03: "C0-03", // Invalid integer literal
  C0_04: "C0-04", // Return in void function
  C0_05: "C0-05", // No return statement found
  C0_06: "C0-06", // No overload function type found
  C0_07: "C0-07", // Identifier used before declaration (warning)
  C0_08: "C0-08", // Unexpected token (parser generic)
  C0_09: "C0-09", // Undefined function call
  C0_10: "C0-10", // Redefinition of a variable in the same scope (warning)

  // ── C0-codegen: migrated from CodeGenVisitor._reportError ──
  C0_11: "C0-11", // gl_FragColor with MRT
  C0_12: "C0-12", // gl_FragData (use MRT struct instead)
  C0_13: "C0-13", // Invalid varying struct
  C0_14: "C0-14", // Vertex main entry can only return struct or void
  C0_15: "C0-15", // Invalid attribute struct
  C0_16: "C0-16", // Invalid MRT struct
  C0_17: "C0-17", // Fragment main entry can only return struct or vec4
  C0_18: "C0-18", // MRT property not found
  C0_19: "C0-19", // Same struct as Varying and Attribute
  C0_20: "C0-20", // Same struct as Varying and MRT
  C0_21: "C0-21", // Same struct as Attribute and MRT
  C0_22: "C0-22", // Referenced IO symbol (attribute/varying/mrt) not found

  // ── C1: GLSL type system ──
  C1_01: "C1-01", // Invalid vector swizzle

  // ── A1/A2: ShaderLab structure ──
  A1_01: "A1-01", // Missing required ShaderLab element
  A2_01: "A2-01", // Entry function assignment order

  // ── B1/B2: RenderState ──
  B1_01: "B1-01", // Invalid render state property
  B1_02: "B1-02", // Invalid enum value or bare enum without prefix
  B1_03: "B1-03", // Bitwise OR on non-bitmask enum
  B1_04: "B1-04", // Mixed enum types in bitwise OR
  B2_01: "B2-01", // Invalid render state variable
  B2_02: "B2-02" // Invalid RenderQueueType variable
} as const;

export type DiagnosticCodeValue = (typeof DiagnosticCode)[keyof typeof DiagnosticCode];
