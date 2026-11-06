/** Pure semantic wall connection pipeline. The group order is explicit author
 * identity order, independent of native hash-table iteration and render slots. */
import { publishLevelWallProfile } from "./PublishedWallProfile";
import type { TerrainHeight, publishWallProfile } from "./PublishedWallProfile";
import { add, sub, mul, f32 } from "./RecoveredRoofMath";
import { IDENTITY_UNIT_SCALE, type UnitFootprintScale } from "./MaterialFootprint";
import {
  expandedConnectionShape,
  circleRectangleCrossings,
  circleCircleCrossings,
  rectangleRectangleCrossings,
  candidatesAtCrossings
} from "./RecoveredWallConnections";
import {
  connectionShapeCurve,
  connectionHolesFromCrossings,
  finalizeWallConnectionHoles
} from "./RecoveredWallConnectionHoles";
import { generateWallConnectionStitches } from "./RecoveredWallConnectionStitches";
import { packWallConnectionBrick, packWallConnectionBeam } from "./RecoveredWallConnectionPacking";
import type {
  WallConnectionOwner,
  WallConnectionShape,
  WallConnectionWipHole,
  WallStitchCandidate,
  WallStitchPlacement
} from "./WallConnectionTypes.ts";
export interface WallConnectionAuthor {
  unitScale?: UnitFootprintScale;
  id: bigint;
  /** Independent host random seed; omit for original identity-seeded behavior. */
  seed?: bigint;
  shape: WallConnectionShape;
  height: number;
  elevation: number;
  material: 0 | 1;
  style: 0 | 1 | 2;
  foundationOffset: number;
  roof: { height01: number; flatRoofStyle: 0 | 1 | 2 | 3; overrideMaterial?: number };
}
export interface PublishedConnectionOwner extends WallConnectionOwner {
  rimReduction: number;
}
/** Reuse the upstream profile so connections and masonry see the same top.
 * The source's gable bound is distinct from both eave Y and sampled max(top). */
export function publishWallConnectionOwner(
  author: WallConnectionAuthor,
  terrain: TerrainHeight,
  published?: ReturnType<typeof publishWallProfile>
): PublishedConnectionOwner {
  const p = published ?? publishLevelWallProfile(author.shape, author.height, terrain, author.elevation);
  const tag = author.roof.flatRoofStyle;
  const timber = tag === 1 ? false : tag === 2 ? !!((author.roof.overrideMaterial ?? 0) & 1) : author.style === 2;
  return {
    ...(author.unitScale ? { unitScale: author.unitScale } : {}),
    id: author.id,
    ...(author.seed === undefined ? {} : { seed: author.seed }),
    shape: author.shape,
    points: p.points,
    top: p.top,
    third: p.third,
    baseY: f32(author.elevation),
    maxY: p.maxY,
    maxYGable: p.maxYGable,
    material: author.material,
    style: author.style,
    foundationOffset: f32(author.foundationOffset),
    flatRoof: f32(author.roof.height01) <= f32(0.1),
    rimReduction: timber ? f32(0.1) : 0
  };
}
function contains(outer: WallConnectionShape, inner: WallConnectionShape): boolean {
  if (outer.type === "circle") {
    if (inner.type === "circle")
      return (
        Math.hypot(sub(inner.center[0], outer.center[0]), sub(inner.center[1], outer.center[1])) + inner.radius <=
        outer.radius
      );
    return connectionShapeCurve(inner).points.every(
      (p) => Math.hypot(sub(p[0], outer.center[0]), sub(p[1], outer.center[1])) <= outer.radius
    );
  }
  const [c, s] = outer.orientation,
    local = (p: number[]) => {
      const x = sub(p[0], outer.center[0]),
        z = sub(p[1], outer.center[1]);
      return [add(mul(c, x), mul(s, z)), sub(mul(c, z), mul(s, x))];
    };
  if (inner.type === "circle") {
    const p = local(inner.center);
    return (
      add(Math.abs(p[0]), inner.radius) <= mul(outer.width, 0.5) &&
      add(Math.abs(p[1]), inner.radius) <= mul(outer.depth, 0.5)
    );
  }
  return connectionShapeCurve(inner).points.every((v) => {
    const p = local(v);
    return Math.abs(p[0]) <= mul(outer.width, 0.5) && Math.abs(p[1]) <= mul(outer.depth, 0.5);
  });
}
export function planWallConnectionPair(
  a: PublishedConnectionOwner,
  b: PublishedConnectionOwner,
  terrain: TerrainHeight
) {
  if (a.id === b.id) throw Error("Distinct wall identities required");
  // Phase changes row parameterization, not the physical circle boundary.
  const identicalCircles =
    a.shape.type === "circle" &&
    b.shape.type === "circle" &&
    a.shape.radius === b.shape.radius &&
    a.shape.center.every((v, i) => v === b.shape.center[i]);
  const aa = expandedConnectionShape(a.shape, mul(0.28, (a.unitScale ?? IDENTITY_UNIT_SCALE).depth)),
    bb = expandedConnectionShape(b.shape, mul(0.28, (b.unitScale ?? IDENTITY_UNIT_SCALE).depth));
  // An internal tangency has no wall crossing seam: its two analytic events
  // have opposed stitch tangents. Keep this decision at the wall boundary;
  // flat/pitched roof arc consumers still need the analytic tangent events.
  const nestedCircles = aa.type === "circle" && bb.type === "circle" && (contains(aa, bb) || contains(bb, aa));
  const crossings =
    identicalCircles || nestedCircles
      ? []
      : aa.type === "rectangle" && bb.type === "rectangle"
        ? rectangleRectangleCrossings(aa, bb)
        : aa.type === "circle" && bb.type === "circle"
          ? circleCircleCrossings(aa, bb)
          : circleRectangleCrossings(aa, bb);
  const candidates = candidatesAtCrossings(a, b, crossings, (p) => terrain(p[0], p[1]));
  const holes: [WallConnectionWipHole[], WallConnectionWipHole[]] = [[], []];
  if (
    !identicalCircles &&
    a.flatRoof &&
    b.flatRoof &&
    Math.abs(sub(sub(a.maxYGable, 0.67), sub(b.maxYGable, 0.67))) <= 2
  ) {
    [a, b].forEach((w, i) => {
      const other = i ? a : b,
        minY = sub(add(add(add(w.maxY, -0.46), -0.21), 0.01), w.rimReduction);
      if (contains(expandedConnectionShape(other.shape, 0.05), w.shape)) {
        const length =
          w.shape.type === "circle" ? mul(w.shape.radius, f32(Math.PI * 2)) : mul(add(w.shape.width, w.shape.depth), 2);
        holes[i].push({
          centerU: mul(length, 0.5),
          centerY: mul(add(minY, 10000), 0.5),
          width: length,
          height: sub(10000, minY),
          kind: 1
        });
      } else holes[i] = connectionHolesFromCrossings(w.shape, crossings, i as 0 | 1, minY);
    });
  }
  return {
    wallIds: [a.id, b.id],
    crossings,
    candidates,
    holes,
    finalizedHoles: holes.map((h, i) =>
      finalizeWallConnectionHoles(h, connectionShapeCurve(i ? b.shape : a.shape).length)
    )
  };
}
/** Compatibility entry for callers requesting both geometry and placements. */
export function generateWallConnectionPair(...args: Parameters<typeof planWallConnectionPair>) {
  const plan = planWallConnectionPair(...args);
  return { ...plan, placements: generateWallConnectionStitches(plan.candidates) };
}
/** Rebuild all pair-derived state from current geometry; separating removes
 * derived units naturally, while author edits remain outside this pure value. */
