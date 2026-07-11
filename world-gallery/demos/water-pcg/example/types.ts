/**
 * Water PCG example contracts.
 *
 * Demo examples are authoring fixtures rather than rendering logic. Keeping ocean
 * and river-network config here keeps main.ts focused on scene orchestration while
 * allowing the gallery to switch between multiple stable water-system scenarios.
 */
import { WaterPreviewMode } from "./constants";
import type { RiverNetworkDescriptor } from "../authoring/river/RiverDescriptor";
import type { RiverDebugConfig } from "../demo/types";

export interface OceanConfig {
  size: number;
  resolution: number;
  waterLevel: number;
  waveAmplitude: number;
  waveLength: number;
  waveSpeed: number;
  alpha: number;
  foamIntensity: number;
  oceanColor: string;
}

export interface WaterPcgExample {
  id: string;
  label: string;
  initialMode: WaterPreviewMode;
  ocean: OceanConfig;
  riverDescriptor: RiverNetworkDescriptor;
  riverDebug: RiverDebugConfig;
}
