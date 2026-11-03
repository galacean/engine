/** Stop and drain once. Failed persistence retains the accepted project for an independent retry. */
export function createSeedWorldProjectClose(stop: () => Promise<void>, save: () => Promise<void>, release: () => void): () => Promise<void> {
  let stopped = false, closed = false;
  let pending: Promise<void> | undefined;
  return () => {
    if (closed) return Promise.resolve();
    pending ??= (async () => {
      if (!stopped) { await stop(); stopped = true; }
      await save();
      release();
      closed = true;
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
