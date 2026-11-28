import defaults from "../../planning-data/wayfinding.json";
/** Road-journey generation policy. Measured visual coverage remains an independent goal. */
export interface WayfindingPolicy {
  keypointSpacingM: number;
  cueSpanM: number;
  /** Fraction of physical road length assigned local guidance zones; not a pixel ratio. */
  routeCoverage: number;
  targetCoverage: number;
  sBend: number;
  corridorWidthM: number;
  massWidthM: number;
  massDepthM: number;
  massHeightM: number;
  spacingM: number;
}
export type WayfindingPolicyInput = Partial<WayfindingPolicy>;
export const WAYFINDING_DEFAULTS: Readonly<WayfindingPolicy> = Object.freeze(defaults);
/** Resolve only current policy fields. Retired import values cannot become hidden generation controls. */
export function wayfindingPolicy(world?: WayfindingPolicyInput, local?: WayfindingPolicyInput): WayfindingPolicy {
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof WayfindingPolicy)[])
    result[key] = local?.[key] ?? world?.[key] ?? defaults[key];
  return result;
}
