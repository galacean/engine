import { f32, type RoofSurface, type RoofFootprint } from "./RecoveredRoofMath";
import { isFlatRoofHeight } from "./RoofMode";
import type { WallConnectionShape } from "./WallConnectionTypes";
import type { ProfileFootprint, ProfileRoofParameters, ProfileFoundationParameters } from "./ProfileParameters";
import { constructionWallOutlinePoint, type ConstructionWallEnvelope } from "./ConstructionWallEnvelope";
import { constructionWallRoofJoint, wallRoofJointHeight } from "./ConstructionWallRoofJoint";
import { resolveConstructionFoundation } from "./ConstructionFoundation";
import { publishWallProfile, type TerrainHeight } from "./PublishedWallProfile";

/** Bake an authored horizontal node frame into a profile support. Native scene
 * collection and offline planning use the same arithmetic/order. */
export function transformProfileFootprint(input: ProfileFootprint, m: ArrayLike<number>): ProfileFootprint {
  const shape = input.rectangle ?? input.circle;
  if (!shape) return {};
  const [x, z] = shape.center;
  const center = [m[0] * x + m[8] * z + m[12], m[2] * x + m[10] * z + m[14]];
  const turn = Math.atan2(m[2], m[0]);
  return input.rectangle
    ? { rectangle: { ...input.rectangle, center, rotation: input.rectangle.rotation + turn } }
    : { circle: { ...input.circle!, center, phase: input.circle!.phase + turn } };
}

export function profileShape(b: ProfileFootprint): WallConnectionShape {
  if (b.circle)
    return {
      type: "circle",
      center: b.circle.center as [number, number],
      radius: b.circle.radius,
      phase: b.circle.phase
    };
  const r = b.rectangle!;
  return {
    type: "rectangle",
    center: r.center as [number, number],
    orientation: [f32(Math.cos(r.rotation)), f32(Math.sin(r.rotation))],
    width: r.size[0],
    depth: r.size[1]
  };
}
export function profileRoofGeometry(
  s: WallConnectionShape,
  r: ProfileRoofParameters,
  baseHeight: number,
  wallOutset?: number
): { surface: RoofSurface; footprint: RoofFootprint } {
  return {
    surface: {
      type: s.type === "circle" ? "native_circular_roof_profile" : "native_rectangular_roof_profile",
      tip_offset: r.tip,
      profile: r.profile,
      height_parameter: r.height,
      ridge_parameter: r.ridge_length,
      eave_parameter: r.eave,
      axis: r.ridge_direction,
      edge_mode: isFlatRoofHeight(r.height) ? r.flat_rim : 0,
      base_height: baseHeight,
      ...(wallOutset !== undefined && s.type === "rectangle" && !isFlatRoofHeight(r.height) && r.ridge_length === 1
        ? { wall_outset: wallOutset }
        : {})
    },
    footprint:
      s.type === "circle"
        ? { center: s.center, radius: s.radius, phase: s.phase }
        : { center: s.center, orientation: s.orientation, width: s.width, depth: s.depth }
  };
}

/** Wall support geometry. Roof and foundation are optional geometric constraints,
 * supplied by resolved relations; no house, author document or renderer is required. */
export function publishProfileWall(
  input: {
    shape: WallConnectionShape;
    height: number;
    foundation?: ProfileFoundationParameters;
    roof?: ProfileRoofParameters;
  },
  terrain: TerrainHeight,
  host: boolean,
  envelope: ConstructionWallEnvelope
) {
  const shape = input.shape;
  const foundationContact = input.foundation
    ? resolveConstructionFoundation({ shape, terrain, height: input.foundation.height, hostTerrain: host })
    : undefined;
  const elevated = (input.foundation?.height ?? 0) > 0;
  const top = elevated ? foundationContact?.topY : undefined;
  const profile = publishWallProfile(
    shape,
    input.height,
    top === undefined ? terrain : (x, z) => Math.max(top, terrain(x, z)),
    {
      hostTerrain: host,
      material: 0,
      roof: !input.roof
        ? undefined
        : {
            profile: input.roof.profile,
            height_parameter: input.roof.height,
            ridge_parameter: input.roof.ridge_length,
            eave_parameter: input.roof.eave,
            axis: input.roof.ridge_direction
          }
    }
  );
  if (input.roof && isFlatRoofHeight(input.roof.height)) {
    // Native flat deck is at roof base - .69. Keep its descriptor origin intact;
    // the shell ends at the deck and explicit perimeter units own the parapet.
    profile.top = profile.top.map(() => profile.topY - 0.69);
    profile.maxY = profile.maxYGable = Math.max(...profile.top);
  }
  const roof = input.roof ? profileRoofGeometry(shape, input.roof, profile.topY, envelope.finishOuter) : undefined;
  const wallRoofJoint = roof ? constructionWallRoofJoint(roof.surface, roof.footprint) : undefined;
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
