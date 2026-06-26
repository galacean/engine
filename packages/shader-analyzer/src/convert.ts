import type { Diagnostic } from "./Diagnostic";
import { DiagnosticType, DiagnosticSeverity } from "./Diagnostic";
import { GSError, GSErrorName } from "@galacean/engine-shader-parser";

/**
 * Convert a GSError to a structured Diagnostic. The DiagnosticType is stamped at the
 * judgment site (parser/codegen) and read directly here — no message matching. Errors
 * with no stamped type (e.g. scanner/preprocessor) fall back to SyntaxError.
 */
export function gseErrorToDiagnostic(error: Error): Diagnostic {
  if (!(error instanceof GSError)) {
    // Non-GSError (e.g. thrown from lexer/preprocess) — best-effort
    return {
      severity: DiagnosticSeverity.Error,
      code: DiagnosticType.SyntaxError,
      message: error.message,
      range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } }
    };
  }

  const severity = error.name === GSErrorName.CompilationWarn ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error;
  const code = error.code ?? DiagnosticType.SyntaxError;

  return {
    severity,
    code,
    message: error.message,
    range: gSErrorLocationToRange(error.location),
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
