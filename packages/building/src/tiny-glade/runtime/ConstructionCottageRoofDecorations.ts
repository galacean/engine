import {
  createPitchedDecorationContext,
  decorationTransformPoints,
  type PitchedDecorationContext
} from "./ConstructionPitchedDecorationContext.ts";
import type { DecorationSurfaceOwner } from "./DecorationSurfaceOwner";
import { cottageRoofInstallation } from "./ConstructionCottageRoofInstallation.ts";
import { constructionDecorationRecipe } from "./ConstructionDecorationRecipe.ts";
import { cottageDormerWidth } from "./RecoveredCottageDormerPlacement.ts";
import { cottageDormerCollisionPoints } from "./RecoveredCottageDormerCollision.ts";
import { RecoveredCottageRoofSampler } from "./RecoveredCottageRoofSampler.ts";
import { decorationConvexOccupancy, decorationVolumesOverlap } from "./DecorationConvexOccupancy.ts";
import { buildRoofContext } from "./RecoveredRoofContext.ts";
import { planCottageDormerSupport, type PlannedCottageDormerRoof } from "./CottageDormerSupport";
import { constructionDecorationAssembly } from "./ConstructionDecorationAssembly";
import { roofBasis } from "./ConstructionRoof";
import type { PlannedDecorationAssembly } from "./DecorationAssemblyPlacement";
import type { DecorationMountFrame } from "./DecorationMountGeometry";
import { unitFootprintScale } from "./MaterialFootprint.ts";
import { mul } from "./RecoveredRoofMath.ts";
import type { UnitPlacementBinding as MasonryBinding } from "./UnitPlacement";
import type { ResolvedConstructionDecorationSpec, CompiledConstructionDecorations } from "./ConstructionDecorations.ts";

/** One immutable compiler invocation owns the support, metric chart and occupancy.
 * No render-frame work, global cache, readback or author-state mutation. */
export function createCottageRoofDecorationPlanner(
  building: DecorationSurfaceOwner,
  slot: number,
  binding?: MasonryBinding,
  context: PitchedDecorationContext = createPitchedDecorationContext(building.roof)
) {
  const { roof, support, occupied } = context;
  const sampler = new RecoveredCottageRoofSampler(roof.surface, roof.footprint);
  let geometry: any;
  return (
    spec: ResolvedConstructionDecorationSpec,
    result: CompiledConstructionDecorations
  ): { mount: PlannedDecorationAssembly; roof: PlannedCottageDormerRoof } | undefined => {
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
    }
    const plan = planCottageDormerSupport(
      { id: spec.id, hostId: building.id, rank, transform, scale: [sx, sy] },
      { ...roof, renderSlot: slot }
    );
    const sourceAssembly = constructionDecorationAssembly(context.assets?.decorations, "dormer-cottage", rank)!;
    const partMounts: Record<string, DecorationMountFrame> = {};
    const assembly = {
      bounds: sourceAssembly.bounds,
      parts: plan.frames.flatMap((frame, i) => {
        const axes = roofBasis(frame.quaternion).map((axis, j) => axis.map((v) => v * frame.scale[j])) as [
          number[],
          number[],
          number[]
        ];
        return sourceAssembly.parts.map((source) => {
          const suffix = `${source.suffix}/${i}`;
          partMounts[suffix] = { origin: frame.position, axes };
          return { ...source, suffix };
        });
      })
    };
    const mainMount = Object.values(partMounts)[0];
    if (!mainMount) throw Error("Cottage dormer has no installation frames");
    for (const [i, raw48] of plan.holes48.entries())
      result.roofOpenings.push({ id: spec.id + "/" + i, raw48, polygon: [] });
    occupied.push({ id: spec.id, volumes: [volume] });
    return {
      mount: {
        decorationId: spec.id,
        mount: { ...mainMount, partMounts, stones: [], chart: { kind: "mesh", geometry } },
        placement: { building: { id: building.id, woodColor: building.woodColor }, spec, assembly, kind: "window" }
      },
      roof: {
        decorationId: spec.id,
        support: plan.roof,
        placement: {
          id: "cottage/" + plan.id,
          slot,
          ...(building.variationKey !== undefined || spec.variationKey !== undefined
            ? {
                variationKey:
                  "cottage/" + JSON.stringify([building.variationKey ?? building.id, spec.variationKey ?? spec.id])
              }
            : {}),
          unitScale: unitFootprintScale(binding?.footprint),
          seed: binding && binding.seed !== "source" ? BigInt(binding.seed) : undefined
        }
      }
    };
  };
}
