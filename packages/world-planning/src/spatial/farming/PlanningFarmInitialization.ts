import type { PlanningDocument } from "../PlanningDocument";

export const PLANNING_FARMING_PROJECT_PATH = "World/Farming.json";

/** A reset targets the selected save, not every asset later bound to the Scene. */
export function planningFarmInitializationRequest(
  document: PlanningDocument,
  seed: number,
  statePath: string,
  mode: "auto" | "new"
) {
  const request = document.farmInitializationRequests?.[String(seed)];
  return mode === "new" && request?.statePath === statePath ? request.id : undefined;
}

/** Stored beside the snapshot, in the same project transaction. Retain completed
 * requests so authoring undo/redo cannot replay an older destructive choice. */
export interface PlanningFarmInitialization {
  initialized: true;
  requests: string[];
}

export function planningFarmInitialization(state: unknown, farmId: string, requestId?: string) {
  if (requestId !== undefined && (typeof requestId !== "string" || !requestId))
    throw Error("Invalid farm initialization request");
  const records = (state as { initializations?: unknown } | null)?.initializations;
  if (records !== undefined && (!records || typeof records !== "object" || Array.isArray(records)))
    throw Error("Invalid farm initialization records");
  const record = records && (records as Record<string, PlanningFarmInitialization>)[farmId];
  if (
    record !== undefined &&
    (!record ||
      record.initialized !== true ||
      !Array.isArray(record.requests) ||
      record.requests.some((id) => typeof id !== "string" || !id))
  )
    throw Error("Invalid farm initialization record");
  const replace = !!requestId && !record?.requests.includes(requestId);
  return { replace, resume: !!record && !replace, record };
}
