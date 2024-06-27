import { ETokenType } from "./common/types";
import { IIndexRange } from "./preprocessor/IndexRange";

export class BaseToken<T = any> {
  readonly type: T;
  readonly lexeme: string;
  readonly location?: IIndexRange;

  constructor(type: T, lexeme: string, start?: number);
  constructor(type: T, lexeme: string, location?: IIndexRange);
  constructor(type: T, lexeme: string, arg?: IIndexRange | number) {
    this.type = type;
    this.lexeme = lexeme;
    if (arg instanceof Object) {
      this.location = arg;
    } else {
      this.location = { start: arg, end: arg + lexeme.length };
    }
  }
}

export const EOF = new BaseToken<any>(ETokenType.EOF, "/EOF");
