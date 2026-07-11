/** GUI and teaching-preview state that must never enter compiled river assets. */
import type { RiverAuthoringConfig } from "../authoring/river/RiverAuthoringTypes";
import { RiverDebugMode, RiverPreviewStage } from "./debug/constants";

export interface RiverDebugConfig {
  previewStage: RiverPreviewStage;
  mode: RiverDebugMode;
  queryT: number;
}

export type RiverDemoConfig = RiverAuthoringConfig & {
  debug: RiverDebugConfig;
};
