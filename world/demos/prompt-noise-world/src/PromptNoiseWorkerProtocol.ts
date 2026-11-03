import type { PromptNoisePlacementWindow } from "./PromptNoisePlacement.ts";
import type { PromptNoiseWaterWindow } from "./PromptNoiseRuntimeGeneration.ts";
import type { PromptNoiseWorldPlanV1 } from "./PromptNoiseWorldContract.ts";
import type { PromptNoiseSceneLayoutV1 } from "./PromptNoiseSceneLayout.ts";
import type { PromptNoiseWorldRecipe } from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";
import type { WaterSemanticFieldSnapshotV1 } from "@galacean/engine-water/water/runtime/index";
import type { PromptNoiseWaterLayoutAuditV1, PromptNoiseWaterLayoutCandidateV1 } from "./PromptNoiseWaterLayout.ts";

/** Placement generation request sent to the prompt-noise Worker. */
export interface PromptNoisePlacementWorkerRequest {
  readonly kind: "placement";
  readonly requestId: number;
  readonly plan: PromptNoiseWorldPlanV1;
  readonly centerChunk: readonly [x: number, z: number];
  readonly radius: number;
}

/** Water sampling request sent to the prompt-noise Worker. */
export interface PromptNoiseWaterWorkerRequest {
  readonly kind: "water";
  readonly requestId: number;
  readonly plan: PromptNoiseWorldPlanV1;
  readonly logicalCamera: readonly [x: number, z: number];
}

export interface PromptNoiseWaterLayoutWorkerRequest {
  readonly kind: "water-layout";
  readonly requestId: number;
  readonly semanticField: WaterSemanticFieldSnapshotV1;
  readonly candidates: readonly PromptNoiseWaterLayoutCandidateV1[];
}

/** Current PNW4 Recipe + Semantic Field scene-consumer request. */
export interface PromptNoiseSceneLayoutWorkerRequest {
  readonly kind: "scene-layout";
  readonly requestId: number;
  readonly recipe: PromptNoiseWorldRecipe;
  readonly semanticField: WaterSemanticFieldSnapshotV1;
}

/** All generation request variants understood by the prompt-noise Worker. */
export type PromptNoiseWorkerRequest =
  | PromptNoisePlacementWorkerRequest
  | PromptNoiseWaterWorkerRequest
  | PromptNoiseWaterLayoutWorkerRequest
  | PromptNoiseSceneLayoutWorkerRequest;

/** Successful placement generation response from the prompt-noise Worker. */
export interface PromptNoisePlacementWorkerResponse {
  readonly kind: "placement";
  readonly requestId: number;
  readonly generationMilliseconds: number;
  readonly window: PromptNoisePlacementWindow;
}

/** Successful water generation response from the prompt-noise Worker. */
export interface PromptNoiseWaterWorkerResponse {
  readonly kind: "water";
  readonly requestId: number;
  readonly generationMilliseconds: number;
  readonly window: PromptNoiseWaterWindow;
}

export interface PromptNoiseWaterLayoutWorkerResponse {
  readonly kind: "water-layout";
  readonly requestId: number;
  readonly generationMilliseconds: number;
  readonly audit: PromptNoiseWaterLayoutAuditV1;
}

export interface PromptNoiseSceneLayoutWorkerResponse {
  readonly kind: "scene-layout";
  readonly requestId: number;
  readonly generationMilliseconds: number;
  readonly layout: PromptNoiseSceneLayoutV1;
}

/** Failed generation response preserving the request identity. */
export interface PromptNoiseWorkerErrorResponse {
  readonly kind: "error";
  readonly requestId: number;
  readonly message: string;
}

/** All response variants emitted by the prompt-noise Worker. */
export type PromptNoiseWorkerResponse =
  | PromptNoisePlacementWorkerResponse
  | PromptNoiseWaterWorkerResponse
  | PromptNoiseWaterLayoutWorkerResponse
  | PromptNoiseSceneLayoutWorkerResponse
  | PromptNoiseWorkerErrorResponse;
