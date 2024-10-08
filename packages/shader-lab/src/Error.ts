// #if _EDITOR
import { Logger } from "@galacean/engine";
import { ShaderPosition, ShaderRange } from "./common";

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

  log(content?: string): void {
    Logger.error(this.toString(content));
  }

  override toString(content?: string): string {
    if (!Logger.enable) return;
    let start: ShaderPosition, end: ShaderPosition;
    const { message, location: loc, source: originSource } = this;
    let logSource = originSource;
    if (content) logSource = content;
    if (!logSource) {
      return message;
    }

    if (loc instanceof ShaderPosition) {
      start = end = loc;
    } else {
      start = loc.start;
      end = loc.end;
    }
    const lines = logSource.split("\n");

    let diagnosticMessage = `${this.name}: ${message}\n\n`;
    const lineSplit = "|···";

    for (let i = start.line - GSError.wrappingLineCount, n = end.line + GSError.wrappingLineCount; i <= n; i++) {
      diagnosticMessage += lineSplit + `${lines[i]}\n`;

      if (i < start.line || i > end.line) continue;

      let remarkStart = 0;
      let remarkEnd = lines[i].length;
      let paddingLength = lineSplit.length;
      if (i === start.line) {
        remarkStart = start.column;
        paddingLength += start.column;
      } else if (i === end.line) {
        remarkEnd = end.column;
      }
      const remarkLength = Math.max(remarkEnd - remarkStart, 1);

      diagnosticMessage += " ".repeat(paddingLength) + "^".repeat(remarkLength) + "\n";
    }

    return diagnosticMessage;
  }
}

export enum GSErrorName {
  PreprocessorError = "PreprocessorError",
  CompilationError = "CompilationError",
  ScannerError = "ScannerError"
}
// #endif
