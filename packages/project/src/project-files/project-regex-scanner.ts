import { RE2JS } from "re2js";
import { SEARCH_LIMITS } from "./project-search-contract";
import type { RegexHit } from "./project-regex-protocol";

/** Line-oriented regex semantics. Chunk boundaries never become regex anchors.
 * The host caps total input; coalescing also bounds bookkeeping for tiny chunks. */
export class ProjectRegexScanner {
  private readonly regex: RE2JS;
  private blocks: string[] = [];
  private fragments: string[] = [];
  private fragmentChars = 0;
  private lineChars = 0;
  private line = 1;

  constructor(query: string, caseSensitive: boolean) {
    this.regex = RE2JS.compile(query, caseSensitive ? 0 : RE2JS.CASE_INSENSITIVE);
    if (this.regex.programSize() > SEARCH_LIMITS.regexProgramSize)
      throw new Error("Regular expression exceeds program-size budget");
  }

  push(text: string, first: boolean, end: boolean, limit: number): RegexHit[] {
    if (first) {
      this.clearLine();
      this.line = 1;
    }
    const hits: RegexHit[] = [];
    let start = 0;
    while (start < text.length) {
      const newline = text.indexOf("\n", start);
      this.append(text.slice(start, newline < 0 ? text.length : newline));
      if (newline < 0) break;
      this.consume(hits);
      if (hits.length >= limit) return hits;
      start = newline + 1;
    }
    // Match file reads: empty files and the position after a trailing LF aren't extra lines.
    if (end && this.lineChars) this.consume(hits);
    return hits;
  }

  private append(text: string): void {
    if (!text.length) return;
    this.lineChars += text.length;
    if (this.lineChars > SEARCH_LIMITS.scanChars) throw new Error("Regex input exceeded scan budget");
    this.fragments.push(text);
    this.fragmentChars += text.length;
    if (this.fragmentChars >= SEARCH_LIMITS.blockChars) {
      this.blocks.push(this.fragments.join(""));
      this.fragments = [];
      this.fragmentChars = 0;
    }
  }

  private consume(hits: RegexHit[]): void {
    if (this.fragments.length) this.blocks.push(this.fragments.join(""));
    let text = this.blocks.join("");
    if (text.endsWith("\r")) text = text.slice(0, -1);
    // The public boolean API can reject misses without constructing capture results.
    if (this.regex.test(text)) {
      const matcher = this.regex.matcher(text);
      if (matcher.find()) {
        const hit = matcher.start();
        let from = Math.max(0, hit - 80),
          to = Math.min(text.length, from + SEARCH_LIMITS.excerptChars);
        const splitPair = (at: number) =>
          /[\uD800-\uDBFF]/.test(text.charAt(at - 1)) && /[\uDC00-\uDFFF]/.test(text.charAt(at));
        if (splitPair(from)) from--;
        to = Math.min(to, from + SEARCH_LIMITS.excerptChars);
        if (splitPair(to)) to--;
        let excerpt = "";
        for (let i = from; i < to; i++) excerpt += text[i];
        hits.push({ line: this.line, column: hit + 1, textColumn: from + 1, text: excerpt });
      }
    }
    this.clearLine();
    this.line++;
  }

  private clearLine(): void {
    this.blocks = [];
    this.fragments = [];
    this.fragmentChars = this.lineChars = 0;
  }
}
