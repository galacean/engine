import { BaseToken } from "../common/BaseToken";
import { ShaderRange } from "../common";
import { GSError, GSErrorName } from "../GSError";

export class MacroDefine {
  get isFunction() {
    return !!this.args?.length;
  }

  get macroLexeme() {
    return this.macro.lexeme;
  }

  private _replaceRegex?: RegExp;

  constructor(
    public readonly macro: BaseToken,
    public readonly body?: BaseToken,
    public readonly location?: ShaderRange,
    public readonly args?: BaseToken[]
  ) {
    if (args) {
      const argsTextList = this.args.map((item) => item.lexeme);
      this._replaceRegex = new RegExp(`\\b(${argsTextList.join("|")})\\b`, "g");
    }
  }

  expandFunctionBody(args: string[]): string {
    const argsTextList = this.args!.map((item) => item.lexeme);

    // #if _VERBOSE
    if (args.length !== this.args?.length) {
      throw new GSError(GSErrorName.PreprocessorError, "mismatched function macro", this.location, "");
    }
    // #endif

    const expanded = this.body.lexeme.replace(this._replaceRegex, (_, m) => {
      return args[argsTextList.indexOf(m)];
    });

    return expanded;
  }
}
