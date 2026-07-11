/**
 * Water PCG example registry.
 *
 * Add new gallery cases here instead of growing main.ts. The render entry reads
 * this registry to build the top case switcher and clone the selected authoring
 * config into mutable runtime state.
 */
import { curvedMainRiverExample } from "./river/curvedMainRiver";
import { multiTributaryRiverExample } from "./river/multiTributaryRiver";
import { curvedMainRiverOceanPreview, multiTributaryOceanPreview } from "./ocean-preview/presets";
import { OceanConfig, WaterPcgExample } from "./types";

export const waterPcgExamples: readonly WaterPcgExample[] = [
  { ...curvedMainRiverExample, ocean: curvedMainRiverOceanPreview },
  { ...multiTributaryRiverExample, ocean: multiTributaryOceanPreview }
];

export function cloneOceanConfig(config: OceanConfig): OceanConfig {
  return { ...config };
}

export type { OceanConfig, WaterPcgExample };
