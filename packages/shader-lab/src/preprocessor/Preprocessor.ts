import { TextToken } from "./TextToken";
/** @ts-ignore */
import { Logger, ShaderLib } from "@galacean/engine";
import { Tokenizer } from "./Tokenizer";
import { Util } from "./Util";
import { EGSMacro } from "./constants";

type ReplaceFn = (...args: string[]) => string;
type TextReplacer = string | ReplaceFn;

/** @internal */
export class Preprocessor {
  private _tokenizer: Tokenizer;
  private _tokenTrace: TextToken[] = [];
  private _source: string;
  private _curMacroLvl = 0;

  /** @internal */
  _definePairs: Map<string, { isFunction: boolean; replacer: TextReplacer }> = new Map();
  private set definePairs(pairs: Map<string, { isFunction: boolean; replacer: TextReplacer }>) {
    this._definePairs = pairs;
  }
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
      const { res: token, end } = this.consumeToken(this._tokenizer);
      if (token) {
        this.onToken(token);
      }
      if (end) break;
    }

    const ret = Util.replaceSegments(this._source, this._replacers);

    return ret;
  }

  reset() {
    this._tokenTrace.length = 0;
    this._curMacroLvl = 0;
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
      case EGSMacro.undef:
        this.addMacroLvl();
        break;
      case EGSMacro.endif:
        this.addMacroLvl(-1);
        break;
      case EGSMacro.include:
        this.handleInclude(token);
        break;
      default:
        break;
    }
  }

  private consumeToken(tokenizer: Tokenizer) {
    while (true) {
      const result = tokenizer.scanToken();
      const { end, res: token } = result;
      if (tokenizer.curChar === "/" && tokenizer.peek === "/") {
        // ignore comments
        tokenizer.scanChunk("\n");
        continue;
      }
      if (token) {
        const defineMacro = this._definePairs.get(token.text);
        if (defineMacro && this._curMacroLvl === 0) {
          const { isFunction, replacer } = defineMacro;
          if (isFunction) {
            const { res: chunk } = tokenizer.scanChunkBetweenPair("(", ")");
            const splitTokenizer = new Tokenizer(chunk.text);
            const args = splitTokenizer.splitBy(",").map((item) => item.text);

            const endIdx = tokenizer.curIndex + 1;
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

  private addMacroLvl(inc = 1) {
    this._curMacroLvl += inc;
  }

  private handleInclude(macroToken: TextToken) {
    const { res: includeKey } = this._tokenizer.scanChunkBetweenPair('"', '"');
    let code = ShaderLib[includeKey.text];
    if (!code) {
      Logger.error(`Shader slice "${includeKey.text}" not founded.`);
    } else {
      const preprocessor = new Preprocessor(code);
      preprocessor.definePairs = this._definePairs;
      code = preprocessor.process();
    }

    this._replacers.push({ startIdx: macroToken.start.index, endIdx: includeKey.end.index, replace: code ?? "" });
  }

  private handleDefine(macroToken: TextToken) {
    // Ignore processing when under other macro
    if (this._curMacroLvl > 0) return;
    this.addMacroLvl();
    const tokenizer = this._tokenizer;

    const variable = this.consumeToken(this._tokenizer);
    if (variable.res?.text === "xxx") debugger;
    if (!variable.res || variable.end) throw "No defined variable";
    if (this._definePairs.get(variable.res.text)) throw `redefined macro: ${variable.res.text}`;

    let macroArgs: string[];
    const isMacroFunction = tokenizer.curChar === "(";
    if (isMacroFunction) {
      const { res: tokens } = tokenizer.scanTokenBetweenPair("(", ")");
      macroArgs = tokens.map((item) => item.text);
    }

    let chunk: string;
    if (tokenizer.curChar === "\n") {
      // line break happens
      chunk = "";
    } else {
      const scan = tokenizer.scanChunk("\n", { skipHeadingSpace: true });
      chunk = scan.res;
      chunk = this.extendDefineMacro(chunk).trimEnd();
    }

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

    this._replacers.push({ startIdx: macroToken.start.index, endIdx: tokenizer.curIndex, replace: "" });
    this.addMacroLvl(-1);
  }

  /**
   * extend recursive define macro
   */
  private extendDefineMacro(line: string) {
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
            const args = chunk.text.split(",").map((item) => this.extendDefineMacro(item));

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
