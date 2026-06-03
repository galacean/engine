/**
 * Structured diagnostic produced by the shader analyzer.
 *
 * Follows LSP Diagnostic conventions for easy IDE integration.
 */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** Structured error code, e.g. "C0-01", "A1-01" (or "ruleName/code" for custom rules). */
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

// Code registry lives with the producers (parser/codegen); re-exported here for analyzer consumers.
export { DiagnosticCode } from "@galacean/engine-shader-parser";
export type { DiagnosticCodeValue } from "@galacean/engine-shader-parser";
