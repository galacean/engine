/** Demo-only normalization that keeps preview state out of authoring/compiler data. */
import { normalizeRiverConfig } from "../authoring/river/RiverSchemaDecoder";
import type { RiverDemoConfig } from "./types";

export function normalizeRiverDemoConfig(config: RiverDemoConfig): RiverDemoConfig {
  const authoring = normalizeRiverConfig(config);
  return {
    ...authoring,
    debug: {
      ...config.debug,
      queryT: Math.min(1, Math.max(0, config.debug.queryT))
    }
  };
}
