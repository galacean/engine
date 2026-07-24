/**
 * POSITION accessor minimum from the checked-in Rock 07 glTF.
 *
 * The scan is authored with its base at local Y ~= 0 rather than around its
 * origin. Placement must account for this bound instead of applying the
 * center-origin offset used by primitive fallback meshes.
 */
const ROCK_LOCAL_MIN_Y = -0.00190715491771698;
const ROCK_BED_SINK_DEPTH = 0.08;

export function resolveOceanCoastalRockGroundedY(
  bedHeight: number,
  scaleY: number
): number {
  if (!Number.isFinite(bedHeight)) {
    throw new Error("Ocean coastal rock bed height must be finite.");
  }
  if (!Number.isFinite(scaleY) || scaleY <= 0) {
    throw new Error("Ocean coastal rock Y scale must be finite and positive.");
  }
  return (
    bedHeight -
    ROCK_LOCAL_MIN_Y * scaleY -
    ROCK_BED_SINK_DEPTH
  );
}
