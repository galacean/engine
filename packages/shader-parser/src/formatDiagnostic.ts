/**
 * Formats a diagnostic with a source excerpt and caret markers.
 * @param source - Source text containing the diagnostic.
 * @param range - Zero-based source range containing the diagnostic.
 * @param header - Text displayed before the source excerpt.
 * @param contextLines - Number of context lines shown on either side of the range.
 * @returns Formatted diagnostic text.
 */
export function formatDiagnosticSource(
  source: string | undefined,
  range: { start: { line: number; column: number }; end: { line: number; column: number } },
  header: string,
  contextLines = 5
): string {
  if (!source) return header;

  const lines = source.split("\n");
  const { start, end } = range;

  const from = Math.max(0, start.line - contextLines);
  const to = Math.min(lines.length - 1, end.line + contextLines);
  const gutterWidth = String(to + 1).length;
  const gutterPad = " ".repeat(gutterWidth);

  let out = header + "\n";
  for (let i = from; i <= to; i++) {
    out += `${String(i + 1).padStart(gutterWidth)} | ${lines[i]}\n`;
    if (start.line <= i && i <= end.line) {
      const cs = i === start.line ? start.column : 0;
      const ce = i === end.line ? end.column : lines[i].length;
      out += `${gutterPad} | ${" ".repeat(cs)}${"^".repeat(Math.max(ce - cs, 1))}\n`;
    }
  }
  return out;
}
