import { BaseToken } from "../common/BaseToken";
import { ShaderRange } from "../common";
// #if _VERBOSE
import { GSErrorName } from "../GSError";
// #endif
import { ShaderLabUtils } from "../ShaderLabUtils";

export class MacroDefine {
  get isFunction() {
    return !!this.args?.length;
  }

  get macroLexeme() {
    return this.macro.lexeme;
  }

  private _replaceRegex?: RegExp;
  private readonly _argsTextList: string[];

  constructor(
    public readonly macro: BaseToken,
    public readonly body?: BaseToken,
    public readonly location?: ShaderRange,
    public readonly args?: BaseToken[]
  ) {
    if (args) {
      this._argsTextList = this.args.map((item) => item.lexeme);
      this._replaceRegex = new RegExp(`\\b(${this._argsTextList.join("|")})\\b`, "g");
    }
  }

  expandFunctionBody(args: string[]): string {
    if (args.length !== this.args?.length) {
      throw ShaderLabUtils.createGSError("mismatched function macro", GSErrorName.PreprocessorError, "", this.location);
    }

    const expanded = this.body.lexeme.replace(this._replaceRegex, (_, m) => {
      return args[this._argsTextList.indexOf(m)];
    });

    return expanded;
  }
}
