import { gothicRoofInstallation } from "./ConstructionGothicRoofInstallation";
import { gothicBlueprint, gothicRoofFrameAttributes } from "./GothicBlueprint";
import { gothicRoofProfiles } from "./GothicRoofTiles";
import { constructionDecorationAssembly } from "./ConstructionDecorationAssembly";
import { decorationTransformPoints, type PitchedDecorationContext } from "./ConstructionPitchedDecorationContext";
import {
  decorationTriangleOccupancy,
  decorationVolumesOverlap,
  type DecorationConvexOccupancy
} from "./DecorationConvexOccupancy";
import { roofBasis } from "./ConstructionRoof";
import { buildRoofContext } from "./RecoveredRoofContext";
import { unitFootprintScale } from "./MaterialFootprint";
import { profiledDormerRoofReservation, type PlannedProfiledDormerRoof } from "./ProfiledDormerSupport";
import { add, sub, mul } from "./RecoveredRoofMath";
import type { DecorationSurfaceOwner } from "./DecorationSurfaceOwner";
import type { PlannedDecorationAssembly } from "./DecorationAssemblyPlacement";
import type { ResolvedConstructionDecorationSpec, CompiledConstructionDecorations } from "./ConstructionDecorations";
import type { UnitPlacementBinding } from "./UnitPlacement";

/** Solve the installation, exact occupied envelope, window mount and arch
 * sections. Mesh/material records and roof units belong to registered placement. */
export function createGothicRoofDecorationPlanner(
  building: DecorationSurfaceOwner,
  slot: number,
  binding: UnitPlacementBinding | undefined,
  context: PitchedDecorationContext
) {
  const { roof, support, occupied } = context;
  let geometry: any;
  return (
    spec: ResolvedConstructionDecorationSpec,
    result: CompiledConstructionDecorations
  ): { mount: PlannedDecorationAssembly; roof: PlannedProfiledDormerRoof } | undefined => {
    const rank = spec.rank,
      asset = context.assets?.gothic[rank],
      collider = asset?.geometry?.collision;
    if (!collider) throw Error("Missing Gothic collision geometry in construction library: " + rank);
    const bounds = asset!.collisionBounds;
    const installation = gothicRoofInstallation(
      context.assets?.decorations,
      spec,
      roof.surface,
      roof.footprint,
      bounds,
      support
    );
    if (!installation.ok) {
      result.diagnostics.push({ id: spec.id, code: installation.code, reason: installation.reason });
      return;
    }
    const t = installation.attachment.transform;
    const transform = { translation: t.position, rotation: t.quaternion, scale: installation.scale };
    const blueprint = gothicBlueprint(
      {
        id: spec.id,
        hostId: building.id,
        rank,
        seed: building.seed ?? 0,
        colorId: spec.woodColor ?? building.woodColor ?? 0
      },
      transform,
      bounds,
      slot
    );
    // The aperture keeps its original unit-size coefficients while explicit
    // resizing follows the solved body scale.
    const hole = blueprint.hole48.slice(),
      view = new DataView(hole.buffer);
    const [sx, sy] = installation.scale;
    if (sx !== 1) view.setFloat32(16, mul(view.getFloat32(16, true), sx), true);
    if (sy !== 1) {
      view.setFloat32(4, add(t.position[1], mul(sub(view.getFloat32(4, true), t.position[1]), sy)), true);
      view.setFloat32(20, mul(view.getFloat32(20, true), sy), true);
    }
    const planned: PlannedProfiledDormerRoof = {
      decorationId: spec.id,
      support: {
        profiles: gothicRoofProfiles(rank, transform),
        transform,
        surface: roof.surface,
        footprint: roof.footprint
      },
      placement: {
        id: "gothic/" + spec.id,
        slot,
        ...(spec.variationKey !== undefined ? { variationKey: "gothic/" + spec.variationKey } : {}),
        unitScale: unitFootprintScale(binding?.footprint),
        seed: binding && binding.seed !== "source" ? BigInt(binding.seed) : undefined
      }
    };
    const reservation = profiledDormerRoofReservation(spec.id, planned.support, planned.placement);
    if (!reservation.intersects) {
      result.diagnostics.push({
        id: spec.id,
        code: "INSUFFICIENT_SPACE",
        reason: "Gothic roof does not intersect its host roof"
      });
      return;
    }
    // Keep the authored open/nonconvex collider as separate triangle surfaces.
    const points = decorationTransformPoints(collider.positions, t.position, t.quaternion, installation.scale);
    const volumes: DecorationConvexOccupancy[] = [];
    for (let i = 0; i < collider.indices.length; i += 3) {
      const triangle = decorationTriangleOccupancy(
        spec.id,
        collider.indices.slice(i, i + 3).map((index) => points[index])
      );
      if (triangle) volumes.push(triangle);
    }
    volumes.push(...reservation.volumes);
    const overlapping = occupied.filter((p) =>
      p.volumes.some((a) => volumes.some((b) => decorationVolumesOverlap(a, b)))
    );
    if (overlapping.length) {
      result.diagnostics.push({
        id: spec.id,
        code: "OVERLAP",
        reason: "Gothic installation intersects an existing roof attachment",
        relatedIds: overlapping.map((p) => p.id)
      });
      return;
    }
    if (!geometry) {
      geometry = buildRoofContext(
        { id: building.id, ...roof, renderSlot: slot },
        { preparedSupport: support }
      ).geometry;
      geometry.id = binding?.geometry_id ?? building.id + "-roof";
    }
    const assembly = constructionDecorationAssembly(context.assets?.decorations, "dormer-gothic", rank)!;
    const axes = roofBasis(t.quaternion).map((axis, i) => axis.map((v) => v * installation.scale[i])) as [
      number[],
      number[],
      number[]
    ];
    result.roofOpenings.push({ id: spec.id + "/0", raw48: hole, polygon: [] });
    occupied.push({ id: spec.id, volumes });
    return {
      mount: {
        decorationId: spec.id,
        mount: { origin: t.position, axes, stones: [], chart: { kind: "mesh", geometry } },
        placement: {
          building: { id: building.id, woodColor: building.woodColor },
          spec,
          assembly,
          kind: "window",
          frameAttributes: {
            ...gothicRoofFrameAttributes(rank, installation.attachment.meshUV[0], installation.scale[0], false),
            seed: building.seed ?? 0,
            wallSlot: slot
          }
        }
      },
      roof: planned
    };
  };
}
