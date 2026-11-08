import { RoofCurve, type RoofSurface, type RoofFootprint } from "./RecoveredRoofMath";
import type { GothicTransform } from "./GothicBlueprint";
import type { UnitFootprintScale } from "./MaterialFootprint";
import { gothicRoofTilesFromProfiles, visitGothicRoofLayout } from "./GothicRoofTiles";
import { decorationConvexOccupancy } from "./DecorationConvexOccupancy";
import { decorationTransformPoints } from "./ConstructionPitchedDecorationContext";

/** Two authored arch sections projected toward their resolved host roof. The
 * control points describe the small roof before any unit subdivision. */
export interface ProfiledDormerRoofSupport {
  profiles: [number[][], number[][]];
  transform: GothicTransform;
  surface: RoofSurface;
  footprint: RoofFootprint;
}
export interface ProfiledDormerRoofPlacement {
  id: string;
  variationKey?: string;
  slot: number;
  unitScale: UnitFootprintScale;
  seed?: bigint;
}
export interface PlannedProfiledDormerRoof {
  decorationId: string;
  support: ProfiledDormerRoofSupport;
  placement: ProfiledDormerRoofPlacement;
}
const unitBox = Array.from({ length: 8 }, (_, bits) => [0, 1, 2].map((i) => (bits & (1 << i) ? 0.5 : -0.5)));
function curves(support: ProfiledDormerRoofSupport): [RoofCurve, RoofCurve] {
  return support.profiles.map((points) => new RoofCurve(points)) as [RoofCurve, RoofCurve];
}
/** Preserve the existing exact strip-box reservation policy. Its envelope
 * depends on the target footprint, jitter and overlap, so design evaluates the
 * numerical layout but stores only occupancy, never render units or bytes. */
export function profiledDormerRoofReservation(
  id: string,
  support: ProfiledDormerRoofSupport,
  params: ProfiledDormerRoofPlacement
) {
  const volumes: ReturnType<typeof decorationConvexOccupancy>[] = [];
  const intersects = visitGothicRoofLayout(
    curves(support),
    support.transform,
    support.surface,
    support.footprint,
    params.unitScale,
    params.seed,
    (sample) =>
      volumes.push(
        decorationConvexOccupancy(
          id,
          decorationTransformPoints(unitBox, sample.position, sample.rotation, sample.scale)
        )
      )
  );
  return { intersects, volumes };
}
/** Actual numerical placement and packing happen only when the registered
 * course algorithm executes. Design never retains this output as a shortcut. */
export function placeProfiledDormerCourses(support: ProfiledDormerRoofSupport, params: ProfiledDormerRoofPlacement) {
  return gothicRoofTilesFromProfiles(
    params.id,
    curves(support),
    support.transform,
    support.surface,
    support.footprint,
    params.slot,
    params.unitScale,
    params.seed
  );
}
