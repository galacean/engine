/** Cancel waiting for unpublished work without letting a late candidate leak or
 * publish. Synchronous worker computation may finish later; its owner still
 * receives and disposes the result. Committed publications never use this gate. */
export function awaitPlanningPreparation<T>(
  work: Promise<T>,
  signal?: AbortSignal,
  discardLate?: (value: T) => void | Promise<void>
): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    let cancelled = false;
    const abort = () => {
      cancelled = true;
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new Error("建筑操作已取消，未发布修改"));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (cancelled)
          Promise.resolve()
            .then(() => discardLate?.(value))
            .catch((error) => console.error("Cancelled planning candidate cleanup failed", error));
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        if (!cancelled) reject(error);
      }
    );
  });
}
