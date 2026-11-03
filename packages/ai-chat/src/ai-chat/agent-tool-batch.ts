/** Consecutive safe reads overlap; exclusive calls are ordered barriers.
 * Always settle admitted work before returning, including cancellation/fatal errors. */
export async function runToolBatch<T, R>(
  calls: readonly T[],
  parallel: (call: T) => boolean,
  execute: (call: T, index: number) => Promise<R>,
  signal: AbortSignal,
  concurrency = 8
): Promise<{ values: (R | undefined)[]; error?: unknown }> {
  const values: (R | undefined)[] = new Array(calls.length);
  let error: unknown;
  for (let index = 0; index < calls.length; ) {
    if (signal.aborted) {
      error ??= signal.reason ?? new Error("Batch cancelled");
      break;
    }
    if (error) break;
    let end = index + 1;
    if (parallel(calls[index])) while (end < calls.length && parallel(calls[end])) end++;
    let cursor = index;
    const worker = async () => {
      while (cursor < end && !error && !signal.aborted) {
        const current = cursor++;
        try {
          values[current] = await execute(calls[current], current);
        } catch (caught) {
          error ??= caught instanceof Error ? caught : new Error(String(caught));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, end - index) }, worker));
    index = end;
  }
  if (signal.aborted) error ??= signal.reason ?? new Error("Batch cancelled");
  return { values, ...(error ? { error } : {}) };
}
