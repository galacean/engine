import type { Diagnostic } from "./Diagnostic";
import { DiagnosticType, DiagnosticSeverity } from "./Diagnostic";
import { GSError, GSErrorName } from "@galacean/engine-shader-parser/internal/analyzer";

const diagnosticTypes = new Set<string>(Object.values(DiagnosticType));

/**
 * Converts a parser error to a structured diagnostic.
 * @param error - Error reported while parsing or analyzing shader source.
 * @returns Structured diagnostic for the error.
 */
export function gseErrorToDiagnostic(error: Error): Diagnostic {
  if (!(error instanceof GSError)) {
    // Non-GSError (e.g. thrown from lexer/preprocess) — best-effort
    return {
      severity: DiagnosticSeverity.Error,
      code: DiagnosticType.SyntaxError,
      message: error.message,
      range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }
    };
  }

  const severity = error.name === GSErrorName.CompilationWarn ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error;
  const code = isDiagnosticType(error.code)
    ? error.code
    : error.name === GSErrorName.PreprocessorError
      ? DiagnosticType.PreprocessorError
      : DiagnosticType.SyntaxError;

  return {
    severity,
    code,
    message: error.message,
    sourceFile: error.file,
    range: gSErrorLocationToRange(error.location),
    relatedSource: error.source || undefined
  };
}

function isDiagnosticType(code: string | undefined): code is DiagnosticType {
  return code !== undefined && diagnosticTypes.has(code);
}

function gSErrorLocationToRange(location: InstanceType<typeof GSError>["location"]): Diagnostic["range"] {
  if ("start" in location && "end" in location) {
    // ShaderRange
    return {
      start: { line: location.start.line + 1, column: location.start.column + 1, offset: location.start.index },
      end: { line: location.end.line + 1, column: location.end.column + 1, offset: location.end.index }
    };
  }
  // ShaderPosition
  return {
    start: { line: location.line + 1, column: location.column + 1, offset: location.index },
    end: { line: location.line + 1, column: location.column + 1, offset: location.index }
  };
}
