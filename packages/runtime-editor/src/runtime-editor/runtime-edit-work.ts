/** Give a visible game a rendering opportunity between detached preparation steps.
 * This is a cooperative target, not preemption: one indivisible check can exceed it.
 * Publication still changes authoring/history together, after every check succeeds. */
export function runtimeEditWork(): (signal?: AbortSignal) => Promise<void> | undefined {
  let start = performance.now();
  return (signal) => {
    signal?.throwIfAborted();
    if (
      typeof requestAnimationFrame !== "function" ||
      typeof document === "undefined" ||
      document.visibilityState !== "visible" ||
      performance.now() - start < 4
    )
      return;
    return new Promise<void>((resolve, reject) => {
      let frame: number, timer: ReturnType<typeof setTimeout>, fallback: ReturnType<typeof setTimeout>;
      const finish = () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        clearTimeout(fallback);
        signal?.removeEventListener("abort", abort);
        start = performance.now();
        if (signal?.aborted) reject(signal.reason);
        else resolve();
      };
      const abort = () => finish();
      frame = requestAnimationFrame(() => {
        timer = setTimeout(finish, 0);
      });
      // Continue if the page becomes hidden after scheduling the frame.
      fallback = setTimeout(finish, 50);
      signal?.addEventListener("abort", abort, { once: true });
    });
  };
}
