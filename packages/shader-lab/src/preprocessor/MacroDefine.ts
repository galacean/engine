import { BaseToken } from "../common/BaseToken";
import { ShaderRange } from "../common";
import { ShaderLabUtils } from "../ShaderLabUtils";
// #if _VERBOSE
import { GSErrorName } from "../GSError";
// #endif

export class MacroDefine {
  private _replaceRegex?: RegExp;
  private readonly _argsLexemes: string[];

  get isFunction(): boolean {
    return !!this.args?.length;
  }

  constructor(
    public readonly macro: BaseToken,
    public readonly body?: BaseToken,
    public readonly location?: ShaderRange,
    public readonly args?: BaseToken[]
  ) {
    if (args) {
      this._argsLexemes = this.args.map((item) => item.lexeme);
      this._replaceRegex = new RegExp(`\\b(${this._argsLexemes.join("|")})\\b`, "g");
    }
  }

  expandFunctionBody(args: string[]): string {
    if (args.length !== this.args?.length) {
      throw ShaderLabUtils.createGSError("mismatched function macro", GSErrorName.PreprocessorError, "", this.location);
    }

    return this.body.lexeme.replace(this._replaceRegex, (m) => {
      return args[this._argsLexemes.indexOf(m)];
    });
  }
}
