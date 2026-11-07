import { sampleCottageDormerCourses, type PlannedCottageDormerRoof } from "./CottageDormerSupport";
import { constructionDecorationAssembly } from "./ConstructionDecorationAssembly";
import type { PlannedDecorationAssembly } from "./DecorationAssemblyPlacement";
import type { DecorationMountFrame } from "./DecorationMountGeometry";
import { DecorationMaterial } from "./ConstructionDecorationMaterial";
import { roofBasis } from "./ConstructionRoof";
import { requireDecorationCollision } from "./ConstructionDecorationCollisions";
import { decorationMesh, decorationMeshBounds } from "./ConstructionDecorationMeshes";
import { planCottageHalfDormerSupport } from "./CottageHalfDormerSupport";
import { constructionEaveAttachment } from "./ConstructionEaveAttachment.ts";
import { cottageXzProjectiveRotation } from "./RecoveredCottageRoofSampler.ts";
import { sampleWallArclength } from "./RecoveredWallSpace.ts";
import { sub, mul, type RoofCurve } from "./RecoveredRoofMath.ts";
import { decorationConvexOccupancy, decorationVolumesOverlap } from "./DecorationConvexOccupancy.ts";
import { decorationTransformPoints, type PitchedDecorationContext } from "./ConstructionPitchedDecorationContext.ts";
import type { DecorationSurfaceOwner } from "./DecorationSurfaceOwner";
import type { ResolvedConstructionDecorationSpec, CompiledConstructionDecorations } from "./ConstructionDecorations.ts";
import type { PublishedWallProfile } from "./PublishedWallProfile.ts";
import type { WallConnectionShape } from "./WallConnectionTypes.ts";
import type { UnitPlacementBinding as MasonryBinding } from "./UnitPlacement";
import { unitFootprintScale } from "./MaterialFootprint.ts";
import { isFlatRoofHeight } from "./RoofMode.ts";

function box(min: readonly number[], max: readonly number[]) {
  return Array.from({ length: 8 }, (_, bits) => [0, 1, 2].map((i) => (bits & (1 << i) ? max[i] : min[i])));
}

/** Caller already validates wall corners, removed walls and wall attachments.
 * This planner resolves the additional eave/roof domain, mounts and apertures. SAT installation envelopes are editor policy;
 * they do not claim to reproduce the native physics/cache backend.
 */
