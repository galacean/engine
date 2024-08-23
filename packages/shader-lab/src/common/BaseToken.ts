import { ETokenType } from "./types";
import { ShaderRange, ShaderPosition } from ".";
import { ShaderLab } from "../ShaderLab";
import { ShaderLabObjectPool } from "../ShaderLabObjectPool";
import { IPoolElement } from "@galacean/engine";

export class BaseToken<T extends number = number> implements IPoolElement {
  static pool = new ShaderLabObjectPool<BaseToken>(BaseToken);

  type: T;
  lexeme: string;
  location: ShaderRange;

  set(type: T, lexeme: string, start?: ShaderPosition);
  set(type: T, lexeme: string, location?: ShaderRange);
  set(type: T, lexeme: string, arg?: ShaderRange | ShaderPosition) {
    this.type = type;
    this.lexeme = lexeme;
    if (arg) {
      if (arg instanceof ShaderRange) {
        this.location = arg as ShaderRange;
      } else {
        const end = ShaderLab.createPosition(arg.index + lexeme.length, arg.line, arg.column + lexeme.length);
        this.location = ShaderLab.createRange(arg, end);
      }
    }
  }

  dispose(): void {}
}

export const EOF = new BaseToken();
EOF.set(ETokenType.EOF, "/EOF");
