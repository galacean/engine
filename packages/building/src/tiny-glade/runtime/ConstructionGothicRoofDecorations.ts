import { gothicRoofInstallation } from "./ConstructionGothicRoofInstallation";
import { constructionDecorationFrame } from "./ConstructionDecorationFrames";
import { gothicBlueprint, gothicRoofFrameAttributes } from "./GothicBlueprint";
import { gothicRoofTiles } from "./GothicRoofTiles";
import { constructionDecorationAssembly } from "./ConstructionDecorationAssembly";
import { decorationAssemblyGeometry } from "./ConstructionDecorationGeometry";
import { decorationTransformPoints, type PitchedDecorationContext } from "./ConstructionPitchedDecorationContext";
import {
  decorationTriangleOccupancy,
  decorationConvexOccupancy,
  decorationVolumesOverlap,
  type DecorationConvexOccupancy
} from "./DecorationConvexOccupancy";
import { roofBasis, roofBytes } from "./ConstructionRoof";
import { buildRoofContext } from "./RecoveredRoofContext";
import { SurfaceProjector } from "./SurfaceProjector.js";
import { unitFootprintScale } from "./MaterialFootprint";
import { add, sub, mul } from "./RecoveredRoofMath";
import type { ConstructionBuilding } from "./ConstructionSource";
import type { ResolvedConstructionDecorationSpec, CompiledConstructionDecorations } from "./ConstructionDecorations";
import type { MasonryBinding } from "./MasonryDocument";

const unitBox = Array.from({ length: 8 }, (_, bits) => [0, 1, 2].map((i) => (bits & (1 << i) ? 0.5 : -0.5)));

/** Public full-Gothic adapter. Body, aperture and roof publish atomically after
 * geometric validation. Source model UVs and host editing UVs remain separate.
 */
export function createGothicRoofDecorationCompiler(
  building: ConstructionBuilding,
  slot: number,
  binding: MasonryBinding | undefined,
  context: PitchedDecorationContext
) {
  const { roof, support, occupied } = context;
  let projector: SurfaceProjector | undefined;
  return (spec: ResolvedConstructionDecorationSpec, result: CompiledConstructionDecorations) => {
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
        colorId: spec.woodColor ?? building.wood_color ?? 0
      },
      transform,
      bounds,
      slot
    );
    // Native unit-size Hole48 intentionally ignores transform.scale. Our public
    // resizing extension must apply the same dimensions as body/profile, while
    // preserving original unit-size bytes and normalized aperture coefficients.
    const hole = blueprint.hole48.slice(),
      view = new DataView(hole.buffer);
    const [sx, sy] = installation.scale;
    if (sx !== 1) view.setFloat32(16, mul(view.getFloat32(16, true), sx), true);
    if (sy !== 1) {
      view.setFloat32(4, add(t.position[1], mul(sub(view.getFloat32(4, true), t.position[1]), sy)), true);
      view.setFloat32(20, mul(view.getFloat32(20, true), sy), true);
    }
    const tiles = gothicRoofTiles(
      spec.id,
      rank,
      transform,
      roof.surface,
      roof.footprint,
      slot,
      unitFootprintScale(binding?.footprint),
      binding && binding.seed !== "source" ? BigInt(binding.seed) : undefined
    );
    if (!tiles.length) {
      result.diagnostics.push({
        id: spec.id,
        code: "INSUFFICIENT_SPACE",
        reason: "Gothic roof does not intersect its host roof"
      });
      return;
    }
    // The authored collider is a nonconvex/open triangle surface. Do not turn
    // it into a convex hull. Strip boxes reserve the generated small roof;
    // that envelope is editor policy, not a native physics equivalence claim.
    const points = decorationTransformPoints(collider.positions, t.position, t.quaternion, installation.scale);
    const volumes: DecorationConvexOccupancy[] = [];
    for (let i = 0; i < collider.indices.length; i += 3) {
      const triangle = decorationTriangleOccupancy(
        spec.id,
        collider.indices.slice(i, i + 3).map((index) => points[index])
      );
      if (triangle) volumes.push(triangle);
    }
    for (const tile of tiles)
      volumes.push(
        decorationConvexOccupancy(spec.id, decorationTransformPoints(unitBox, tile.position, tile.rotation, tile.scale))
      );
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
    if (!projector) {
      const geometry = buildRoofContext(
        { id: building.id, ...roof, renderSlot: slot },
        { preparedSupport: support }
      ).geometry;
      geometry.id = binding?.geometry_id ?? building.id + "-roof";
      projector = new SurfaceProjector(geometry);
    }
    const assembly = constructionDecorationAssembly(context.assets?.decorations, "dormer-gothic", rank)!;
    const axes = roofBasis(t.quaternion).map((axis, i) => axis.map((v) => v * installation.scale[i])) as [
      number[],
      number[],
      number[]
    ];
    const frames = spec.frameMaterial === "wall" ? assembly.parts.filter((p) => p.binding.role === "frame") : [];
    const selectedAssembly = { ...assembly, parts: assembly.parts.filter((p) => !frames.includes(p)) };
    const parts = decorationAssemblyGeometry(building, spec, selectedAssembly, "window", {
      origin: t.position,
      axes,
      editUV: (_source, world) => (projector!.anchor(world) as [number[], unknown])[0].slice()
    });
    for (const frame of frames)
      result.frames.push(
        constructionDecorationFrame({
          id: building.id + "/" + spec.id + "/" + frame.suffix,
          ownerId: building.id,
          decorationId: spec.id,
          mesh: frame.name,
          binding: frame.binding,
          origin: t.position,
          axes,
          ...gothicRoofFrameAttributes(rank, installation.attachment.meshUV[0], installation.scale[0], false),
          seed: building.seed ?? 0,
          wallSlot: slot
        })
      );
    for (const part of parts) result.parts.push(part);
    result.roofOpenings.push({ id: spec.id + "/0", raw48: hole, polygon: [] });
    for (const tile of tiles)
      result.roofUnits.push({
        id: "gothic/" + tile.id,
        decorationId: spec.id,
        position: tile.position,
        rotation: tile.rotation,
        scale: tile.scale,
        initial64: roofBytes(tile.initial64_hex)
      });
    occupied.push({ id: spec.id, volumes });
  };
}
