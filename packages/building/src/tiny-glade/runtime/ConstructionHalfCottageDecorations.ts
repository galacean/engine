import { requireDecorationCollision } from "./ConstructionDecorationCollisions";
import { decorationMeshBounds } from "./ConstructionDecorationMeshes";
import { generateCottageHalfDormer } from "./CottageHalfDormerGenerator";
import { cottageHalfDormerGeometry } from "./ConstructionCottageHalfDormer";
import { constructionEaveAttachment } from "./ConstructionEaveAttachment";
import { cottageXzProjectiveRotation } from "./RecoveredCottageRoofSampler";
import { closestWallCurveCoordinate, sampleWallArclength } from "./RecoveredWallSpace";
import { sub, mul, type RoofCurve } from "./RecoveredRoofMath";
import { decorationConvexOccupancy, decorationVolumesOverlap } from "./DecorationConvexOccupancy";
import { decorationTransformPoints, type PitchedDecorationContext } from "./ConstructionPitchedDecorationContext";
import type { ConstructionBuilding } from "./ConstructionSource";
import type { ResolvedConstructionDecorationSpec, CompiledConstructionDecorations } from "./ConstructionDecorations";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import type { WallConnectionShape } from "./WallConnectionTypes";
import type { MasonryBinding } from "./MasonryDocument";
import { unitFootprintScale } from "./MaterialFootprint";
import { isFlatRoofHeight } from "./RoofMode";

function box(min: readonly number[], max: readonly number[]) {
  return Array.from({ length: 8 }, (_, bits) => [0, 1, 2].map((i) => (bits & (1 << i) ? max[i] : min[i])));
}

/** Caller already validates wall corners, removed walls and wall attachments.
 * This producer validates the additional eave/roof domain, then publishes all
 * bodies/cuts/tiles atomically. SAT installation envelopes are editor policy;
 * they do not claim to reproduce the native physics/cache backend.
 */
export function compileConstructionHalfCottage(
  building: ConstructionBuilding,
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
): boolean {
  const reject = (code: "UNSUPPORTED_ATTACHMENT" | "INSUFFICIENT_SPACE", reason: string) => {
    result.diagnostics.push({ id: spec.id, code, reason });
    return false;
  };
  if (isFlatRoofHeight(building.roof.height))
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
  const blueprint = generateCottageHalfDormer(
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
      renderSlot: slot,
      tileScale: unitFootprintScale(binding?.footprint),
      tileSeed: binding && binding.seed !== "source" ? BigInt(binding.seed) : undefined
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
  // Small roof strips have independent oriented installation envelopes. Keeping
  // them separate avoids filling the empty volume below the entire sloped roof.
  for (const strip of blueprint.strips)
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
    return false;
  }
  const produced = cottageHalfDormerGeometry(
    context.assets?.decorations,
    building,
    spec,
    blueprint,
    (_source, world) => {
      const u = closestWallCurveCoordinate(curve, [world[0], world[2]]);
      let wallU = curve.knots[u.index] * (1 - u.t) + curve.knots[u.index + 1] * u.t;
      wallU += Math.round(spec.u! - wallU);
      return [wallU, (world[1] - profile.minGround) / Math.max(0.01, profile.topY - profile.minGround)];
    }
  );
  for (const part of produced.parts) result.parts.push(part);
  result.windowCuts.push({ id: spec.id, cut: blueprint.windowCut });
  for (const hole of produced.holes) result.holes.push({ ...hole, decorationId: spec.id });
  for (const hole of produced.roofOpenings) result.roofOpenings.push(hole);
  for (const unit of produced.roofUnits) result.roofUnits.push({ ...unit, decorationId: spec.id });
  context.occupied.push({ id: spec.id, volumes });
  return true;
}
