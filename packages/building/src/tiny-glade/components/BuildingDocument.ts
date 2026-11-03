import { applyBuildingSurfaces } from "./BuildingSurface";
import type {
  MainBuildingComponent,
  HouseComponent,
  WallDecorationComponent,
  BuildingSurfaceComponent,
  RoofDecorationComponent
} from "./BuildingComponents";
import { buildingWallCurve, constructionLocalShape } from "./BuildingShape";
import { defaultBuildingRoof } from "./BuildingConfiguration";
import type { ConstructionDecorationSpec } from "../runtime/ConstructionDecorations";
import type { MasonryDocument } from "../runtime/MasonryDocument";

/** Wall attachment and inverse binding must agree on the same wall tangent. */
function wallPlacement(
  building: MainBuildingComponent,
  attachment: WallDecorationComponent
): { u: number; tangent: readonly number[]; widthScale: number } {
  const curve = buildingWallCurve(building.shape);
  const { position, rotation, scale } = attachment.entity.transform;
  if (
    Math.abs(rotation.x) + Math.abs(rotation.y) + Math.abs(rotation.z) > 1e-5 ||
    ![position.x, position.y, position.z].every(Number.isFinite) ||
    ![scale.x, scale.y, scale.z].every((value) => Number.isFinite(value) && value > 0)
  )
    throw Error("Wall decorations require zero local rotation, finite position and finite positive scale");
  let best = Infinity,
    u = 0,
    tangent = [1, 0];
  for (let i = 0; i < curve.points.length - 1; i++) {
    const a = curve.points[i],
      b = curve.points[i + 1],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((position.x - a[0]) * dx + (position.z - a[1]) * dz) / (length * length)));
    const distance = Math.hypot(position.x - a[0] - t * dx, position.z - a[1] - t * dz);
    if (distance < best) {
      best = distance;
      u = curve.knots[i] + t * (curve.knots[i + 1] - curve.knots[i]);
      tangent = [dx / length, dz / length];
    }
  }
  if (best > 1e-4) throw Error("Decoration Entity position must lie on its building wall");
  // A diagonal local scale must preserve the mounted tangent. Otherwise it
  // rotates the window relative to the wall, outside the wall-mount contract.
  const [tx, tz] = tangent;
  // Equal horizontal scale is exact and independent of the sampled tangent.
  // Re-normalizing a unit tangent can otherwise turn 1 into 0.9999999999999999
  // and perturb the wall-opening tessellator despite an identity Entity scale.
  const widthScale = scale.x === scale.z ? scale.x : Math.hypot(tx * scale.x, tz * scale.z);
  if (Math.abs(tx * tz * (scale.x - scale.z)) > 1e-5 * widthScale)
    throw Error("Wall decoration scale must preserve its wall tangent; use equal horizontal scale on curved walls");
  return { u, tangent, widthScale };
}

