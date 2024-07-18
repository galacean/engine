import PpParser from "./PpParser";
import PpScanner from "./PpScanner";

/** @internal */
export class Preprocessor {
  static baseScanner: PpScanner;

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
  static process(source: string): string {
    this.baseScanner = new PpScanner(source);
    return PpParser.parse(this.baseScanner);
  }

  static addPredefinedMacro(macro: string, value?: string): void {
    PpParser.addPredefinedMacro(macro, value);
  }

  // #if _EDITOR
  static convertSourceIndex(index: number) {
    return this.baseScanner.sourceMap.map(index);
  }
  // #endif
}
