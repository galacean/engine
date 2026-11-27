import reference from "./reference-profile.json";

/** Active, serializable metre reference. No runtime setters: a new profile requires regeneration.
 * Unity measurements will replace reference data, not seeded composition algorithms.
 */
export const PLANNING_REFERENCE = reference;

/** Resolve the existing house distribution using stable random samples in [0,1].
 * Dimensions remain independent of runtime walking/running state.
 */
export function referenceBuildingSize(
  villageSizeM: number,
  widthSample: number,
  depthSample: number,
  heightSample: number,
  profile = PLANNING_REFERENCE
) {
  const b = profile.building;
  const width =
    Math.min(b.maxBaseWidthM, villageSizeM * b.widthPerVillageSize) *
    (b.widthFactor.min + widthSample * b.widthFactor.span);
  return {
    width,
    depth: width * (b.depthPerWidth.min + depthSample * b.depthPerWidth.span),
    height: b.heightM.min + heightSample * b.heightM.span
  };
}

/** Fail fast on malformed reference edits instead of silently generating NaN geometry. */
export function validatePlanningReference(profile: typeof reference): void {
  const walk = (value: unknown, path: string) => {
    if (typeof value === "number" && (!Number.isFinite(value) || (value < 0 && !/\.peak[ZX]$/.test(path))))
      throw new Error(`Invalid reference: ${path}`);
    if (value && typeof value === "object") for (const [key, v] of Object.entries(value)) walk(v, `${path}.${key}`);
  };
  walk(profile, "reference");
  if (
    profile.units !== "metres" ||
    profile.actor.heightM <= 2 * profile.actor.radiusM ||
    profile.actor.walkMps <= 0 ||
    profile.actor.runMps <= 0 ||
    profile.actor.eyeHeightM >= profile.actor.heightM ||
    profile.courtyard.marginStepM <= 0 ||
    profile.courtyard.fenceSegmentM <= 0 ||
    profile.building.maxBaseWidthM <= 0 ||
    profile.world.roadWidthM < profile.traversal.minWidth
  )
    throw new Error("Invalid planning scale reference");
}
validatePlanningReference(PLANNING_REFERENCE);
