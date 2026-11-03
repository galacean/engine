import type { AgentEditTransaction } from "./agent-types";

/** Activation has its own bounded wait and may be cancelled without erasing the commit. */
export async function activateCommittedEdit(
  transaction: AgentEditTransaction,
  taskSignal: AbortSignal,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error("Committed edit activation cancelled"));
  const timer = setTimeout(
    () => controller.abort(new Error(`Committed edit activation exceeded timeoutMs=${timeoutMs}`)),
    timeoutMs
  );
  let removeAbort = () => {};
  if (taskSignal.aborted) cancel();
  else taskSignal.addEventListener("abort", cancel, { once: true });
  try {
    controller.signal.throwIfAborted();
    const cancelled = new Promise<never>((_resolve, reject) => {
      const abort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", abort, { once: true });
      removeAbort = () => controller.signal.removeEventListener("abort", abort);
    });
    await Promise.race([Promise.resolve(transaction.activate!(controller.signal)), cancelled]);
  } finally {
    clearTimeout(timer);
    taskSignal.removeEventListener("abort", cancel);
    removeAbort();
    controller.abort();
  }
}
