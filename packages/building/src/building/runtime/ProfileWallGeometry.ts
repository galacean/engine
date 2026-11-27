import type { WallConnectionShape } from "./WallConnectionTypes";
import type { publishProfileWall, profileRoofGeometry } from "./ProfileGeometry";
import type { ConstructionWallEnvelope } from "./ConstructionWallEnvelope";
import type { unitFootprintScale } from "./MaterialFootprint";
/** Resolved wall support consumed by placement and visibility algorithms.
 * A roof here is a solved geometric constraint, never an author house recipe. */
export interface ProfileWallGeometry {
  id: string;
  variationKey?: string;
  height: number;
  slot: number;
  shape: WallConnectionShape;
  profile: ReturnType<typeof publishProfileWall>;
  wallEnvelope: ConstructionWallEnvelope;
  wallRoofJoint: ReturnType<typeof publishProfileWall>["wallRoofJoint"];
  wallSeed: bigint;
  unitScale: ReturnType<typeof unitFootprintScale>;
  roof: ReturnType<typeof profileRoofGeometry>;
}
