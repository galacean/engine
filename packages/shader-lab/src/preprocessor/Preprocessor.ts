import PpParser from "./PpParser";
import PpScanner from "./PpScanner";

/** @internal */
export class Preprocessor {
  static baseScanner: PpScanner;

  /**
   * Reset the parser of `Preprocessor`
   * @param pathOrigin follow the specifications of [URL.origin](https://developer.mozilla.org/en-US/docs/Web/API/URL/origin), like: `shaders://root/`
   * @param basePathForIncludeKey the base path to resolve the relative path of `#include` directive. Must be prefixed by `pathOrigin`
   */
  static reset(includeMap: Record<string, string>, pathOrigin: string, basePathForIncludeKey: string): void {
    PpParser.reset(includeMap, pathOrigin, basePathForIncludeKey);
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
