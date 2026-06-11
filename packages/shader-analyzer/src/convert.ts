import type { Diagnostic } from "./Diagnostic";
import { DiagnosticType } from "./Diagnostic";
import { GSError, GSErrorName } from "@galacean/engine-shader-parser";

/**
 * Convert a GSError to a structured Diagnostic. The code is stamped at the
 * judgment site (parser/codegen) and read directly here — no message matching.
 * Only scanner/preprocessor errors (which carry no per-site code) fall back to a
 * name-based code.
 */
export function gseErrorToDiagnostic(error: Error): Diagnostic | null {
  if (!(error instanceof GSError)) {
    // Non-GSError (e.g. thrown from lexer/preprocess) — best-effort
    return {
      severity: "error",
      code: DiagnosticType.SyntaxError,
      message: error.message,
      range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } },
      source: "galacean-shader-analyzer"
    };
  }

  const severity = error.name === GSErrorName.CompilationWarn ? "warning" : "error";
  const code = error.code ?? DiagnosticType.SyntaxError;

  return {
    severity,
    code,
    message: error.message,
    range: gSErrorLocationToRange(error.location),
    source: "galacean-shader-analyzer",
    relatedSource: error.source || undefined
  };
}

function gSErrorLocationToRange(location: InstanceType<typeof GSError>["location"]): Diagnostic["range"] {
  if ("start" in location && "end" in location) {
    // ShaderRange
    return {
      start: { line: location.start.line, column: location.start.column, offset: location.start.index },
      end: { line: location.end.line, column: location.end.column, offset: location.end.index }
    };
  }
  // ShaderPosition
  return {
    start: { line: location.line, column: location.column, offset: location.index },
    end: { line: location.line, column: location.column, offset: location.index }
  };
}
