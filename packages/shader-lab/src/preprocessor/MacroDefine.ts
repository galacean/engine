import LocRange from "../common/LocRange";
import { PpError } from "./PpError";
import PpToken from "./PpToken";

export class MacroDefine extends PpError {
  readonly location?: LocRange;
  readonly macro: PpToken;
  readonly args?: PpToken[];
  readonly body?: PpToken;

  get isFunction() {
    return !!this.args?.length;
  }

  get macroLexeme() {
    return this.macro.lexeme;
  }

  constructor(macro: PpToken, body?: PpToken, loc?: LocRange, args?: PpToken[]) {
    super();
    this.location = loc;
    this.macro = macro;
    this.body = body;
    this.args = args;
  }

  private _expand(...args: string[]): string {
    if (this.isFunction) {
      const argsTextList = this.args!.map((item) => item.lexeme);

      // #if _DEVELOPMENT
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
