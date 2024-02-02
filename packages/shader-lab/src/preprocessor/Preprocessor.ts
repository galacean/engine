import { TextToken } from "./TextToken";
import { Tokenizer } from "./Tokenizer";
import { Util } from "./Util";
import { EGSMacro } from "./constants";

type ReplaceFn = (...args: string[]) => string;
type TextReplacer = string | ReplaceFn;

/** @internal */
export class Preprocessor {
  private _tokenizer: Tokenizer;
  private _tokenList: TextToken[] = [];
  private _tokenTrace: TextToken[] = [];
  private _source: string;
  private _curMacroToken: TextToken;

  private _definePairs: Map<string, { isFunction: boolean; replacer: TextReplacer }> = new Map();
  private _replacers: IReplaceSegment[] = [];

  constructor(source: string) {
    this._source = source;
    this._tokenizer = new Tokenizer(source);
  }

  /**
   * extend `#define` macro
   */
  process() {
    while (true) {
      const { res: token, end } = this.consumeToken();
      if (token) {
        this.onToken(token);
      }
      if (end) break;
    }

    const ret = Util.replaceSegments(this._source, this._replacers);

    this.reset();
    return ret;
  }

  reset() {
    this._tokenList.length = 0;
    this._tokenTrace.length = 0;
    this._curMacroToken = undefined;
    this._definePairs.clear();
    this._replacers.length = 0;
  }

  private onToken(token: TextToken) {
    switch (token.text) {
      case EGSMacro.define:
        this.handleDefine(token);
        break;
      case EGSMacro.if:
      case EGSMacro.ifdef:
      case EGSMacro.ifndef:
        this._curMacroToken = token;
        break;
      case EGSMacro.endif:
        this._curMacroToken = undefined;
        break;
      default:
        break;
    }
  }

  private consumeToken() {
    while (true) {
      const result = this._tokenizer.scanToken();
      const { end, res: token } = result;
      if (token) {
        // DELETE
        this._tokenList.push(token);

        const defineMacro = this._definePairs.get(token.text);
        if (defineMacro) {
          const { isFunction, replacer } = defineMacro;
          if (isFunction) {
            const { res: chunk } = this._tokenizer.scanChunkBetweenPair("(", ")");
            const args = chunk.split(",").map((item) => this.extendMacro(item));

            const endIdx = this._tokenizer.curIndex + 1;
            const replace = (<ReplaceFn>replacer)(...args);
            this._replacers.push({ startIdx: token.start.index, endIdx, replace });
          } else {
            this._replacers.push({ startIdx: token.start.index, endIdx: token.end.index, replace: <string>replacer });
          }
        }
        return result;
      }
      if (end) return result;
    }
  }

  private handleDefine(macroToken: TextToken) {
    // Ignore processing when under other macro
    if (this._curMacroToken) return;
    this._curMacroToken = macroToken;
    const tokenizer = this._tokenizer;

    const variable = this.consumeToken();
    if (!variable.res || variable.end) throw "No defined variable";

    let macroArgs: string[];
    const isMacroFunction = tokenizer.curChar === "(";
    if (isMacroFunction) {
      const { res: tokens } = tokenizer.scanTokenBetweenPair("(", ")");
      macroArgs = tokens.map((item) => item.text);
    }

    let { res: chunk } = tokenizer.scanChunk("\n", { skipHeadingSpace: true });
    // extend recursive macro
    chunk = this.extendMacro(chunk).trimEnd();

    if (isMacroFunction) {
      const replaceRegex = new RegExp(`\\b(${macroArgs.join("|")})\\b`, "g");
      const replacer = (...args) =>
        chunk.replaceAll(replaceRegex, (_, m) => {
          const idx = macroArgs.findIndex((item) => item === m);
          return args[idx];
        });
      this._definePairs.set(variable.res.text, { isFunction: true, replacer });
    } else {
      this._definePairs.set(variable.res.text, { isFunction: false, replacer: chunk });
    }

    this._replacers.push({ startIdx: this._curMacroToken.start.index, endIdx: tokenizer.curIndex, replace: "" });
    this._curMacroToken = undefined;
  }

  private extendMacro(line: string) {
    const tokenizer = new Tokenizer(line);
    const replacers: IReplaceSegment[] = [];

    while (true) {
      const { res: token, end } = tokenizer.scanToken();
      if (token) {
        const defineMacro = this._definePairs.get(token.text);
        if (defineMacro) {
          const { isFunction, replacer } = defineMacro;
          if (isFunction) {
            const { res: chunk } = tokenizer.scanChunkBetweenPair("(", ")");
            const args = chunk.split(",").map((item) => this.extendMacro(item));

            const endIdx = tokenizer.curIndex + 1;
            const replace = (<ReplaceFn>replacer)(...args);
            replacers.push({ startIdx: token.start.index, endIdx, replace });
          } else {
            replacers.push({ startIdx: token.start.index, endIdx: token.end.index, replace: <string>replacer });
          }
        }
      }
      if (end) break;
    }
    return Util.replaceSegments(line, replacers);
  }
}
