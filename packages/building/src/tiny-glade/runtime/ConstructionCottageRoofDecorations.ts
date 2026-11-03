import {
  createPitchedDecorationContext,
  decorationTransformPoints,
  type PitchedDecorationContext
} from "./ConstructionPitchedDecorationContext";
import { type ConstructionBuilding } from "./ConstructionSource";
import { cottageRoofInstallation } from "./ConstructionCottageRoofInstallation";
import { constructionDecorationRecipe } from "./ConstructionDecorationRecipe";
import { cottageDormerWidth } from "./RecoveredCottageDormerPlacement";
import { cottageDormerCollisionPoints } from "./RecoveredCottageDormerCollision";
import { RecoveredCottageRoofSampler } from "./RecoveredCottageRoofSampler";
import { decorationConvexOccupancy, decorationVolumesOverlap } from "./DecorationConvexOccupancy";
import { buildRoofContext } from "./RecoveredRoofContext";
import { cottageDormerGeometry } from "./ConstructionCottageDormer";
import { SurfaceProjector } from "./SurfaceProjector.js";
import { unitFootprintScale } from "./MaterialFootprint";
import { mul } from "./RecoveredRoofMath";
import type { MasonryBinding } from "./MasonryDocument";
import type { ResolvedConstructionDecorationSpec, CompiledConstructionDecorations } from "./ConstructionDecorations";

/** One immutable compiler invocation owns the support, metric chart and occupancy.
 * No render-frame work, global cache, readback or author-state mutation. */
export function createCottageRoofDecorationCompiler(
  building: ConstructionBuilding,
  baseY: number,
  slot: number,
  binding?: MasonryBinding,
  context: PitchedDecorationContext = createPitchedDecorationContext(building, baseY)
) {
  const { roof, support, occupied } = context;
  const sampler = new RecoveredCottageRoofSampler(roof.surface, roof.footprint);
  let geometry: any, projector: SurfaceProjector | undefined;
  return (spec: ResolvedConstructionDecorationSpec, result: CompiledConstructionDecorations) => {
    const installation = cottageRoofInstallation(
      context.assets?.decorations,
      spec,
      roof.surface,
      roof.footprint,
      support
    );
    if (!installation.ok) {
      result.diagnostics.push({ id: spec.id, code: installation.code, reason: installation.reason });
      return;
    }
    const rank = spec.rank,
      recipe = constructionDecorationRecipe(context.assets?.decorations, "dormer-cottage", rank)!;
    const sx = spec.width / recipe.installationSize[0],
      sy = spec.height / recipe.installationSize[1];
    const transform = installation.attachment.transform;
    const local = cottageDormerCollisionPoints(
      transform,
      rank,
      sampler,
      mul(cottageDormerWidth(rank), sx),
      sy,
      mul(0.2, sx)
    );
    const volume = decorationConvexOccupancy(
      spec.id,
      decorationTransformPoints(local, transform.position, transform.quaternion, transform.scale)
    );
    const overlapping = occupied.filter((p) => p.volumes.some((other) => decorationVolumesOverlap(volume, other)));
    if (overlapping.length) {
      result.diagnostics.push({
        id: spec.id,
        code: "OVERLAP",
        reason: "Dormer installation intersects an existing roof attachment",
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
      projector = new SurfaceProjector(geometry);
    }
    const produced = cottageDormerGeometry(
      context.assets?.decorations,
      building,
      spec,
      {
        ...roof,
        renderSlot: slot,
        tileScale: unitFootprintScale(binding?.footprint),
        tileSeed: binding && binding.seed !== "source" ? BigInt(binding.seed) : undefined
      },
      transform,
      geometry,
      projector
    );
    // All validation and generation finish before any related outputs publish.
    for (const part of produced.parts) result.parts.push(part);
    for (const unit of produced.roofUnits) result.roofUnits.push({ ...unit, decorationId: spec.id });
    for (const opening of produced.roofOpenings) result.roofOpenings.push(opening);
    occupied.push({ id: spec.id, volumes: [volume] });
  };
}
