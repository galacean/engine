import { LocRange } from "./common";

export abstract class GSError extends Error {
  readonly loc: LocRange;

  constructor(message: string, loc: LocRange, cause?: Error) {
    super(message, { cause });
    this.loc = loc;
  }
}

export class SemanticError extends GSError {
  constructor(message: string, loc: LocRange, cause?: Error) {
    super(message, loc, cause);
    this.name = "SemanticError";
  }
}

export class ParseError extends GSError {
  constructor(message: string, loc: LocRange, cause?: Error) {
    super(message, loc, cause);
    this.name = "ParseError";
  }
}
