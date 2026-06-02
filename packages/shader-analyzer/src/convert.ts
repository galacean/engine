import type { Diagnostic, DiagnosticSeverity } from "./Diagnostic";
import { GSError, GSErrorName } from "@galacean/engine-shader-parser";

/**
 * Convert a GSError (parser/codegen internal error) to a structured Diagnostic.
 * GSError carries location + source; we extract line/column/offset from it.
 */
export function gseErrorToDiagnostic(error: Error, defaultSeverity: DiagnosticSeverity = "error"): Diagnostic | null {
  if (!(error instanceof GSError)) {
    // Non-GSError (e.g. thrown from lexer/preprocess) — best-effort
    return {
      severity: "error",
      code: "C0-08",
      message: error.message,
      range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } },
      source: "galacean-shader-analyzer"
    };
  }

  const severity = error.name === GSErrorName.CompilationWarn ? "warning" : defaultSeverity;
  const code = gSErrorNameToCode(error.name as GSErrorName, error.message);

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

/**
 * Map GSErrorName + message heuristics to a structured code.
 * Phase 2 will replace this with per-check code assignment in DiagnosticVisitor.
 */
function gSErrorNameToCode(name: GSErrorName, message: string): string {
  if (name === GSErrorName.CompilationWarn) return "C0-07";

  // ShaderSourceParser / Preprocessor / Scanner errors → A-layer
  if (name === GSErrorName.ScannerError || name === GSErrorName.PreprocessorError) return "A1-01";

  // CompilationError — disambiguate by message content
  if (message.includes("Array of array")) return "C0-01";
  if (message.includes("not implemented operator")) return "C0-02";
  if (message.includes("Invalid integer")) return "C0-03";
  if (message.includes("Return in void")) return "C0-04";
  if (message.includes("No return statement")) return "C0-05";
  if (message.includes("Undefined function")) return "C0-09";
  if (message.includes("No overload function")) return "C0-06";
  if (message.includes("gl_FragColor cannot be used with MRT")) return "C0-11";
  if (message.includes("gl_FragData")) return "C0-12";
  if (message.includes("invalid varying struct")) return "C0-13";
  if (message.includes("vertex main entry")) return "C0-14";
  if (message.includes("invalid attribute struct")) return "C0-15";
  if (message.includes("invalid mrt struct") || message.includes("invalid mrt")) return "C0-16";
  if (message.includes("fragment main entry")) return "C0-17";
  if (message.includes("not found mrt property")) return "C0-18";
  if (message.includes("same struct as Varying and Attribute")) return "C0-19";
  if (message.includes("same struct as Varying and MRT")) return "C0-20";
  if (message.includes("same struct as Attribute and MRT")) return "C0-21";

  // ShaderSourceParser errors (A/B layer) — matched by message content
  if (message.includes("Invalid render state property")) return "B1-01";
  if (message.includes("Bitwise OR")) return "B1-03";
  if (message.includes("Cannot mix enum types")) return "B1-04";
  if (message.includes("Invalid") && message.includes("variable")) return "B2-01";
  if (message.includes("Invalid RenderQueueType")) return "B2-02";
  if (message.includes("#define") && message.includes("invalid replacement list")) return "A1-01";

  // Remaining CompilationError from ShaderSourceParser → A1-01
  if (message.includes("Invalid syntax") || message.includes("Invalid") || message.includes("expect")) return "A1-01";

  return "C0-08"; // generic fallback
}
