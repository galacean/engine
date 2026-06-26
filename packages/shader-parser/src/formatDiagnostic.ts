/**
 * Render a diagnostic against its source as a `header` + gutter-numbered code block with carets.
 *
 * The window covers the full error span plus `contextLines` lines of padding on each side
 * (`start.line - contextLines` … `end.line + contextLines`), so a multi-line range is shown in
 * full and never clipped — `contextLines` is extra context, not a fixed line budget.
 *
 * Positions are 0-based (line indexes `lines[]`, column indexes within a line); the gutter prints
 * `i + 1` for human-readable 1-based line numbers.
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
