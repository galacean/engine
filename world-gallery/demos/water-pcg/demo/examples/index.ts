/**
 * Water PCG example registry.
 *
 * Add new gallery cases here instead of growing main.ts. The render entry reads
 * this registry to build the top case switcher and clone the selected authoring
 * config into mutable runtime state.
 */
import { curvedMainRiverExample } from "./river/curvedMainRiver";
import { multiTributaryRiverExample } from "./river/multiTributaryRiver";
import { riverExpandedLakeExample } from "./lake/riverExpandedLake";
import { indoorReflectivePoolExample } from "./pool/indoorReflectivePool";
import {
  curvedMainRiverOceanPreview,
  indoorReflectivePoolOceanPreview,
  multiTributaryOceanPreview,
  riverExpandedLakeOceanPreview
} from "./ocean-preview/presets";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { OceanConfig, WaterPcgExample } from "./types";

export const waterPcgExamples: readonly WaterPcgExample[] = [
  { ...curvedMainRiverExample, ocean: curvedMainRiverOceanPreview },
  { ...multiTributaryRiverExample, ocean: multiTributaryOceanPreview },
  { ...riverExpandedLakeExample, ocean: riverExpandedLakeOceanPreview },
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
