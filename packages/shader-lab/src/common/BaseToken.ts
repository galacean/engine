import { ETokenType } from "./types";
import { ShaderRange, ShaderPosition } from ".";
import { ShaderLab } from "../ShaderLab";

export class BaseToken<T extends number = number> {
  readonly type: T;
  readonly lexeme: string;
  readonly location: ShaderRange;

  constructor(type: T, lexeme: string, start?: ShaderPosition);
  constructor(type: T, lexeme: string, location?: ShaderRange);
  constructor(type: T, lexeme: string, arg?: ShaderRange | ShaderPosition) {
    this.type = type;
    this.lexeme = lexeme;
    if (arg) {
      if (arg instanceof ShaderRange) {
        this.location = arg as ShaderRange;
      } else {
        const end = ShaderLab.createPosition(
          arg.index + lexeme.length,
          // #if _EDITOR
          arg.line,
          arg.column
          // #endif
        );
        this.location = ShaderLab.createRange(arg, end);
      }
    }
  }
}

export const EOF = new BaseToken<any>(ETokenType.EOF, "/EOF");
