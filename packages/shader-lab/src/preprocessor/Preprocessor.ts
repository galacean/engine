import { PpParser } from "./PpParser";
import PpLexer from "./PpLexer";

/** @internal */
export class Preprocessor {
  static baseScanner: PpLexer;

  /**
   * Reset the parser of `Preprocessor`
   * @param basePathForIncludeKey - the base path to resolve the relative path of `#include` directive
   */
  static reset(includeMap: Record<string, string>, basePathForIncludeKey: string): void {
    PpParser.reset(includeMap, basePathForIncludeKey);
  }

  /**
   * Should call it after reset.
   */
  static process(source: string): string | null {
    this.baseScanner = new PpLexer(source);
    return PpParser.parse(this.baseScanner);
  }

  static addPredefinedMacro(macro: string, value?: string): void {
    PpParser.addPredefinedMacro(macro, value);
  }

  // #if _VERBOSE
  static convertSourceIndex(index: number) {
    return this.baseScanner.sourceMap.map(index);
  }
  // #endif
}
