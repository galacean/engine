import { LocRange } from "../common";

export class SemanticError extends Error {
  readonly loc: LocRange;

  constructor(message: string, loc: LocRange, cause?: Error) {
    super(message, { cause });
    this.loc = loc;
    this.name = "SemanticError";
  }
}
