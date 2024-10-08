import { BaseToken } from "../common/BaseToken";
import { ShaderRange } from "../common";
import { GSError, GSErrorName } from "../Error";

export class MacroDefine {
  readonly location?: ShaderRange;
  readonly macro: BaseToken;
  readonly args?: BaseToken[];
  readonly body?: BaseToken;

  get isFunction() {
    return !!this.args?.length;
  }

  get macroLexeme() {
    return this.macro.lexeme;
  }

  constructor(macro: BaseToken, body?: BaseToken, loc?: ShaderRange, args?: BaseToken[]) {
    this.location = loc;
    this.macro = macro;
    this.body = body;
    this.args = args;
  }

  private _expand(...args: string[]): string {
    if (this.isFunction) {
      const argsTextList = this.args!.map((item) => item.lexeme);

      // #if _VERBOSE
      if (args.length !== this.args?.length) {
        throw new GSError(GSErrorName.PreprocessorError, "mismatched function macro", this.location, "");
      }
      // #endif
      const replaceRegex = new RegExp(`\\b(${argsTextList.join("|")})\\b`, "g");
      return this.body.lexeme.replaceAll(replaceRegex, (_, m) => {
        const idx = argsTextList.findIndex((item) => item === m);
        return args[idx];
      });
    }
    return this.body.lexeme;
  }

  expand(...args: string[]): string {
    const ret = this._expand(...args);
    // TODO: erase the comments, any more performant and lightweight solution?
    return ret.replaceAll(/(\/\/[^\n]*|\/\*.*\*\/)/gs, "");
  }
}
