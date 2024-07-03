import { ETokenType } from "./types";
import { IIndexRange, Position } from ".";

export class BaseToken<T extends number = number> {
  readonly type: T;
  readonly lexeme: string;
  readonly location: IIndexRange;

  constructor(type: T, lexeme: string, start?: Position);
  constructor(type: T, lexeme: string, location?: IIndexRange);
  constructor(type: T, lexeme: string, arg?: IIndexRange | Position) {
    this.type = type;
    this.lexeme = lexeme;
    if (arg) {
      if (arg instanceof IIndexRange) {
        this.location = arg as IIndexRange;
      } else {
        this.location = { start: arg, end: { ...arg, index: arg.index + lexeme.length } };
      }
    }
  }
}

export const EOF = new BaseToken<any>(ETokenType.EOF, "/EOF");
