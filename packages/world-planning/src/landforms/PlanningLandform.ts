import { PLANNING_REFERENCE } from "../planning-data/PlanningReference";
import { buildLandform, type LandformKind } from "./Landforms";
import { planningAtomCatalog } from "./InteractiveLandforms";
import { DEFAULT_LANDFORM_METRICS } from "./LandformMetrics";
/** Fixed authoring conditions, shared by planning generation and metric whitebox. */
export const PLANNING_CAMERA_METRICS = { verticalFovDegrees: 60, eyeHeightM: DEFAULT_LANDFORM_METRICS.eyeHeightM };
export const LANDFORM_TYPES = { canyon: "峡谷", cliff: "断崖", plateau: "台地", peaks: "峰群", pass: "山口" } as const;
const policy = PLANNING_REFERENCE.landformViews;
/** Generate a repeatable semantic composition. Randomness alters shape variation, never pacing scale.
 * Heights derive from internal reference-view geometry; actual scene occlusion is not claimed here.
 * @param request Type, deterministic seed and variation amplitude in [0,1].
 * @returns Existing atlas-compatible OBB composition plus reference measurements.
 */
export function generatePlanningLandform(request: { type: LandformKind; seed: number; variation: number }) {
  if (!Number.isFinite(request.seed) || !Number.isFinite(request.variation)) throw new Error("地貌参数必须为有限数值");
  const p = policy[request.type],
    referenceHeightM = PLANNING_CAMERA_METRICS.eyeHeightM + p.distanceM * Math.tan((p.topAngleDegrees * Math.PI) / 180);
  const metrics = {
    ...DEFAULT_LANDFORM_METRICS,
    referenceHeightM,
    heightVariation: DEFAULT_LANDFORM_METRICS.heightVariation * Math.max(0, Math.min(1, request.variation))
  };
  const form = buildLandform(request.type, metrics, planningAtomCatalog(), {
    seed: request.seed,
    amount: request.variation
  });
  return {
    form,
    diagnostics: {
      strategyVersion: 1,
      referenceDistanceM: p.distanceM,
      referenceTopAngleDegrees: p.topAngleDegrees,
      referenceHeightM,
      referenceFovDegrees: PLANNING_CAMERA_METRICS.verticalFovDegrees,
      walkSeconds: form.walkSeconds,
      detailPitchM: form.detailPitchM
    }
  };
}
