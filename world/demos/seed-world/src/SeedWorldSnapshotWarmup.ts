/** Cancel this capture's wait without cancelling the world's shared preparation. */
export async function waitForSnapshotWarmup(warmup: Promise<void> | undefined, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!warmup) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    warmup.then(
      () => {
        cleanup();
        resolve();
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}
