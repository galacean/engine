import {
  PlanningRasterTransfer,
  type PlanningRasterPacket
} from "@galacean/engine-world-planning/semantic-study/PlanningRasterTransfer";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { planningRuntimeSignature } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import { adoptPlanningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { adoptPlanningAlphamap } from "@galacean/engine-world-planning/semantic-study/PlanningAlphamap";
import { adoptPlanningOcean } from "@galacean/engine-world-planning/semantic-study/PlanningOceanSource";
import type { SemanticResult } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import type { WaterPreviewDocument } from "./WaterPreviewPlan.ts";

export interface WaterPreviewWorkerRequest {
  id: number;
  runtimeSignature: string;
  seed?: number;
  document?: WaterPreviewDocument;
  previousId?: number;
}
export interface WaterPreviewProgress {
  id: number;
  progress: string;
}
interface Response {
  id: number;
  error?: string;
  document: WaterPreviewDocument;
  result: SemanticResult;
  raster: PlanningRasterPacket;
  elapsedMs: number;
  timings?: { rasterNumericBytes: number; rasterKind: string };
}

/** Preview host only; compilation, raster adoption and Session edits use Planner contracts. */
export class WaterPreviewWorkerClient {
  private worker?: Worker;
  private rasters = new PlanningRasterTransfer();
  private sequence = 0;
  private disposed = false;
  private known = new WeakMap<SemanticResult, number>();
  private pending = new Map<number, { resolve: (response: Response) => void; reject: (error: Error) => void }>();
  elapsedMs = 0;
  transferStats?: Response["timings"];
  onProgress?: (text: string) => void;

  constructor(
    private readonly createWorker = () =>
      new Worker(new URL("./WaterPreview.worker.ts", import.meta.url), { type: "module" })
  ) {}

  private request(input: Omit<WaterPreviewWorkerRequest, "id" | "runtimeSignature">): Promise<Response> {
    if (this.disposed) return Promise.reject(new Error("预览后台线程已销毁"));
    if (!this.worker) {
      const worker = (this.worker = this.createWorker());
      worker.onmessage = ({ data }: MessageEvent<Response | WaterPreviewProgress>) => {
        const task = this.pending.get(data.id);
        if (!task) return;
        if ("progress" in data) {
          this.onProgress?.(data.progress);
          return;
        }
        this.pending.delete(data.id);
        if (data.error) {
          task.reject(new Error(data.error));
          return;
        }
        try {
          const raster = this.rasters.decode(data.id, data.raster);
          adoptPlanningHeightmap(data.result.plan, raster.height);
          adoptPlanningAlphamap(data.result.plan, raster.alpha);
          if (raster.ocean) adoptPlanningOcean(data.result.plan, raster.ocean);
          this.known.set(data.result, data.id);
          this.elapsedMs = data.elapsedMs;
          this.transferStats = data.timings;
          task.resolve(data);
        } catch (error) {
          task.reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      worker.onerror = (event) => this.dispose(new Error(event.message || "预览后台生成失败"));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker!.postMessage({ ...input, id, runtimeSignature: planningRuntimeSignature() });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async createSession(seed: number): Promise<PlanningSession> {
    const initial = await this.request({ seed });
    let first = true;
    const session = new PlanningSession(
      exportPlanningRecipe(initial.document),
      async (document, previous) => {
        if (first) {
          first = false;
          return initial.result;
        }
        const previousId = previous && this.known.get(previous);
        if (previous && previousId === undefined) throw new Error("预览规划基准不属于当前后台线程");
        return (await this.request({ document, previousId })).result;
      },
      initial.document,
      { history: true }
    );
    await session.initialize();
    return session;
  }

  dispose(error = new Error("预览后台生成已取消")): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker?.terminate();
    this.worker = undefined;
    for (const task of this.pending.values()) task.reject(error);
    this.pending.clear();
    this.rasters.clear();
  }
}
