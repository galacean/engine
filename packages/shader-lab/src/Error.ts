import { ShaderPosition, ShaderRange } from "./common";

export abstract class GSError extends Error {
  readonly loc: ShaderRange | ShaderPosition;

  constructor(message: string, loc: ShaderRange | ShaderPosition, cause?: Error) {
    super(message, { cause });
    this.loc = loc;
  }

  override toString(): string {
    return `>>>>>\n${this.loc.toString()}\nReason: ${this.message}\n<<<<<`;
  }
}

export class PreprocessorError extends GSError {
  constructor(message: string, loc: ShaderRange | ShaderPosition, cause?: Error) {
    super(message, loc, cause);
    this.name = "PreprocessorError";
  }
}

export class CompilationError extends GSError {
  constructor(message: string, loc: ShaderRange, cause?: Error) {
    super(message, loc, cause);
    this.name = "SemanticError";
  }
}