/** Transient compiler input. Placement is read from Entity, never persisted here. */
export function buildingDocument(
  building: MainBuildingComponent,
  attachments: readonly WallDecorationComponent[],
  identity: (
    object: MainBuildingComponent | WallDecorationComponent | BuildingSurfaceComponent | RoofDecorationComponent
  ) => string,
  surfaces: readonly BuildingSurfaceComponent[] = [],
  roofDecorations: readonly RoofDecorationComponent[] = []
): MasonryDocument {
  const id = identity(building);
  const decorations: ConstructionDecorationSpec[] = attachments.map((attachment) => {
    const { u, widthScale } = wallPlacement(building, attachment);
    const { position, scale } = attachment.entity.transform;
    if (building.kind !== "house") throw Error("Wall decorations require a building host");
    return {
      id: identity(attachment),
      kind: attachment.kind,
      type: attachment.type,
      seed: attachment.seed,
      u,
      ...Object.fromEntries(
        (["woodColor", "frameMaterial", "lightIntensity", "lightColor"] as const).flatMap((key) =>
          attachment[key] == null ? [] : [[key, attachment[key]]]
        )
      ),
      bottom: position.y,
      width: attachment.width * widthScale,
      height: attachment.height * scale.y,
      rank: attachment.rank
    };
  });
  const house = building.kind === "house" ? (building as HouseComponent) : undefined;
  for (const attachment of roofDecorations) {
    if (!house) throw Error("Roof decorations require a HouseComponent host");
    requireRoofTransform(attachment);
    decorations.push({
      id: identity(attachment),
      kind: attachment.kind,
      type: attachment.type,
      host: "roof",
      uv: attachment.uv as [number, number],
      bottom: attachment.elevation,
      width: attachment.width,
      height: attachment.height,
      rank: attachment.rank,
      ...Object.fromEntries(
        (["woodColor", "frameMaterial", "lightIntensity", "lightColor"] as const).flatMap((key) =>
          attachment[key] == null ? [] : [[key, attachment[key]]]
        )
      )
    });
  }
  const foundation = house?.foundation,
    plaster = house?.plaster,
    floors = house?.floors;
  const document: MasonryDocument = {
    version: 1,
    placement: { position: [0, 0, 0], rotationY: 0 },
    construction: {
      version: 1,
      environment: { type: "host_terrain" },
      identity_order: [id],
      buildings: [
        {
          id,
          height: building.height,
          material: building.wallMaterial,
          seed: building.seed,
          wall_color: building.wallColor,
          wood_color: building.woodColor,
          ...(foundation ? { foundation } : {}),
          ...(plaster ? { plaster } : {}),
          ...(floors ? { floors } : {}),
          ...(building.kind !== "house" ? { kind: building.kind } : {}),
          ...constructionLocalShape(building.shape),
          roof: house ? house.roof : { ...defaultBuildingRoof(), height: 0 },
          decorations
        }
      ]
    },
    bindings: [
      {
        id: id + (building.kind === "house" ? "-roof" : "-surface"),
        geometry_id: id + (building.kind === "house" ? "-roof" : "-surface"),
        rule: {
          type:
            building.kind === "house" ? "overlap_rows" : building.kind === "wall" ? "staggered_rows" : "posts_and_rails"
        },
        unit_id: building.kind === "house" ? "roof_tile" : building.kind === "wall" ? "brick" : "wooden_plank",
        footprint: { width: 0.5, height: 0.4375, depth: 0.1 },
        seed: "source"
      },
      ...(house
        ? ["wall", ...(foundation ? ["foundation"] : [])].map((role) => ({
            id: id + "-" + role,
            geometry_id: id + "-" + role,
            rule: { type: "auto" as const },
            unit_id: "brick" as const,
            footprint: { width: 0.5, height: 0.4375, depth: 0.1 },
            seed: "source" as const
          }))
        : [])
    ],
    overrides: []
  };
  return surfaces.length ? applyBuildingSurfaces<BuildingSurfaceComponent>(document, id, surfaces, identity) : document;
}

/** Inverse bind from the compiler's building-space vertices to each attachment's local space.
 * Width/height scale is already consumed by the wall fitter; normal-axis scale is purely visual. */
export function buildingRigidBindings(
  building: MainBuildingComponent,
  attachments: readonly WallDecorationComponent[],
  identity: (object: MainBuildingComponent | WallDecorationComponent | RoofDecorationComponent) => string,
  roofDecorations: readonly RoofDecorationComponent[] = []
): ReadonlyMap<string, readonly number[]> {
  const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const bindings = new Map<string, readonly number[]>([[identity(building), identityMatrix]]);
  for (const attachment of attachments) {
    const { position: p, scale: s } = attachment.entity.transform;
    const {
      tangent: [tx, tz],
      widthScale
    } = wallPlacement(building, attachment);
    // Invert only the scale baked into the fitted opening. The normal-axis
    // scale remains visual, exactly as for the rectangular wall case.
    const k = 1 / widthScale - 1;
    const xx = 1 + k * tx * tx,
      xz = k * tx * tz,
      zz = 1 + k * tz * tz;
    bindings.set(identity(attachment), [
      xx,
      0,
      xz,
      0,
      0,
      1 / s.y,
      0,
      0,
      xz,
      0,
      zz,
      0,
      -xx * p.x - xz * p.z,
      -p.y / s.y,
      -xz * p.x - zz * p.z,
      1
    ]);
  }
  for (const attachment of roofDecorations) {
    requireRoofTransform(attachment);
    bindings.set(identity(attachment), identityMatrix);
  }
  return bindings;
}

function requireRoofTransform(attachment: RoofDecorationComponent): void {
  const { position: p, rotation: r, scale: s } = attachment.entity.transform;
  if ([p.x, p.y, p.z, r.x, r.y, r.z].some((v) => v !== 0) || [s.x, s.y, s.z].some((v) => v !== 1))
    throw Error("Roof decoration placement uses uv/elevation; its Entity local transform must be identity");
}
