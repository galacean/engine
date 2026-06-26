import { DiagnosticType } from "@galacean/engine-shader-parser";

export enum DiagnosticSeverity {
  Error = "error",
  Warning = "warning"
}

/** Structured diagnostic produced by the shader analyzer. */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** Semantic classification — the rule this diagnostic reports (see the §3 diagnostic catalogue). */
  code: DiagnosticType;
  message: string;
  range: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  /** Source text of the pass where the error occurred (for context display). */
  relatedSource?: string;
}

// Classification enum lives with the producers (parser/codegen); re-exported here for analyzer consumers.
export { DiagnosticType };
