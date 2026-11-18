import type { ScreenSpaceReflectionConsumerReceiverMode } from "./ScreenSpaceReflection";

/** Non-overlapping GPU work scopes. Scene capture is shared by both receiver phases. */
export type ScreenSpaceReflectionStage =
  | "contribution-copy"
  | "contribution-depth-copy"
  | "contribution-color"
  | "contribution-depth"
  | "contribution-mipmap"
  | "scene-copy"
  | "scene-mipmap"
  | "surface"
  | "trace"
  | "filter-horizontal"
  | "filter-vertical"
  | "upsample"
  | "composite";

/** Optional instrumentation; callers own asynchronous timer queries and disjoint-result handling. */
export interface ScreenSpaceReflectionProfiler {
  beginSample(stage: ScreenSpaceReflectionStage, receiverMode: ScreenSpaceReflectionConsumerReceiverMode | null): void;
  endSample(): void;
}
