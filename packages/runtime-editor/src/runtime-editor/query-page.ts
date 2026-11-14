export interface QueryPageOptions {
  limit?: number;
  cursor?: string;
}
export interface QueryPage<T> {
  items: T[];
  total: number;
  revision: string;
  nextCursor: string | null;
}
export const QUERY_PAGE_BYTES = 32 * 1024;

/** Cursor identity covers the result and selector, so pages cannot silently mix snapshots. */
export async function queryPage<T>(
  rows: readonly T[],
  scope: unknown,
  options: QueryPageOptions = {}
): Promise<QueryPage<T>> {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Query limit must be an integer from 1 to 100");
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify([scope, rows])));
  const revision = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let offset = 0;
  if (options.cursor) {
    let cursor: { revision: string; offset: number };
    try {
      cursor = JSON.parse(options.cursor);
    } catch {
      throw new Error("Invalid query cursor");
    }
    if (!cursor || cursor.revision !== revision)
      throw new Error("Query results or filters changed; restart without a cursor");
    if (!Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > rows.length)
      throw new Error("Invalid query cursor offset");
    offset = cursor.offset;
  }
  const next = (index: number) => (index < rows.length ? JSON.stringify({ revision, offset: index }) : null);
  const page: QueryPage<T> = { items: [], total: rows.length, revision, nextCursor: next(offset) };
  while (offset < rows.length && page.items.length < limit) {
    page.items.push(rows[offset]);
    page.nextCursor = next(offset + 1);
    if (encoder.encode(JSON.stringify(page)).byteLength > QUERY_PAGE_BYTES) {
      page.items.pop();
      page.nextCursor = next(offset);
      if (!page.items.length) throw new Error("Query entry exceeds the page byte budget; read the object by ID");
      break;
    }
    offset++;
  }
  return page;
}
