// #if _EDITOR
import { IIndexRange } from "./common";

export abstract class GSError extends Error {
  readonly loc: IIndexRange;

  constructor(message: string, loc: IIndexRange, cause?: Error) {
    super(message, { cause });
    this.loc = loc;
  }
}

export class SemanticError extends GSError {
  constructor(message: string, loc: IIndexRange, cause?: Error) {
    super(message, loc, cause);
    this.name = "SemanticError";
  }
}
// #endif
