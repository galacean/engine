import type { Diagnostic } from "./Diagnostic";

/**
 * Converts a source offset to the analyzer's one-based diagnostic position.
 * @param source - Source text containing the offset.
 * @param offset - Zero-based UTF-16 offset into the source.
 * @returns One-based line and column plus the original offset.
 * @internal
 */
export function positionAt(source: string, offset: number): Diagnostic["range"]["start"] {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset; index++) {
    if (source.charCodeAt(index) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column, offset };
}
