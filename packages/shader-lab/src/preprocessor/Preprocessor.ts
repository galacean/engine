// @ts-ignore
import { ShaderLib, ShaderMacro } from "@galacean/engine";
import PpLexer from "./PpLexer";
import { PpParser } from "./PpParser";

/** @internal */
export class Preprocessor {
  static lexer: PpLexer;

  static parse(
    source: string,
    macros: ShaderMacro[],
    platformMacros: string[],
    basePathForIncludeKey: string
  ): string | null {
    PpParser.reset(ShaderLib, basePathForIncludeKey);

    for (const macro of macros) {
      PpParser.addPredefinedMacro(macro.name, macro.value);
    }

    for (let i = 0; i < platformMacros.length; i++) {
      PpParser.addPredefinedMacro(platformMacros[i]);
    }

    this.lexer = new PpLexer(source);
    return PpParser.parse(this.lexer);
  }

  // #if _VERBOSE
  static convertSourceIndex(index: number) {
    return this.lexer.sourceMap.map(index);
  }
  // #endif
}
