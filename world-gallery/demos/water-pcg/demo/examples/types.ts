/**
 * Water PCG example contracts.
 *
 * Demo examples are authoring fixtures rather than rendering logic. Keeping ocean
 * and river-network config here keeps main.ts focused on scene orchestration while
 * allowing the gallery to switch between multiple stable water-system scenarios.
 */
import { WaterPreviewMode } from "./constants";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import type { WaterDecorationStyle } from "../decoration/constants";
import type { RiverDebugConfig } from "../types";
import type { OceanPreviewConfig } from "./ocean-preview/types";

export interface RiverExampleView {
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraTarget: readonly [number, number, number];
  readonly backgroundColor: readonly [number, number, number, number];
  readonly showWorldAxes?: boolean;
}

export interface RiverPcgExample {
  id: string;
  label: string;
  initialMode: WaterPreviewMode;
  decorationStyle: WaterDecorationStyle;
  view: RiverExampleView;
  riverDescriptor: RiverNetworkDescriptor;
  riverDebug: RiverDebugConfig;
}

export interface WaterPcgExample extends RiverPcgExample {
  ocean: OceanPreviewConfig;
}

export type OceanConfig = OceanPreviewConfig;
