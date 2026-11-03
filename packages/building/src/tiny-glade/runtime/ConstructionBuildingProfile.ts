import {
  constructionWallEnvelope,
  constructionWallOutlinePoint,
  type ConstructionWallEnvelope
} from "./ConstructionWallEnvelope";
import { constructionWallRoofJoint, wallRoofJointHeight } from "./ConstructionWallRoofJoint";
import { resolveConstructionFoundation } from "./ConstructionFoundation";
import { isFlatRoofHeight } from "./RoofMode";
import { constructionShape, constructionRoof, type ConstructionBuilding } from "./ConstructionSource";
import { publishWallProfile, type TerrainHeight } from "./PublishedWallProfile";
/** One support owner shared by near meshes, distance meshes, collision and decoration anchors. */
export function constructionBuildingProfile(
  b: ConstructionBuilding,
  terrain: TerrainHeight,
  host = true,
  envelope: ConstructionWallEnvelope = constructionWallEnvelope(b)
) {
  const shape = constructionShape(b);
  const foundationContact = b.foundation
    ? resolveConstructionFoundation({ shape, terrain, height: b.foundation.height, hostTerrain: host })
    : undefined;
  const elevated = (b.foundation?.height ?? 0) > 0;
  const top = elevated ? foundationContact?.topY : undefined;
  const profile = publishWallProfile(
    shape,
    b.height,
    top === undefined ? terrain : (x, z) => Math.max(top, terrain(x, z)),
    {
      hostTerrain: host,
      material: 0,
      roof: b.kind
        ? undefined
        : {
            profile: b.roof.profile,
            height_parameter: b.roof.height,
            ridge_parameter: b.roof.ridge_length,
            eave_parameter: b.roof.eave,
            axis: b.roof.ridge_direction
          }
    }
  );
  if (!b.kind && isFlatRoofHeight(b.roof.height)) {
    // Native flat deck is at roof base - .69. Keep its descriptor origin intact;
    // the shell ends at the deck and explicit perimeter units own the parapet.
    profile.top = profile.top.map(() => profile.topY - 0.69);
    profile.maxY = profile.maxYGable = Math.max(...profile.top);
  }
  const roof = constructionRoof(b, profile.topY, envelope);
  const wallRoofJoint = b.kind ? undefined : constructionWallRoofJoint(roof.surface, roof.footprint);
  if (wallRoofJoint) {
    // Decoration fitting, wall placement and the render envelope all consume
    // this construction-owned contour. The recovered stone .46m extension is
    // not a supported region of a host roof that covers the full wall thickness.
    profile.top = profile.points.map((p) => {
      const face = constructionWallOutlinePoint(shape, p, envelope.nominalOuter);
      return wallRoofJointHeight(wallRoofJoint, face[0], face[2]);
    });
    profile.maxYGable = Math.max(...wallRoofJoint.heights);
  }
  return { ...profile, foundationContact, wallRoofJoint };
}
