/** GUI and teaching-preview state that must never enter compiled river assets. */
import type { RiverAuthoringConfig } from "../authoring/river/RiverAuthoringTypes";

export interface RiverDebugConfig {
  queryT: number;
}

export type RiverDemoConfig = RiverAuthoringConfig & {
  debug: RiverDebugConfig;
};
