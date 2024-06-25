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

  // #if _DEBUG
  convertSourceIndex(index: number) {
    return this.scanner.sourceMap.map(index);
  }
  // #endif
}
