import { DiagnosticType } from "@galacean/engine-shader-parser";

/**
 * Structured diagnostic produced by the shader analyzer.
 *
 * Follows LSP Diagnostic conventions for easy IDE integration.
 */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  /**
   * Semantic classification of the diagnostic. Built-in diagnostics carry a `DiagnosticType`;
   * custom rules carry a `"ruleName/code"` namespaced string.
   */
  code: DiagnosticType | (string & {});
  message: string;
  range: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  source: "galacean-shader-analyzer";
  /** Source text of the pass where the error occurred (for context display). */
  relatedSource?: string;
}

export type DiagnosticSeverity = "error" | "warning";

// Classification enum lives with the producers (parser/codegen); re-exported here for analyzer consumers.
export { DiagnosticType };
