import type { PlannedDecorationAssembly } from "./DecorationAssemblyPlacement";
import { profiledDormerRoofReservation, type PlannedProfiledDormerRoof } from "./ProfiledDormerSupport";
import { requireDecorationCollision } from "./ConstructionDecorationCollisions";
import { planStoneHalfDormerSupport } from "./StoneHalfDormerSupport";
import { constructionEaveAttachment } from "./ConstructionEaveAttachment.ts";
import { constructionDecorationAssembly } from "./ConstructionDecorationAssembly.ts";
import { cottageXzProjectiveRotation } from "./RecoveredCottageRoofSampler.ts";
import { sampleWallArclength } from "./RecoveredWallSpace.ts";
import { sub, mul, type RoofCurve } from "./RecoveredRoofMath.ts";
import { roofBasis } from "./ConstructionRoof.ts";
import { decorationConvexOccupancy, decorationVolumesOverlap } from "./DecorationConvexOccupancy.ts";
import { decorationStoneBounds } from "./DecorationStoneBounds.ts";
import { decorationTransformPoints, type PitchedDecorationContext } from "./ConstructionPitchedDecorationContext.ts";
import type { DecorationSurfaceOwner } from "./DecorationSurfaceOwner";
import type {
  ResolvedConstructionDecorationSpec,
  CompiledConstructionDecorations,
  ConstructionDecorationStone
} from "./ConstructionDecorations.ts";
import type { PublishedWallProfile } from "./PublishedWallProfile.ts";
import type { WallConnectionShape } from "./WallConnectionTypes.ts";
import type { UnitPlacementBinding as MasonryBinding } from "./UnitPlacement";
import { unitFootprintScale } from "./MaterialFootprint.ts";

function box(min: readonly number[], max: readonly number[]) {
  return Array.from({ length: 8 }, (_, bits) => [0, 1, 2].map((i) => (bits & (1 << i) ? max[i] : min[i])));
}

/** Solve the shared wall/roof aperture, body and cap mounts, and exact installation
 * envelope. Registered algorithms generate the visible assembly and roof units. */
export function planConstructionStoneHalf(
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
): { mount: PlannedDecorationAssembly; roof: PlannedProfiledDormerRoof } | undefined {
  const reject = (code: "UNSUPPORTED_ATTACHMENT" | "INSUFFICIENT_SPACE", reason: string) => {
    result.diagnostics.push({ id: spec.id, code, reason });
    return undefined;
  };
  const { curve, pivotU, pivotY, scale, seed } = placement;
  const mountCurve = placement.mountCurve ?? curve;
  const mountPoint = sampleWallArclength(mountCurve, pivotU);
  const rank = spec.rank,
    arrow = spec.type === "dormer-arrow-slit-half";
  const ordinary = requireDecorationCollision(
    context.assets?.decorationCollisions,
    arrow ? `arrow_slit_1x${rank}_collision` : `window_gothic_${rank}x1_collision`
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
  if (pivotY + ordinary.min[1] * scale[1] >= eave.wallTop)
    return reject("INSUFFICIENT_SPACE", "The window is entirely above its supporting wall");
  if (shape.type === "circle" && mul(sub(ordinary.max[0], ordinary.min[0]), scale[0]) >= curve.length)
    return reject("INSUFFICIENT_SPACE", "Window collision span covers the entire closed wall");
  const blueprint = planStoneHalfDormerSupport(
    context.assets?.decorationCollisions,
    context.assets?.decorations,
    {
      id: spec.id,
      hostId: building.id,
      family: arrow ? "arrow" : "gothic",
      placement: {
        kind: "window",
        rank,
        curve: mountCurve,
        wallX: pivotU,
        pivotY,
        closed: true,
        circleRadius: shape.type === "circle" ? shape.radius : undefined,
        wooden: building.wallMaterial === 1,
        halfTimber: false,
        foundationHeight: 0,
        baseY: profile.minGround,
        bottomSamples: profile.bottom,
        wallMaxY: profile.maxY,
        wallSlot: slot,
        seed,
        sourceScale: scale
      },
      cachedTransform: {
        translation: [mountPoint[0], pivotY, mountPoint[1]],
        rotation: cottageXzProjectiveRotation([-eave.tangent[1], 0, eave.tangent[0]]),
        scale: [1, 1, 1]
      }
    },
    context.roof
  );
  const body = blueprint.bodyTransform;
  const volumes = [
    decorationConvexOccupancy(
      spec.id,
      decorationTransformPoints(box(ordinary.min, ordinary.max), body.translation, body.rotation, body.scale)
    )
  ];
  const stone: ConstructionDecorationStone = {
    id: building.id + "/" + spec.id + "/hat",
    decorationId: spec.id,
    ownerId: building.id,
    template: blueprint.hat.template,
    instance: blueprint.hat.instance,
    geometryScale: blueprint.hat.geometryScale as [number, number, number]
  };
  if (blueprint.hat.visible) {
    const bounds = decorationStoneBounds(context.assets?.stoneGeometry, stone);
    volumes.push(decorationConvexOccupancy(spec.id, box(bounds.min, bounds.max)));
  }
  const plannedRoof: PlannedProfiledDormerRoof = {
    decorationId: spec.id,
    support: blueprint.roof,
    placement: {
      id: "stone-half/" + blueprint.id,
      ...(building.variationKey !== undefined || spec.variationKey !== undefined
        ? {
            variationKey:
              "stone-half/" + JSON.stringify([building.variationKey ?? building.id, spec.variationKey ?? spec.id])
          }
        : {}),
      slot,
      unitScale: unitFootprintScale(binding?.footprint),
      seed: binding && binding.seed !== "source" ? BigInt(binding.seed) : undefined
    }
  };
  volumes.push(...profiledDormerRoofReservation(spec.id, plannedRoof.support, plannedRoof.placement).volumes);
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
  const assembly = constructionDecorationAssembly(context.assets?.decorations, spec.type!, rank)!;
  const transform = blueprint.bodyTransform;
  const axes = roofBasis(transform.rotation).map((axis, i) => axis.map((v) => v * transform.scale[i])) as [
    number[],
    number[],
    number[]
  ];
  result.windowCuts.push({ id: spec.id, cut: blueprint.windowCut });
  for (const hole of blueprint.wallHoles) result.holes.push({ ...hole, decorationId: spec.id });
  result.roofOpenings.push({ id: spec.id + "/0", raw48: blueprint.hole48.slice(), polygon: [] });
  context.occupied.push({ id: spec.id, volumes });
  return {
    mount: {
      decorationId: spec.id,
      mount: {
        origin: transform.translation,
        axes,
        stones: blueprint.hat.visible ? [stone] : [],
        chart: {
          kind: "wall-curve",
          points: curve.points.map((p) => [...p]),
          referenceU: spec.u!,
          minimumY: profile.minGround,
          height: profile.topY - profile.minGround
        }
      },
      placement: {
        building: { id: building.id, woodColor: building.woodColor },
        spec,
        assembly,
        kind: "window",
        frameAttributes: { ...blueprint.frameAttributes, seed, wallSlot: slot }
      }
    },
    roof: plannedRoof
  };
}
