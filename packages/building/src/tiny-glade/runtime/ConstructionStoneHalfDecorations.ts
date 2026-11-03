import { constructionDecorationFrame } from "./ConstructionDecorationFrames";
import { requireDecorationCollision } from "./ConstructionDecorationCollisions";
import { generateStoneHalfDormer } from "./StoneHalfDormerGenerator";
import { constructionEaveAttachment } from "./ConstructionEaveAttachment";
import { constructionDecorationAssembly } from "./ConstructionDecorationAssembly";
import { decorationAssemblyGeometry } from "./ConstructionDecorationGeometry";
import { cottageXzProjectiveRotation } from "./RecoveredCottageRoofSampler";
import { closestWallCurveCoordinate, sampleWallArclength } from "./RecoveredWallSpace";
import { sub, mul, type RoofCurve } from "./RecoveredRoofMath";
import { roofBytes, roofBasis } from "./ConstructionRoof";
import { decorationConvexOccupancy, decorationVolumesOverlap } from "./DecorationConvexOccupancy";
import { decorationStoneBounds } from "./DecorationStoneBounds";
import { decorationTransformPoints, type PitchedDecorationContext } from "./ConstructionPitchedDecorationContext";
import type { ConstructionBuilding } from "./ConstructionSource";
import type {
  ResolvedConstructionDecorationSpec,
  CompiledConstructionDecorations,
  ConstructionDecorationStone
} from "./ConstructionDecorations";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import type { WallConnectionShape } from "./WallConnectionTypes";
import type { MasonryBinding } from "./MasonryDocument";
import { unitFootprintScale } from "./MaterialFootprint";

function box(min: readonly number[], max: readonly number[]) {
  return Array.from({ length: 8 }, (_, bits) => [0, 1, 2].map((i) => (bits & (1 << i) ? max[i] : min[i])));
}

/** Original stone half-dormer bodies, warped stone cap and roof strips form one
 * publication. Installation envelopes are editor policy, not native physics. */
export function compileConstructionStoneHalf(
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
  const blueprint = generateStoneHalfDormer(
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
        wooden: building.material === 1,
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
    {
      ...context.roof,
      tileScale: unitFootprintScale(binding?.footprint),
      tileSeed: binding && binding.seed !== "source" ? BigInt(binding.seed) : undefined
    }
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
  const assembly = constructionDecorationAssembly(context.assets?.decorations, spec.type!, rank)!;
  const transform = blueprint.bodyTransform;
  const parts = assembly.parts.flatMap((source) => {
    const axes = roofBasis(transform.rotation).map((axis, i) => axis.map((v) => v * transform.scale[i])) as [
      number[],
      number[],
      number[]
    ];
    if (spec.frameMaterial === "wall" && source.binding.role === "frame") {
      result.frames.push(
        constructionDecorationFrame({
          id: building.id + "/" + spec.id + "/" + source.suffix,
          ownerId: building.id,
          decorationId: spec.id,
          mesh: source.name,
          binding: source.binding,
          origin: transform.translation,
          axes,
          ...blueprint.frameAttributes,
          seed,
          wallSlot: slot
        })
      );
      return [];
    }
    return decorationAssemblyGeometry(building, spec, { bounds: assembly.bounds, parts: [source] }, "window", {
      origin: transform.translation,
      axes,
      editUV: (_source, world) => {
        const u = closestWallCurveCoordinate(curve, [world[0], world[2]]);
        let wallU = curve.knots[u.index] * (1 - u.t) + curve.knots[u.index + 1] * u.t;
        wallU += Math.round(spec.u! - wallU);
        return [wallU, (world[1] - profile.minGround) / Math.max(0.01, profile.topY - profile.minGround)];
      }
    });
  });
  result.parts.push(...parts);
  result.windowCuts.push({ id: spec.id, cut: blueprint.windowCut });
  if (blueprint.hat.visible) result.stones.push(stone);
  for (const hole of blueprint.wallHoles) result.holes.push({ ...hole, decorationId: spec.id });
  result.roofOpenings.push({ id: spec.id + "/0", raw48: blueprint.hole48.slice(), polygon: [] });
  for (const strip of blueprint.strips)
    result.roofUnits.push({
      id: "stone-half/" + strip.id,
      decorationId: spec.id,
      position: strip.position.slice(),
      rotation: strip.rotation.slice(),
      scale: strip.scale.slice(),
      initial64: roofBytes(strip.initial64_hex)
    });
  context.occupied.push({ id: spec.id, volumes });
  return true;
}
