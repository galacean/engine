import { BaseToken } from "../common/BaseToken";
import { IIndexRange } from "../common";
import { PpError } from "./PpError";

export class MacroDefine extends PpError {
  readonly location?: IIndexRange;
  readonly macro: BaseToken;
  readonly args?: BaseToken[];
  readonly body?: BaseToken;

  get isFunction() {
    return !!this.args?.length;
  }

  get macroLexeme() {
    return this.macro.lexeme;
  }

  constructor(macro: BaseToken, body?: BaseToken, loc?: IIndexRange, args?: BaseToken[]) {
    super();
    this.location = loc;
    this.macro = macro;
    this.body = body;
    this.args = args;
  }

  private _expand(...args: string[]): string {
    if (this.isFunction) {
      const argsTextList = this.args!.map((item) => item.lexeme);

      // #if _EDITOR
      if (args.length !== this.args?.length) {
        this.throw(this.location, "mismatched function macro");
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
    return ret.replaceAll(/(\/\/[^\n]*|\/\*.*\*\/)/gs, "");
  }
}
