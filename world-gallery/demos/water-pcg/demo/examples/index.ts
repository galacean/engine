/**
 * Water PCG example registry.
 *
 * Add new gallery cases here instead of growing main.ts. The render entry reads
 * this registry to build the top case switcher and clone the selected authoring
 * config into mutable runtime state.
 */
import { showcaseRiverExample } from "./river/showcaseRiver";
import { multiTributaryRiverExample } from "./river/multiTributaryRiver";
import { indoorReflectivePoolExample } from "./pool/indoorReflectivePool";
import {
  indoorReflectivePoolOceanPreview,
  multiTributaryOceanPreview,
  showcaseOceanPreview
} from "./ocean-preview/presets";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { OceanConfig, WaterPcgExample } from "./types";

export const waterPcgExamples: readonly WaterPcgExample[] = [
  { ...showcaseRiverExample, ocean: showcaseOceanPreview },
  { ...multiTributaryRiverExample, ocean: multiTributaryOceanPreview },
  { ...indoorReflectivePoolExample, ocean: indoorReflectivePoolOceanPreview }
];

export function cloneOceanConfig(config: OceanConfig): OceanConfig {
  return {
    ...config,
    waveAsset:
      config.waveAsset.model === WaterWaveModel.DirectionalGerstner
        ? { ...config.waveAsset, generator: { ...config.waveAsset.generator } }
        : { ...config.waveAsset }
  };
}

export type { OceanConfig, WaterPcgExample };