export function planWallConnections(
  owners: readonly PublishedConnectionOwner[],
  identityOrder: readonly bigint[],
  terrain: TerrainHeight,
  slots: ReadonlyMap<bigint, number>
) {
  const byId = new Map(owners.map((w) => [w.id, w]));
  if (
    byId.size !== owners.length ||
    identityOrder.length !== owners.length ||
    new Set(identityOrder).size !== owners.length ||
    identityOrder.some((id) => !byId.has(id))
  )
    throw Error("identityOrder must contain each authored wall exactly once");
  const pairs: ReturnType<typeof planWallConnectionPair>[] = [],
    candidates: WallStitchCandidate[] = [];
  const holes = new Map<bigint, WallConnectionWipHole[]>(identityOrder.map((id) => [id, []]));
  for (let i = 0; i < identityOrder.length; i++)
    for (let j = i + 1; j < identityOrder.length; j++) {
      const a = byId.get(identityOrder[i])!,
        b = byId.get(identityOrder[j])!,
        pair = planWallConnectionPair(a, b, terrain);
      if (pair.crossings.length || pair.holes.some((h) => h.length)) pairs.push(pair);
      candidates.push(...pair.candidates);
      holes.get(a.id)!.push(...pair.holes[0]);
      holes.get(b.id)!.push(...pair.holes[1]);
    }
  const finalizedHoles = new Map(
    identityOrder.map((id) => [
      id,
      finalizeWallConnectionHoles(holes.get(id)!, connectionShapeCurve(byId.get(id)!.shape).length)
    ])
  );
  return { pairs, candidates, holes, finalizedHoles };
}

/** Placement consumes the resolved paths/reservations; geometry is not rediscovered. */
export function placeWallConnections(plan: ReturnType<typeof planWallConnections>, slots: ReadonlyMap<bigint, number>) {
  return packWallConnections(plan, generateWallConnectionStitches(plan.candidates), slots);
}

/** Encode already placed units in their stable global order. Brick alternation
 * and material hashes must not restart for each independently placed seam. */
export function packWallConnections(
  plan: ReturnType<typeof planWallConnections>,
  placements: WallStitchPlacement[],
  slots: ReadonlyMap<bigint, number>
) {
  const candidateIndices = new Map(plan.candidates.map((c, i) => [c, i]));
  const byCandidate = new Map<number, WallStitchPlacement[]>();
  for (const p of placements) {
    if (!Number.isInteger(p.sourceCandidate) || !plan.candidates[p.sourceCandidate])
      throw Error("Connection placement has no source candidate");
    const entries = byCandidate.get(p.sourceCandidate) ?? [];
    entries.push(p);
    byCandidate.set(p.sourceCandidate, entries);
  }
  let ordinal = 0;
  const bricks = placements
    .filter((p) => p.unit === "brick")
    .map((p) => ({ placement: p, ...packWallConnectionBrick(p, ordinal++, slots) }));
  const beams = placements
    .filter((p) => p.unit === "wooden_plank")
    .map((p, i) => ({ placement: p, ...packWallConnectionBeam(p, i, slots) }));
  const pairs = plan.pairs.map((pair) => ({
    ...pair,
    placements: pair.candidates.flatMap((candidate, index) => {
      const globalIndex = candidateIndices.get(candidate);
      if (globalIndex === undefined) throw Error("Connection pair has no source candidate");
      return (byCandidate.get(globalIndex) ?? []).map((p) => ({ ...p, sourceCandidate: index }));
    })
  }));
  return { ...plan, pairs, placements, bricks, beams };
}
export function generateWallConnections(...args: Parameters<typeof planWallConnections>) {
  return placeWallConnections(planWallConnections(...args), args[3]);
}
