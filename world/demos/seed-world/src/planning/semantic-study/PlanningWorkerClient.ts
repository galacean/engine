import { applyPlanningWaterHeightPatch, mergePlanningWaterPatch, planningHeightToken } from "./PlanningWaterPatch.ts";
import { planningRuntimeSignature } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import type { SemanticParameters, SemanticEdit, SemanticResult } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import type { PlanningWorkerRequest, PlanningWorkerResponse } from "./WorldPlanning.worker.ts";
import { adoptPlanningHeightmap, cachedPlanningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
let ownerSequence = 0;
export class PlanningWorkerClient {
  private readonly owner = ++ownerSequence;
  private generation = 0;
  private baseRequestId?: number;
  private runtimeSignature?: string;
  private worker: Worker | null = null;
  onProgress?: (stage: string) => void;
  private sequence = 0;
  private inFlight = false;
  private known = new WeakMap<SemanticResult, number>();
  private base: SemanticResult | undefined;
  private queued: PlanningWorkerRequest | null = null;
  private active: {
    id: number;
    resolve: (result: SemanticResult | undefined) => void;
    reject: (reason: Error) => void;
  } | null = null;
  get busy(): boolean {
    return this.active !== null;
  }
  invalidate(): void {
    this.sequence++;
    this.active?.resolve(undefined);
    this.active = null;
    this.queued = null;
    // Generation is synchronous inside the worker. Stop obsolete work rather than
    // letting the newest edit wait for an entire discarded world to finish.
    if (this.inFlight) this.releaseWorker();
  }
  run(
    parameters: SemanticParameters,
    edits: Record<string, SemanticEdit>,
    previousSnapshot?: SemanticResult,
    document?: import("@galacean/engine-world-planning/spatial/PlanningDocument").PlanningDocument,
    signal?: AbortSignal
  ): Promise<SemanticResult | undefined> {
    signal?.throwIfAborted();
    this.invalidate();
    const requestId = this.sequence;
    const abort = () => { if (this.active?.id === requestId) this.invalidate(); };
    signal?.addEventListener("abort", abort, { once: true });
    return new Promise<SemanticResult | undefined>((resolve, reject) => {
      this.active = { id: requestId, resolve, reject };
      this.queued = {
        requestId,
        parameters,
        edits,
        previousSnapshot,
        document,
        runtimeSignature: planningRuntimeSignature()
      };
      this.dispatch();
    }).finally(() => signal?.removeEventListener("abort", abort));
  }
  private dispatch(): void {
    if (this.inFlight || !this.queued) return;
    try {
      if (!this.worker) {
        const worker = (this.worker = new Worker(new URL("./WorldPlanning.worker.ts", import.meta.url), {
          type: "module"
        }));
        worker.onmessage = ({ data }: MessageEvent<PlanningWorkerResponse>) => {
          if (this.worker !== worker) return;
          if (data.type === "progress") {
            if (this.active?.id === data.requestId) this.onProgress?.(data.stage);
            return;
          }
          this.inFlight = false;
          if (this.active?.id === data.requestId) {
            const active = this.active;
            this.active = null;
            if (data.type === "error") active.reject(new Error(data.message));
            else {
              try {
                if (
                  data.type === "water" &&
                  (!this.base ||
                    this.baseRequestId !== data.baseRequestId ||
                    this.runtimeSignature !== data.runtimeSignature ||
                    this.base.waterOverlay?.mode !== "overlay" ||
                    this.base.waterOverlay.baseSignature !== data.baseSignature ||
                    data.result.waterOverlay?.baseSignature !== data.baseSignature)
                )
                  throw Error("Water worker patch baseline mismatch");
                const result: SemanticResult =
                  data.type === "water"
                    ? { ...data.result, plan: mergePlanningWaterPatch(this.base!.plan, data.plan) }
                    : data.type === "landscape"
                      ? { ...data.result, plan: { ...this.base!.plan, ...data.plan } }
                      : data.result;
                const baseHeight = this.base && cachedPlanningHeightmap(this.base.plan);
                if (data.type === "water" && !baseHeight) throw Error("Water worker height baseline missing");
                const height =
                  data.type === "water"
                    ? applyPlanningWaterHeightPatch(baseHeight!, data.heightPatch)
                    : (data.height ?? cachedPlanningHeightmap(result.plan));
                if (height) adoptPlanningHeightmap(result.plan, height);
                this.known.set(result, data.requestId);
                result.planningWorkerToken = {
                  owner: this.owner,
                  generation: this.generation,
                  requestId: data.requestId
                };
                active.resolve(result);
              } catch (error) {
                this.releaseWorker();
                active.reject(error instanceof Error ? error : new Error(String(error)));
              }
            }
          }
          this.dispatch();
        };
        worker.onerror = (event) => {
          if (this.worker === worker) this.fail(new Error(event.message || "后台规划线程未能完成请求"));
        };
      }
      const request = this.queued;
      this.queued = null;
      this.inFlight = true;
      this.base = request.previousSnapshot;
      const token = this.base?.planningWorkerToken;
      const previousRequestId =
        this.base &&
        (this.known.get(this.base) ??
          (token?.owner === this.owner && token.generation === this.generation ? token.requestId : undefined));
      this.baseRequestId = previousRequestId;
      this.runtimeSignature = request.runtimeSignature;
      const baseHeight = this.base?.waterOverlay?.mode === "overlay" && cachedPlanningHeightmap(this.base.plan);
      this.worker.postMessage(
        previousRequestId === undefined
          ? request
          : {
              ...request,
              previousSnapshot: undefined,
              previousRequestId,
              previousHeightToken: baseHeight ? planningHeightToken(baseHeight) : undefined
            }
      );
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
  private fail(error: Error): void {
    this.releaseWorker();
    this.queued = null;
    this.active?.reject(error);
    this.active = null;
  }
  private releaseWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = false;
    this.generation++;
    this.baseRequestId = undefined;
    this.runtimeSignature = undefined;
    this.known = new WeakMap();
    this.base = undefined;
  }
  dispose(): void {
    this.invalidate();
    this.releaseWorker();
  }
}
