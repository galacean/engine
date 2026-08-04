import { ShaderPosition } from "./common/ShaderPosition";
import { ShaderRange } from "./common/ShaderRange";
// #if _VERBOSE
import { formatDiagnosticSource } from "./formatDiagnostic";
// #endif

/** Error reported while parsing or analyzing shader source. */
export class GSError extends Error {
  /**
   * Creates a shader error.
   * @param name - Error category.
   * @param message - Error message.
   * @param location - Source location of the error.
   * @param source - Source text containing the error.
   * @param file - Optional source file name.
   * @param code - Optional diagnostic code.
   */
  constructor(
    name: GSErrorName,
    message: string,
    public readonly location: ShaderRange | ShaderPosition,
    public readonly source: string | undefined,
    public readonly file?: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = name;
  }

  override toString(): string {
    // #if _VERBOSE
    const { location } = this;
    const range = "start" in location ? location : { start: location, end: location };
    return formatDiagnosticSource(this.source || undefined, range, `${this.name}: ${this.message}`);
    // #else
    return `${this.name}: ${this.message}`;
    // #endif
  }
}

/** Category assigned to a {@link GSError}. */
export enum GSErrorName {
  PreprocessorError = "PreprocessorError",
  CompilationError = "CompilationError",
  ScannerError = "ScannerError",
  CompilationWarn = "CompilationWarning"
}
