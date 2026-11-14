import { PLANNING_REFERENCE } from "../planning-data/PlanningReference";
/** Internal authoring metrics. Distances are metres and durations are pure movement seconds.
 * These are engine-side study defaults, not user-facing semantic sliders.
 */
export interface LandformMetrics {
  walkSpeedMps: number;
  runSpeedMps: number;
  playerHeightM: number;
  eyeHeightM: number;
  atomExposureSeconds: number;
  referenceHeightM: number;
  heightVariation: number;
  canyonSeconds: [number, number, number];
  cliffSeconds: number;
  plateauSeconds: number;
  peaksSeconds: number;
  passSeconds: number;
  maxAtoms: number;
}
/** Speeds are user-specified. All durations and heights remain adjustable study defaults. */
export const DEFAULT_LANDFORM_METRICS: LandformMetrics = {
  ...PLANNING_REFERENCE.landform,
  canyonSeconds: [...PLANNING_REFERENCE.landform.canyonSeconds] as [number, number, number],
  walkSpeedMps: PLANNING_REFERENCE.actor.walkMps,
  runSpeedMps: PLANNING_REFERENCE.actor.runMps,
  playerHeightM: PLANNING_REFERENCE.actor.heightM,
  eyeHeightM: PLANNING_REFERENCE.actor.eyeHeightM
};
