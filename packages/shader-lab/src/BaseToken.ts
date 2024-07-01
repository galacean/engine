import { ETokenType } from "./common/types";
import { IIndexRange, Position } from "./preprocessor/IndexRange";

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
      if ((<IIndexRange>arg).start != undefined) {
        this.location = arg as IIndexRange;
      } else {
        // @ts-ignore
        this.location = { start: arg, end: { ...arg, index: arg.index + lexeme.length } };
      }
    }
  }
}

export const EOF = new BaseToken<any>(ETokenType.EOF, "/EOF");
