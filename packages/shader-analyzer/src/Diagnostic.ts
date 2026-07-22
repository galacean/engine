import { DiagnosticType, formatDiagnosticSource } from "@galacean/engine-shader-parser";

/** Severity assigned to a shader diagnostic. */
export enum DiagnosticSeverity {
  Error = "error",
  Warning = "warning"
}

/** Structured diagnostic produced while analyzing a shader. */
export interface Diagnostic {
  /** Severity of the diagnostic. */
  severity: DiagnosticSeverity;
  /** Semantic rule reported by the diagnostic. */
  code: DiagnosticType;
  /** Human-readable explanation of the reported rule violation. */
  message: string;
  /** Source range containing the reported issue. */
  range: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  /** Source text containing the reported issue. */
  relatedSource?: string;
}

export { DiagnosticType };

/**
 * Formats a diagnostic with a source excerpt and caret markers.
 * @param diagnostic - Diagnostic to format.
 * @returns Formatted diagnostic text.
 */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  return formatDiagnosticSource(
    diagnostic.relatedSource,
    diagnostic.range,
    `${diagnostic.code}: ${diagnostic.message}`
  );
}