export function planConstructionHalfCottage(
  building: DecorationSurfaceOwner,
  shape: WallConnectionShape,
  profile: PublishedWallProfile,
  spec: ResolvedConstructionDecorationSpec,
  placement: {
    curve: RoofCurve;
    mountCurve?: RoofCurve;
    pivotU: number;
    pivotY: number;
    scale: [number, number, number];
    seed: number;
  },
  context: PitchedDecorationContext,
  slot: number,
  binding: MasonryBinding | undefined,
  result: CompiledConstructionDecorations
): { mount: PlannedDecorationAssembly; roof: PlannedCottageDormerRoof } | undefined {
  const reject = (code: "UNSUPPORTED_ATTACHMENT" | "INSUFFICIENT_SPACE", reason: string) => {
    result.diagnostics.push({ id: spec.id, code, reason });
    return undefined;
  };
  if (isFlatRoofHeight(building.roof.surface.height_parameter))
    return reject("UNSUPPORTED_ATTACHMENT", "An eave window requires a pitched roof");
  const { curve, pivotU, pivotY, scale, seed } = placement,
    rank = spec.rank;
  const mountCurve = placement.mountCurve ?? curve;
  const mountPoint = sampleWallArclength(mountCurve, pivotU);
  const ordinary = requireDecorationCollision(
    context.assets?.decorationCollisions,
    `window_cottage_${rank}x1_collision`
  );
  const eave = constructionEaveAttachment(
    building,
    shape,
    profile,
    curve,
    context.roof.footprint,
    pivotU,
    pivotY,
    mul(ordinary.min[1], scale[1]),
    mul(ordinary.max[1], scale[1])
  );
  if (!eave.ok) return reject("UNSUPPORTED_ATTACHMENT", eave.reason);
  const { point, tangent, wallTop } = eave;
  const half = requireDecorationCollision(
    context.assets?.decorationCollisions,
    `window_cottage_${rank}x1_halfdormer_collision`
  );
  if (pivotY + half.min[1] * scale[1] >= wallTop)
    return reject("INSUFFICIENT_SPACE", "The window is entirely above its supporting wall");
  const collisionWidth = mul(sub(half.max[0], half.min[0]), scale[0]);
  if (shape.type === "circle" && collisionWidth >= curve.length)
    return reject("INSUFFICIENT_SPACE", "Window collision span covers the entire closed wall");
  const rise = sub(mul(sub(half.max[1], half.min[1]), mul(scale[1], 0.5)), sub(profile.maxY, pivotY));
  if (!(rise > 0)) return reject("INSUFFICIENT_SPACE", "The half-dormer roof cannot rise above the host eave");
  const blueprint = planCottageHalfDormerSupport(
    context.assets?.decorationCollisions,
    {
      id: spec.id,
      hostId: building.id,
      rank,
      wallX: pivotU,
      pivotY,
      seed,
      scale,
      cachedTransform: {
        position: [mountPoint[0], pivotY, mountPoint[1]],
        quaternion: cottageXzProjectiveRotation([-tangent[1], 0, tangent[0]]),
        scale: [1, 1, 1]
      }
    },
    {
      wall: shape.type === "rectangle" ? { kind: "rectangle" } : { kind: "circle", curve: mountCurve },
      wallMaxY: profile.maxY,
      // Project support/column height is already in profile.bottom; it is not the
      // native separate stone-foundation cover on a wooden wall.
      foundationTransitionY: undefined,
      ...context.roof,
      renderSlot: slot
    }
  );
  const volumes = [
    decorationConvexOccupancy(
      spec.id,
      decorationTransformPoints(
        box(half.min, half.max),
        blueprint.placements.body.position,
        blueprint.placements.body.quaternion,
        blueprint.placements.body.scale
      )
    )
  ];
  for (const shutter of blueprint.shutters) {
    const bounds = decorationMeshBounds(context.assets?.decorations, shutter.mesh);
    volumes.push(
      decorationConvexOccupancy(
        spec.id,
        decorationTransformPoints(
          box(bounds.min, bounds.max),
          shutter.transform.position,
          shutter.transform.quaternion,
          shutter.transform.scale
        )
      )
    );
  }
  const plannedRoof: PlannedCottageDormerRoof = {
    decorationId: spec.id,
    support: blueprint.roof,
    placement: {
      id: "cottage-half/" + blueprint.id,
      ...(building.variationKey !== undefined || spec.variationKey !== undefined
        ? {
            variationKey:
              "cottage-half/" + JSON.stringify([building.variationKey ?? building.id, spec.variationKey ?? spec.id])
          }
        : {}),
      slot,
      unitScale: unitFootprintScale(binding?.footprint),
      seed: binding && binding.seed !== "source" ? BigInt(binding.seed) : undefined
    }
  };
  // Exact numerical strip bounds preserve gaps under the sloped surface. This
  // sampling produces no mesh/material or packed instance data and is not saved.
  for (const strip of sampleCottageDormerCourses(plannedRoof.support, plannedRoof.placement))
    volumes.push(
      decorationConvexOccupancy(
        spec.id,
        decorationTransformPoints(box([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]), strip.position, strip.rotation, strip.scale)
      )
    );
  const overlaps = context.occupied.filter((p) =>
    p.volumes.some((a) => volumes.some((b) => decorationVolumesOverlap(a, b)))
  );
  if (overlaps.length) {
    result.diagnostics.push({
      id: spec.id,
      code: "OVERLAP",
      reason: "Eave-window installation intersects an existing roof attachment",
      relatedIds: overlaps.map((p) => p.id)
    });
    return;
  }
  const sourceAssembly = constructionDecorationAssembly(context.assets?.decorations, "dormer-cottage-half", rank)!;
  const partMounts: Record<string, DecorationMountFrame> = {};
  const mountFrame = (transform: {
    position: number[];
    quaternion: number[];
    scale: number[];
  }): DecorationMountFrame => ({
    origin: transform.position,
    axes: roofBasis(transform.quaternion).map((axis, i) => axis.map((v) => v * transform.scale[i])) as [
      number[],
      number[],
      number[]
    ]
  });
  const assembly = {
    bounds: sourceAssembly.bounds,
    parts: [
      ...sourceAssembly.parts.map((source) => {
        partMounts[source.suffix] = mountFrame(
          source.binding.role === "glass" ? blueprint.placements.glass : blueprint.placements.body
        );
        return source;
      }),
      ...blueprint.shutters.map((shutter) => {
        const suffix = `shutter/${shutter.side}`;
        partMounts[suffix] = mountFrame(shutter.transform);
        return {
          name: shutter.mesh,
          suffix,
          mesh: decorationMesh(context.assets?.decorations, shutter.mesh),
          material: DecorationMaterial.frame,
          binding: { role: "body" as const }
        };
      })
    ]
  };
  result.windowCuts.push({ id: spec.id, cut: blueprint.windowCut });
  for (const hole of blueprint.wallHoles) result.holes.push({ ...hole, decorationId: spec.id });
  blueprint.holes48.forEach((raw48, i) =>
    result.roofOpenings.push({ id: spec.id + "/" + i, raw48: raw48.slice(), polygon: [] })
  );
  context.occupied.push({ id: spec.id, volumes });
  return {
    mount: {
      decorationId: spec.id,
      mount: {
        ...mountFrame(blueprint.placements.body),
        partMounts,
        stones: [],
        chart: {
          kind: "wall-curve",
          points: curve.points.map((p) => [...p]),
          referenceU: spec.u!,
          minimumY: profile.minGround,
          height: profile.topY - profile.minGround
        }
      },
      placement: { building: { id: building.id, woodColor: building.woodColor }, spec, assembly, kind: "window" }
    },
    roof: plannedRoof
  };
}
