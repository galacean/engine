import PpParser from "./Parser";
import PpScanner from "./Scanner";

export default class Preprocessor {
  private scanner: PpScanner;
  private parser: PpParser;

  constructor(source: string, includeMap: Record<string, string>) {
    this.scanner = new PpScanner(source);
    this.parser = new PpParser(includeMap);
  }

  process() {
    return this.parser.parse(this.scanner);
  }

  addPredefinedMacro(macro: string, value?: string) {
    this.parser.addPredefinedMacro(macro, value);
  }

  // #if _EDITOR
  convertSourceIndex(index: number) {
    return this.scanner.sourceMap.map(index);
  }
  // #endif
}
