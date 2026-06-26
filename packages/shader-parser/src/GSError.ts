import type { DiagnosticType } from "./DiagnosticType";
import { ShaderPosition } from "./common/ShaderPosition";
import { ShaderRange } from "./common/ShaderRange";
import { formatDiagnosticSource } from "./formatDiagnostic";

export class GSError extends Error {
  constructor(
    name: GSErrorName,
    message: string,
    public readonly location: ShaderRange | ShaderPosition,
    public readonly source: string,
    public readonly file?: string,
    public readonly code?: DiagnosticType
  ) {
    super(message);
    this.name = name;
  }

  override toString(): string {
    const { location } = this;
    const range =
      location instanceof ShaderPosition
        ? { start: location, end: location }
        : { start: location.start, end: location.end };
    return formatDiagnosticSource(this.source || undefined, range, `${this.name}: ${this.message}`);
  }
}

export enum GSErrorName {
  PreprocessorError = "PreprocessorError",
  CompilationError = "CompilationError",
  ScannerError = "ScannerError",
  CompilationWarn = "CompilationWarning"
}
