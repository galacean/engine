// #if _EDITOR
import { ShaderRange } from "./common";

export abstract class GSError extends Error {
  readonly loc: ShaderRange;

  constructor(message: string, loc: ShaderRange, cause?: Error) {
    super(message, { cause });
    this.loc = loc;
  }
}

export class SemanticError extends GSError {
  constructor(message: string, loc: ShaderRange, cause?: Error) {
    super(message, loc, cause);
    this.name = "SemanticError";
  }
}
// #endif
