const safeFailures = new WeakSet<object>();

/** A nested rollback failed, even if an outer transaction cleaned up its own work. */
export class WaterMutationRollbackError extends AggregateError {}

function hasRollbackFailure(error: unknown, visited = new Set<unknown>()): boolean {
  if (visited.has(error)) return false;
  visited.add(error);
  return (
    error instanceof WaterMutationRollbackError ||
    (error instanceof AggregateError && error.errors.some((cause) => hasRollbackFailure(cause, visited)))
  );
}

/** Preserve error identity (including DOMException) and annotate a verified safe failure. */
export function markWaterSceneMutationSafe(error: unknown): unknown {
  const failure =
    error !== null && (typeof error === "object" || typeof error === "function") ? error : new Error(String(error));
  if (hasRollbackFailure(failure)) safeFailures.delete(failure);
  else safeFailures.add(failure);
  return failure;
}

export function isWaterSceneMutationSafe(error: unknown): boolean {
  return error !== null && (typeof error === "object" || typeof error === "function") && safeFailures.has(error);
}
