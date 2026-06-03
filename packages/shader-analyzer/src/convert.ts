import type { Diagnostic, DiagnosticCodeValue } from "./Diagnostic";
import { DiagnosticCode } from "./Diagnostic";
import { GSError, GSErrorName } from "@galacean/engine-shader-parser";

/**
 * Convert a GSError (parser/codegen internal error) to a structured Diagnostic.
 * GSError carries location + source; we extract line/column/offset from it.
 */
export function gseErrorToDiagnostic(error: Error): Diagnostic | null {
  if (!(error instanceof GSError)) {
    // Non-GSError (e.g. thrown from lexer/preprocess) — best-effort
    return {
      severity: "error",
      code: DiagnosticCode.C0_08,
      message: error.message,
      range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } },
      source: "galacean-shader-analyzer"
    };
  }

  const severity = error.name === GSErrorName.CompilationWarn ? "warning" : "error";
  const code = error.code ?? gSErrorNameToCode(error.name as GSErrorName, error.message);

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

/** Map a GSErrorName + message heuristics to a structured diagnostic code. */
function gSErrorNameToCode(name: GSErrorName, message: string): DiagnosticCodeValue {
  if (name === GSErrorName.CompilationWarn) {
    return message.includes("Redefinition") ? DiagnosticCode.C0_10 : DiagnosticCode.C0_07;
  }

  // ShaderSourceParser / Preprocessor / Scanner errors → A-layer
  if (name === GSErrorName.ScannerError || name === GSErrorName.PreprocessorError) return DiagnosticCode.A1_01;

  // CompilationError — disambiguate by message content
  if (message.includes("Invalid swizzle")) return DiagnosticCode.C1_01;
  if (message.includes("Cannot assign a value of type")) return DiagnosticCode.C1_02;
  if (message.includes("Cannot return a value of type")) return DiagnosticCode.C1_03;
  if (message.includes("Array of array")) return DiagnosticCode.C0_01;
  if (message.includes("not implemented operator")) return DiagnosticCode.C0_02;
  if (message.includes("Invalid integer")) return DiagnosticCode.C0_03;
  if (message.includes("Return in void")) return DiagnosticCode.C0_04;
  if (message.includes("No return statement")) return DiagnosticCode.C0_05;
  if (message.includes("Undefined function")) return DiagnosticCode.C0_09;
  if (message.includes("No overload function")) return DiagnosticCode.C0_06;
  if (message.includes("gl_FragColor cannot be used with MRT")) return DiagnosticCode.C0_11;
  if (message.includes("gl_FragData")) return DiagnosticCode.C0_12;
  if (message.includes("invalid varying struct")) return DiagnosticCode.C0_13;
  if (message.includes("vertex main entry")) return DiagnosticCode.C0_14;
  if (message.includes("invalid attribute struct")) return DiagnosticCode.C0_15;
  if (message.includes("invalid mrt struct") || message.includes("invalid mrt")) return DiagnosticCode.C0_16;
  if (message.includes("fragment main entry")) return DiagnosticCode.C0_17;
  if (message.includes("not found mrt property")) return DiagnosticCode.C0_18;
  if (message.includes("same struct as Varying and Attribute")) return DiagnosticCode.C0_19;
  if (message.includes("same struct as Varying and MRT")) return DiagnosticCode.C0_20;
  if (message.includes("same struct as Attribute and MRT")) return DiagnosticCode.C0_21;
  if (message.includes("referenced") && message.includes("not found")) return DiagnosticCode.C0_22;

  // ShaderSourceParser errors (A/B layer) — matched by message content
  if (message.includes("Invalid render state property")) return DiagnosticCode.B1_01;
  if (message.includes("Bitwise OR")) return DiagnosticCode.B1_03;
  if (message.includes("Cannot mix enum types")) return DiagnosticCode.B1_04;
  if (message.includes("Invalid") && message.includes("variable")) return DiagnosticCode.B2_01;
  if (message.includes("Invalid RenderQueueType")) return DiagnosticCode.B2_02;
  if (message.includes("#define") && message.includes("invalid replacement list")) return DiagnosticCode.A1_01;

  // Remaining CompilationError from ShaderSourceParser → A1-01
  if (message.includes("Invalid syntax") || message.includes("Invalid") || message.includes("expect"))
    return DiagnosticCode.A1_01;

  return DiagnosticCode.C0_08; // generic fallback
}
