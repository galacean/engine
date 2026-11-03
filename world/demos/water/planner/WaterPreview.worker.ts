import {
  PlanningRasterTransfer,
  rasterPacketNumericBytes
} from "@galacean/engine-world-planning/semantic-study/PlanningRasterTransfer";
import { compileWaterPreview, createWaterPreviewDocument, type WaterPreviewDocument } from "./WaterPreviewPlan.ts";
import {
  planningHeightmap,
  planningHeightmapWork
} from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { planningAlphamap } from "@galacean/engine-world-planning/semantic-study/PlanningAlphamap";
import { compilePlanningOcean } from "@galacean/engine-world-planning/semantic-study/PlanningOceanSource";
import { assertPlanningRuntimeSignature } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import type { SemanticResult } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import type { WaterPreviewWorkerRequest } from "./WaterPreviewWorkerClient.ts";

// Keep the accepted baseline and newest candidate; neither is persisted as author data.
const rasters = new PlanningRasterTransfer();
const results = new Map<number, SemanticResult>();
self.onmessage = ({ data }: MessageEvent<WaterPreviewWorkerRequest>) => {
  try {
    assertPlanningRuntimeSignature(data.runtimeSignature);
    const progress = (text: string) => self.postMessage({ id: data.id, progress: text });
    progress("生成 Planner 地形与水体作者参数…");
    const document: WaterPreviewDocument = data.document ?? createWaterPreviewDocument(data.seed!, "all");
    const previous = data.previousId === undefined ? undefined : results.get(data.previousId);
    if (data.previousId !== undefined && !previous) throw new Error("预览规划基准已失效，请重新生成");
    const start = performance.now();
    progress("编译水域、全局道路与跨河连接…");
    const result = compileWaterPreview(document, previous);
    const layoutEnd = performance.now();
    progress("生成共同床面高度图…");
    const map = planningHeightmap(result.plan);
    const { sample, ...height } = map;
    const heightEnd = performance.now();
    progress("生成地形材质与海洋近岸数据…");
    const alpha = planningAlphamap(result.plan);
    const alphaEnd = performance.now();
    const ocean = compilePlanningOcean(result.plan);
    const oceanEnd = performance.now();
    for (const id of results.keys()) if (id !== data.previousId) results.delete(id);
    results.set(data.id, result);
    const raster = rasters.encode(data.id, { height, alpha, ocean }, data.previousId);
    // Patch only against the baseline named by the request; Worker retains original buffers.
    self.postMessage({
      id: data.id,
      document,
      result,
      raster,
      elapsedMs: performance.now() - start,
      timings: {
        rasterNumericBytes: rasterPacketNumericBytes(raster),
        rasterKind: raster.kind,
        layoutMs: layoutEnd - start,
        heightMs: heightEnd - layoutEnd,
        alphaMs: alphaEnd - heightEnd,
        oceanMs: oceanEnd - alphaEnd,
        heightWork: planningHeightmapWork(map)
      }
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
