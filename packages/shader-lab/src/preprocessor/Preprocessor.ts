import PpParser from "./PpParser";
import PpScanner from "./PpScanner";

/** @internal */
export class Preprocessor {
  static baseScanner: PpScanner;

  static reset(includeMap: Record<string, string>) {
    PpParser.reset(includeMap);
  }

  /**
   * Should call it after reset.
   */
  static process(source: string) {
    this.baseScanner = new PpScanner(source);
    return PpParser.parse(this.baseScanner);
  }

  static addPredefinedMacro(macro: string, value?: string) {
    PpParser.addPredefinedMacro(macro, value);
  }

  // #if _EDITOR
  static convertSourceIndex(index: number) {
    return this.baseScanner.sourceMap.map(index);
  }
  // #endif
}
