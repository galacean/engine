// #if _VERBOSE
import { ShaderPosition } from "./common/ShaderPosition";
import { ShaderRange } from "./common/ShaderRange";

export class GSError extends Error {
  static wrappingLineCount = 2;

  constructor(
    name: GSErrorName,
    message: string,
    public readonly location: ShaderRange | ShaderPosition,
    public readonly source: string,
    public readonly file?: string
  ) {
    super(message);
    this.name = name;
  }

  override toString(): string {
    let start: ShaderPosition, end: ShaderPosition;
    const { message, location, source } = this;
    if (!source) {
      return message;
    }

    if (location instanceof ShaderPosition) {
      start = end = location;
    } else {
      start = location.start;
      end = location.end;
    }
    const lines = source.split("\n");

    let diagnosticMessage = `${this.name}: ${message}\n\n`;
    const lineSplit = "|···";

    const wrappingLineCount = GSError.wrappingLineCount;
    for (let i = start.line - wrappingLineCount, n = end.line + wrappingLineCount; i <= n; i++) {
      const line = lines[i];
      diagnosticMessage += lineSplit + `${line}\n`;

      if (i < start.line || i > end.line) continue;

      let remarkStart = 0;
      let remarkEnd = line.length;
      let paddingLength = lineSplit.length;
      if (i === start.line) {
        remarkStart = start.column;
        paddingLength += start.column;
      }
      if (i === end.line) {
        remarkEnd = end.column;
      }
      const remarkLength = Math.max(remarkEnd - remarkStart, 1);

      diagnosticMessage += " ".repeat(paddingLength) + "^".repeat(remarkLength) + "\n";
    }

    return diagnosticMessage;
  }
}

// #endif
export enum GSErrorName {
  PreprocessorError = "PreprocessorError",
  CompilationError = "CompilationError",
  ScannerError = "ScannerError"
}
