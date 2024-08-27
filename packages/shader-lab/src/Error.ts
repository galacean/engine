import { Logger } from "@galacean/engine";
import { ShaderPosition, ShaderRange } from "./common";

export enum ErrorLevel {
  ERROR = 0,
  WARN
}

export abstract class GSError extends Error {
  static wrappingLineCount = 2;

  readonly loc: ShaderRange | ShaderPosition;
  readonly source: string;
  readonly file?: string;
  level = ErrorLevel.ERROR;

  constructor(message: string, loc: ShaderRange | ShaderPosition, source: string, file?: string, cause?: Error) {
    super(message, { cause });
    this.loc = loc;
    this.source = source;
    this.file = file;
  }

  log(_source?: string): void {
    if (!Logger.enable) return;
    // #if _EDITOR
    const logger = this.level === ErrorLevel.ERROR ? Logger.error : Logger.warn;

    let start: ShaderPosition, end: ShaderPosition;
    const { message, loc, source: originSource } = this;
    let source = originSource;
    if (_source) source = _source;
    if (!source) {
      logger(message);
    }

    if (loc instanceof ShaderPosition) {
      start = end = loc;
    } else {
      start = loc.start;
      end = loc.end;
    }
    const lines = source.split("\n");

    let diagnosticMessage = `${this.name}: ${message}\n\n`;
    const lineSplit = "|···";

    for (let i = 0; i <= end.line + GSError.wrappingLineCount; i++) {
      if (i < start.line - GSError.wrappingLineCount) continue;

      diagnosticMessage += lineSplit;
      diagnosticMessage += `${lines[i]}\n`;
      if (i >= start.line && i <= end.line) {
        diagnosticMessage += " ".repeat(lineSplit.length + start.column);
        diagnosticMessage += "^".repeat(Math.max(end.column - start.column, 1));
        diagnosticMessage += "\n";
      }
    }

    logger(diagnosticMessage);
    // #else
    Logger.error("compile error.");
    // #endif
  }
}

// #if _EDITOR
export class PreprocessorError extends GSError {
  constructor(message: string, loc: ShaderRange | ShaderPosition, source: string, file?: string, cause?: Error) {
    super(message, loc, source, file, cause);
    this.name = "PreprocessorError";
  }
}

export class CompilationError extends GSError {
  constructor(message: string, loc: ShaderRange | ShaderPosition, source: string, file?: string, cause?: Error) {
    super(message, loc, source, file, cause);
    this.name = "CompilationError";
  }
}

export class ScannerError extends GSError {
  constructor(message: string, loc: ShaderRange | ShaderPosition, source: string, file?: string, cause?: Error) {
    super(message, loc, source, file, cause);
    this.name = "ScannerError";
  }
}
// #endif
