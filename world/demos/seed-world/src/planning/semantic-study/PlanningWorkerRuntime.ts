import {
  planningWaterPatch,
  planningWaterHeightPatch,
  planningHeightToken,
  type PlanningWaterPatch,
  type PlanningWaterHeightPatch
} from "./PlanningWaterPatch.ts";
import { planningDerivedPatch, type PlanningDerivedPatch } from "@galacean/engine-world-planning/semantic-study/PlanningDerivedPatch";
import { generatePlanningDocument, assertPlanningRuntimeSignature } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import { importPlanningDocument, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import type { SemanticEdit, SemanticParameters, SemanticResult } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { cachedPlanningHeightmap, planningHeightmap, type PlanningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";

/** Subsequent input references a worker-owned snapshot instead of cloning the world back. */
export interface PlanningWorkerRequest {
  requestId: number;
  runtimeSignature: string;
  document?: PlanningDocument;
  parameters: SemanticParameters;
  edits: Record<string, SemanticEdit>;
  previousSnapshot?: SemanticResult;
  previousRequestId?: number;
  previousHeightToken?: string;
}
export type PlanningWorkerResponse =
  | { type: "progress"; requestId: number; stage: string }
  | {
      type: "result";
      requestId: number;
      result: SemanticResult;
      height?: Omit<PlanningHeightmap, "sample">;
      elapsedMs: number;
    }
  | {
      type: "landscape";
      requestId: number;
      result: Omit<SemanticResult, "plan">;
      plan: PlanningDerivedPatch;
      height?: Omit<PlanningHeightmap, "sample">;
      elapsedMs: number;
    }
  | {
      type: "water";
      requestId: number;
      baseRequestId: number;
      runtimeSignature: string;
      baseSignature: string;
      result: Omit<SemanticResult, "plan">;
      plan: PlanningWaterPatch;
      heightPatch: PlanningWaterHeightPatch;
      elapsedMs: number;
    }
  | { type: "error"; requestId: number; message: string };

/** One isolated worker lifetime; tests drive this same protocol through structured cloning. */
export function createPlanningWorkerRuntime(postMessage: (message: PlanningWorkerResponse) => void) {
  const snapshots = new Map<number, SemanticResult>();
  const sharedHeights = new Map<number, PlanningHeightmap>();
  return (request: PlanningWorkerRequest): void => {
    const start = performance.now();
    try {
      assertPlanningRuntimeSignature(request.runtimeSignature);
      const previous =
        request.previousSnapshot ??
        (request.previousRequestId === undefined ? undefined : snapshots.get(request.previousRequestId));
      if (request.previousRequestId !== undefined && !previous) throw new Error("规划基准快照已失效");
      const result = request.document
        ? generatePlanningDocument(request.document, previous, [], (stage) =>
            postMessage({ type: "progress", requestId: request.requestId, stage })
          )
        : generatePlanningDocument(
            importPlanningDocument({ version: 2, parameters: request.parameters, edits: request.edits }),
            previous
          );
      // Keep the caller's accepted base and the newest response, even if the latter is superseded.
      for (const id of snapshots.keys())
        if (id !== request.previousRequestId) {
          snapshots.delete(id);
          sharedHeights.delete(id);
        }
      snapshots.set(request.requestId, result);
      // Grounding already compiled the canonical raster. Share those bytes with the renderer
      // instead of evaluating all terrain samples again in its independent worker.
      const compiledHeight = cachedPlanningHeightmap(result.plan);
      const previousHeight =
        request.previousRequestId === undefined
          ? undefined
          : (sharedHeights.get(request.previousRequestId) ??
            (request.previousHeightToken && previous ? planningHeightmap(previous.plan) : undefined));
      if (
        request.previousHeightToken &&
        previousHeight &&
        planningHeightToken(previousHeight) !== request.previousHeightToken
      )
        throw Error("Water worker canonical baseline mismatch");
      let height: Omit<PlanningHeightmap, "sample"> | undefined;
      if (compiledHeight && compiledHeight !== previousHeight) {
        const { sample, ...data } = compiledHeight;
        height = data;
      }
      if (compiledHeight) sharedHeights.set(request.requestId, compiledHeight);
      if (
        result.execution === "water-overlay" &&
        result.accepted &&
        previous &&
        compiledHeight &&
        previousHeight &&
        request.previousRequestId !== undefined &&
        request.previousHeightToken !== undefined &&
        previous.waterOverlay?.mode === "overlay" &&
        previous.waterOverlay.baseSignature === result.waterOverlay?.baseSignature
      ) {
        const { plan, ...metadata } = result;
        postMessage({
          type: "water",
          requestId: request.requestId,
          baseRequestId: request.previousRequestId,
          runtimeSignature: request.runtimeSignature,
          baseSignature: result.waterOverlay.baseSignature,
          result: metadata,
          plan: planningWaterPatch(plan),
          heightPatch: planningWaterHeightPatch(previousHeight, compiledHeight, [
            ...previous.waterOverlay.bounds,
            ...result.waterOverlay.bounds
          ]),
          elapsedMs: performance.now() - start
        });
      } else if ((result.execution === "landscape" || result.execution === "guidance") && result.accepted && previous) {
        const { plan, ...metadata } = result;
        postMessage({
          type: "landscape",
          requestId: request.requestId,
          result: metadata,
          plan: planningDerivedPatch(plan),
          height,
          elapsedMs: performance.now() - start
        });
      } else
        postMessage({
          type: "result",
          requestId: request.requestId,
          result,
          height,
          elapsedMs: performance.now() - start
        });
    } catch (error) {
      postMessage({
        type: "error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };
}
