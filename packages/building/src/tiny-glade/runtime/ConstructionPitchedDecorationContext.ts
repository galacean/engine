import type { ConstructionWallEnvelope } from "./ConstructionWallEnvelope";
import type { ConstructionUnitAssets } from "./ConstructionCompiler";
import { constructionRoof, type ConstructionBuilding } from "./ConstructionSource";
import { gothicHostSurface } from "./GothicHostSurface";
import { roofBasis } from "./ConstructionRoof";
import type { DecorationConvexOccupancy } from "./DecorationConvexOccupancy";

export const decorationTransformPoints = (
  points: readonly (readonly number[])[],
  position: number[],
  rotation: number[],
  scale: number[]
) => {
  const axes = roofBasis(rotation);
  return points.map((p) =>
    position.map(
      (v, i) => v + axes[0][i] * p[0] * scale[0] + axes[1][i] * p[1] * scale[1] + axes[2][i] * p[2] * scale[2]
    )
  );
};

/** Shared editing-time occupancy for all pitched-roof attachment families.
 * Only successful generators append; rejected edits never reserve space. */
export function createPitchedDecorationContext(
  building: ConstructionBuilding,
  baseY: number,
  envelope?: ConstructionWallEnvelope,
  assets?: ConstructionUnitAssets
) {
  const roof = constructionRoof(building, baseY, envelope),
    support = gothicHostSurface(roof.surface, roof.footprint);
  const occupied: { id: string; volumes: DecorationConvexOccupancy[] }[] = [];
  return { roof, support, occupied, assets };
}
export type PitchedDecorationContext = ReturnType<typeof createPitchedDecorationContext>;
