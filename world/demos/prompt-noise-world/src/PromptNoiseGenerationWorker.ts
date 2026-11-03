/// <reference lib="webworker" />

import { TerrainAnalyticFieldProvider } from "./PromptNoiseField.ts";
import { generatePromptNoisePlacementWindow } from "./PromptNoisePlacement.ts";
import { generatePromptNoiseWaterWindow } from "./PromptNoiseRuntimeGeneration.ts";
import type { PromptNoiseWorkerRequest, PromptNoiseWorkerResponse } from "./PromptNoiseWorkerProtocol.ts";
import { auditPromptNoiseWaterLayout } from "./PromptNoiseWaterLayout.ts";
import { compilePromptNoiseSceneLayout } from "./PromptNoiseSceneLayout.ts";
import { PromptNoiseTerrainProgram } from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<PromptNoiseWorkerRequest>): void => {
  const request = event.data;
  try {
    const startedAt = performance.now();
    if (request.kind === "placement") {
      const field = new TerrainAnalyticFieldProvider(request.plan);
      const window = generatePromptNoisePlacementWindow(request.plan, field, request.centerChunk, request.radius);
      workerScope.postMessage({
        kind: "placement",
        requestId: request.requestId,
        generationMilliseconds: performance.now() - startedAt,
        window
      } satisfies PromptNoiseWorkerResponse);
      return;
    }
    if (request.kind === "water-layout") {
      workerScope.postMessage({
        kind: "water-layout",
        requestId: request.requestId,
        generationMilliseconds: performance.now() - startedAt,
        audit: auditPromptNoiseWaterLayout(request.semanticField, request.candidates)
      } satisfies PromptNoiseWorkerResponse);
      return;
    }
    if (request.kind === "scene-layout") {
      workerScope.postMessage({
        kind: "scene-layout",
        requestId: request.requestId,
        generationMilliseconds: performance.now() - startedAt,
        layout: compilePromptNoiseSceneLayout(new PromptNoiseTerrainProgram(request.recipe), request.semanticField)
      } satisfies PromptNoiseWorkerResponse);
      return;
    }
    const window = generatePromptNoiseWaterWindow(request.plan, request.logicalCamera);
    workerScope.postMessage({
      kind: "water",
      requestId: request.requestId,
      generationMilliseconds: performance.now() - startedAt,
      window
    } satisfies PromptNoiseWorkerResponse, [
      window.wetTexelIndices.buffer,
      window.surfaceHeights.buffer,
      window.bedHeights.buffer,
      window.flowVectorsXZ.buffer
    ]);
  } catch (error) {
    workerScope.postMessage({
      kind: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.stack ?? error.message : String(error)
    } satisfies PromptNoiseWorkerResponse);
  }
};

export {};
