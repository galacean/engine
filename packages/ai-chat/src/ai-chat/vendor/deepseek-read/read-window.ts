/** Adapted from DeepSeek Harness read.ts/read-render.ts; see UPSTREAM.md and LICENSE. */
export const READ_LIMIT = 2000;
export const READ_MAX_LINE_LENGTH = 2000;
export type ReadPosition = { offset: number };
export type ReadInput = ReadPosition & { file_path: string; limit: number };
export type FileTextLine = { number: number; text: string };
export type ReadWindow = ReadPosition & { limit: number; maxBytes: number };
export type WindowResult = {
  lines: FileTextLine[];
  totalLines: number;
  next: ReadPosition | null;
};

function positiveInteger(value: unknown, name: string, fallback: number): number {
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function parseReadArgs(args: Record<string, unknown>): ReadInput {
  if (Object.keys(args).some((key) => !["file_path", "offset", "limit"].includes(key)))
    throw new Error("Unknown read argument");
  if (typeof args.file_path !== "string" || !args.file_path.trim())
    throw new Error("file_path must be a non-empty string");
  const offset = positiveInteger(args.offset, "offset", 1);
  const limit = positiveInteger(args.limit, "limit", READ_LIMIT);
  if (limit > READ_LIMIT) throw new Error(`limit must be less than or equal to ${READ_LIMIT}`);
  return { file_path: args.file_path, offset, limit };
}

const encoder = new TextEncoder();
const byteSize = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

/** Return whole rendered lines; only intrinsically long lines are explicitly truncated. */
export async function buildWindow(
  chunks: AsyncIterable<string> | Iterable<string>,
  request: ReadWindow,
  displayPath: string
): Promise<WindowResult> {
  const lines: FileTextLine[] = [];
  let totalLines = 0,
    outputBytes = 2,
    lineLength = 0,
    lastChar = "",
    lineBuffer = "",
    stopped = false;

  function append(segment: string): void {
    // Bounded even for huge one-line streams; look ahead to avoid splitting a surrogate pair.
    if (!stopped && totalLines + 1 >= request.offset && lines.length < request.limit) {
      lineBuffer += segment.slice(0, Math.max(0, READ_MAX_LINE_LENGTH + 1 - lineBuffer.length));
    }
    lineLength += segment.length;
    if (segment.length) lastChar = segment.at(-1)!;
  }

  function consumeLine(): void {
    totalLines++;
    if (!stopped && totalLines >= request.offset && lines.length < request.limit) {
      const textLength = lineLength - Number(lastChar === "\r");
      let end = Math.min(textLength, READ_MAX_LINE_LENGTH);
      if (/[\uD800-\uDBFF]/.test(lineBuffer.charAt(end - 1)) && /[\uDC00-\uDFFF]/.test(lineBuffer.charAt(end))) end--;
      const text =
        lineBuffer.slice(0, end) +
        (textLength > READ_MAX_LINE_LENGTH ? `... (line truncated to ${READ_MAX_LINE_LENGTH} chars)` : "");
      const line = { number: totalLines, text };
      const cost = (lines.length ? 1 : 0) + byteSize(line);
      if (outputBytes + cost > request.maxBytes) {
        if (!lines.length) throw new Error("Read byte limit is too small for one rendered line");
        stopped = true;
      } else {
        lines.push(line);
        outputBytes += cost;
      }
    }
    lineBuffer = "";
    lineLength = 0;
    lastChar = "";
  }

  for await (const chunk of chunks) {
    let start = 0,
      newline: number;
    while ((newline = chunk.indexOf("\n", start)) !== -1) {
      append(chunk.slice(start, newline));
      consumeLine();
      start = newline + 1;
    }
    append(chunk.slice(start));
  }
  if (lineLength > 0) consumeLine();
  if (request.offset > totalLines && !(totalLines === 0 && request.offset === 1)) {
    throw new Error(`offset ${request.offset} is out of range for "${displayPath}" (${totalLines} lines)`);
  }
  const last = lines.at(-1)?.number ?? 0;
  return { lines, totalLines, next: last < totalLines ? { offset: last + 1 } : null };
}
