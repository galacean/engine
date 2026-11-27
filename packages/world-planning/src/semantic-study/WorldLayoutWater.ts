import { createPlanningElevationSampler, planningDownhill } from "./WorldPlanningTerrain";
import { ribbonOutline } from "./WorldRibbon";
import { editFootprints, activePlacement } from "./WorldEditPlacement";
import { connectorBlock, type ShapeRecipe } from "./ComposedShape";
import { envelope, slopeBand } from "./IslandPlanAtoms";
import { compileRegion, growRegion } from "./WorldShapeGrowth";
import { pointInPolygon } from "../geometry/V2Geometry";
import type { PlanPoint, PlanWater } from "./IslandPlanModel";
import { ringGap } from "./WorldPlanningGeometry";
import { WorldPlanningWaterQuery } from "./WorldPlanningWaterQuery";
const queries = new WeakMap<WorldLayoutContext, WorldPlanningWaterQuery>();
import type { WorldLayoutContext } from "./WorldLayoutPlanner";

/** Stable editable owner shared by a main channel, its lake and every tributary. */
export function waterSystemId(id: string): string {
  const river = /^(river-\d+)/.exec(id);
  if (river) return river[1];
  const lake = /^lake-(\d+)$/.exec(id);
  return lake ? `river-${lake[1]}` : id;
}
/** Seed-addressed per-system bases. Width edits remain multipliers of this width.
 * @param random World-seeded identity stream.
 * @param id Main river, tributary or lake identity.
 * @returns Shared system scale and the generated absolute control defaults.
 */
export function waterInstanceDefaults(random: (key: string) => number, id: string) {
  const owner = waterSystemId(id),
    scale = 0.7 + random(`${owner}-instance-scale`) * 0.7;
  return {
    widthScale: scale,
    lakeScale: 0.75 + scale * 0.25 + random(`${owner}-instance-lake`) * 0.25,
    bend: 0.25 + random(`${owner}-instance-bend`) * 0.5,
    branches: 0.25 + random(`${owner}-instance-branches`) * 0.5,
    complexity: 1,
    widthVariation: 0.75 + random(`${owner}-instance-contrast`) * 0.25
  };
}
function waterEdit(c: WorldLayoutContext, id: string) {
  return { ...waterInstanceDefaults(c.random, id), ...c.edits[waterSystemId(id)], ...c.edits[id] };
}
/** Correlated cubic interpolation of a few stable broad controls, not per-point jitter. */
function channelField(t: number, phase: number, count: number): number {
  const at = (i: number) => {
    let h = Math.imul((Math.round(phase * 1e7) ^ i) | 0, 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
  };
  const x = Math.max(0, Math.min(1, t)) * (count - 1),
    i = Math.floor(x),
    u = x - i;
  const a = at(Math.max(0, i - 1)),
    b = at(i),
    c = at(Math.min(count - 1, i + 1)),
    d = at(Math.min(count - 1, i + 2));
  return Math.max(
    -1,
    Math.min(
      1,
      0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u)
    )
  );
}
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const mix = (a: PlanPoint, b: PlanPoint, t: number): PlanPoint => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t
});
function segmentDistance(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
function spawnClear(c: WorldLayoutContext, points: PlanPoint[], width: number): boolean {
  if (c.plan.planning) return true;
  return points.slice(1).every((p, i) => segmentDistance(c.plan.spawn, points[i], p) >= 85 + width * 0.7);
}
/** Clip a segment to the exterior of the explicitly allowed confluence disk. */
function outsideJoin(a: PlanPoint, b: PlanPoint, join: PlanPoint, radius: number): [PlanPoint, PlanPoint][] {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    x = a.x - join.x,
    z = a.z - join.z,
    A = dx * dx + dz * dz,
    B = 2 * (x * dx + z * dz),
    C = x * x + z * z - radius * radius;
  const cuts = [0, 1],
    D = B * B - 4 * A * C;
  if (A > 0 && D > 0)
    for (const t of [(-B - Math.sqrt(D)) / (2 * A), (-B + Math.sqrt(D)) / (2 * A)]) if (t > 0 && t < 1) cuts.push(t);
  cuts.sort((a, b) => a - b);
  const result: [PlanPoint, PlanPoint][] = [];
  for (let i = 1; i < cuts.length; i++)
    if (distance(mix(a, b, (cuts[i - 1] + cuts[i]) / 2), join) > radius)
      result.push([mix(a, b, cuts[i - 1]), mix(a, b, cuts[i])]);
  return result;
}
/** Confluence extent follows the actual two channel widths, including local edits. */
function confluenceRadius(c: WorldLayoutContext, width: number, receiver: PlanWater): number {
  const recipe = c.plan.shapeRecipes?.find((r) => r.id === receiver.id);
  const receivingWidth =
    recipe && receiver.centerline ? meanChannelWidth(recipe, receiver.centerline) : c.parameters.riverWidth;
  return Math.min(width + c.parameters.riverWidth * 1.25, 2 * (width + receivingWidth));
}
function waterSpaceClear(c: WorldLayoutContext, points: PlanPoint[], width: number, receiver?: string): boolean {
  if (!c.plan.planning) return true;
  for (const rock of c.plan.rocks)
    for (let i = 1; i < points.length; i++)
      if (queries.get(c)!.segmentNear(points[i - 1], points[i], rock.obb, width * 0.6 + 12, true)) return false;
  for (const ring of editFootprints(c.edits, ""))
    for (let i = 1; i < points.length; i++)
      if (queries.get(c)!.segmentNear(points[i - 1], points[i], ring, width * 0.75 + 2, false)) return false;
  const join = points[points.length - 1];
  for (const water of c.plan.waters) {
    const receiving = water.id === receiver,
      radius = confluenceRadius(c, width, water);
    for (let i = 1; i < points.length; i++) {
      const segments = receiving
        ? outsideJoin(points[i - 1], points[i], join, radius)
        : ([[points[i - 1], points[i]]] as [PlanPoint, PlanPoint][]);
      if (segments.some(([a, b]) => queries.get(c)!.segmentNear(a, b, water.outline, width * 0.75 + 2, false)))
        return false;
    }
  }
  return true;
}
function outlineClear(
  c: WorldLayoutContext,
  outline: PlanPoint[],
  join: PlanPoint,
  width: number,
  receiver: string
): boolean {
  if (!c.plan.planning) return true;
  return c.plan.waters.every((w) => {
    if (!queries.get(c)!.overlap(outline, w.outline)) return true;
    if (w.id !== receiver) return false;
    const radius = confluenceRadius(c, width, w);
    // Check both boundaries so containment and crossings outside the node cannot be exempted.
    return [
      [outline, w.outline],
      [w.outline, outline]
    ].every(([a, b]) =>
      a.every((p, i) =>
        outsideJoin(p, a[(i + 1) % a.length], join, radius).every(
          ([u, v]) => !queries.get(c)!.segmentNear(u, v, b, 0.01, true)
        )
      )
    );
  });
}
/** First shoreline along a ray; the bounded march follows the actual generated land. */
function shore(c: WorldLayoutContext, from: PlanPoint, angle: number, limit = 2200): PlanPoint {
  const dx = Math.cos(angle),
    dz = Math.sin(angle);
  let last = from;
  for (let d = 8; d <= limit; d += 8) {
    const p = { x: from.x + dx * d, z: from.z + dz * d };
    if (!queries.get(c)!.contains(p, c.plan.land)) {
      // Keep the ocean side of the actual crossing. A march-cell midpoint may
      // still be inland when no further extension fits near the world boundary.
      let inside = last,
        outside = p;
      for (let k = 0; k < 20; k++) {
        const middle = mix(inside, outside, 0.5);
        if (queries.get(c)!.contains(middle, c.plan.land)) inside = middle;
        else outside = middle;
      }
      const margin = Math.max(0, Math.min(2, Math.min(outside.x, outside.z, 2048 - outside.x, 2048 - outside.z) - 1));
      return { x: outside.x + dx * margin, z: outside.z + dz * margin };
    }
    last = p;
  }
  return last;
}
/** Low-frequency cross sections with an exact length-weighted mean width.
 * @param points Ordered channel anchors in world metres.
 * @param width Requested length-weighted mean width.
 * @param variation Relative cross-section contrast in [0,1].
 * @param phase Stable channel-specific phase in radians.
 * @returns One width for each segment, with a preserved weighted mean.
 */
export function riverSectionWidths(points: PlanPoint[], width: number, variation: number, phase: number): number[] {
  const lengths = points.slice(1).map((p, i) => distance(points[i], p)),
    total = lengths.reduce((a, b) => a + b, 0) || 1;
  let along = 0;
  const values = lengths.map((length) => {
    const t = (along + length * 0.5) / total;
    along += length;
    return channelField(t, phase, 5);
  });
  const mean = values.reduce((sum, value, i) => sum + value * lengths[i], 0) / total;
  const extent = Math.max(1, ...values.map((value) => Math.abs(value - mean))),
    amount = Math.max(0, Math.min(1, variation));
  return values.map((value) => width * (1 + (0.85 * amount * (value - mean)) / extent));
}
function meanChannelWidth(recipe: ShapeRecipe, points: PlanPoint[]): number {
  let sum = 0,
    length = 0;
  for (let i = 1; i < points.length; i++) {
    const d = distance(points[i - 1], points[i]);
    sum += recipe.blocks[i - 1].width * d;
    length += d;
  }
  return sum / (length || 1);
}
/** Random cross-section changes are authored on connected rectangles, never final contour points. */
function channel(
  c: WorldLayoutContext,
  id: string,
  anchors: PlanPoint[],
  width: number,
  label: string,
  from: string,
  to: string
): boolean {
  const boundary = Math.min(...anchors.map((p) => Math.min(p.x, p.z, 2048 - p.x, 2048 - p.z)));
  const resolved = Math.max(2, Math.min(width, boundary / 1.8));
  if (resolved < width - 0.1) c.notes.push(`${label}靠近地图边界，实际宽度 ${resolved.toFixed(0)} 米`);
  width = resolved;
  let recipe: ShapeRecipe | undefined,
    outline: PlanPoint[] | undefined,
    resolvedAnchors = anchors;
  // Wide, short channels can close a loop in their union; reduce only this meander.
  for (const factor of c.plan.structures?.length && id === "river-0" ? [1] : [1, 0.5, 0.2, 0]) {
    const candidate = anchors.map((p, i) =>
      mix(mix(anchors[0], anchors[anchors.length - 1], i / (anchors.length - 1)), p, factor)
    );
    const sectionWidths = riverSectionWidths(
      candidate,
      width,
      waterEdit(c, id).widthVariation ?? 0.5,
      c.random(`${id}-shape-field`) * Math.PI * 2
    );
    const blocks = candidate
      .slice(1)
      .map((p, i) => connectorBlock(`${id}-block-${i}`, candidate[i], p, sectionWidths[i]));
    const attempt: ShapeRecipe = { id, label, blocks, rounding: width * 0.6 };
    try {
      for (const rounding of c.plan.planning
        ? [attempt.rounding, Math.min(4, attempt.rounding), 0]
        : [attempt.rounding]) {
        const source = { ...attempt, rounding },
          compiled = ribbonOutline(candidate, sectionWidths);
        // Smoothing can pull a long narrow end cap past its port: test the compiled water, then reduce only boundary rounding.
        if (
          c.plan.planning &&
          candidate.some(
            (p) => !queries.get(c)!.contains(p, compiled) || queries.get(c)!.boundaryDistance(p, compiled) < 0.02
          )
        )
          continue;
        if (c.plan.rocks.some((r) => queries.get(c)!.overlap(compiled, r.obb))) continue;
        const receiving = c.plan.waters.find((w) => w.id === to),
          end = candidate[candidate.length - 1];
        if (
          receiving &&
          (!queries.get(c)!.contains(end, receiving.outline) ||
            queries.get(c)!.boundaryDistance(end, receiving.outline) <= 0.02)
        )
          continue;
        if (!outlineClear(c, compiled, end, width, to)) continue;
        // The actual bank is part of the channel footprint. A near-world-edge
        // mouth must choose another bounded candidate when its full bank cannot fit.
        if (
          c.plan.planning &&
          slopeBand(`bank-${id}`, "河岸", compiled, 12, false).outer.some(
            (p) => p.x < 0 || p.z < 0 || p.x > 2048 || p.z > 2048
          )
        )
          continue;
        outline = compiled;
        recipe = source;
        resolvedAnchors = candidate;
        break;
      }
      if (recipe) {
        if (factor < 1) c.notes.push(`${label}缩短局部曲折，保持水域连续`);
        break;
      }
    } catch {
      /* Bounded local geometry repair, retaining component count. */
    }
  }
  if (!recipe || !outline) {
    if (c.plan.planning) {
      c.notes.push(`${label}无法在既有水网之外形成连续水域`);
      return false;
    }
    throw new Error(`${label}无法形成连续水域`);
  }
  anchors.splice(0, anchors.length, ...resolvedAnchors);
  c.plan.shapeRecipes!.push(recipe);
  c.plan.waters.push({
    id,
    label,
    kind: "river",
    systemId: waterSystemId(id),
    outline,
    centerline: resolvedAnchors,
    from,
    to
  });
  return true;
}
/** Coarse meander anchors retain the connection while varying lateral position and local width. */
function meander(c: WorldLayoutContext, id: string, a: PlanPoint, b: PlanPoint, width: number): PlanPoint[] {
  const detail = waterEdit(c, id).complexity ?? 0.5,
    n = 4 + Math.round(Math.max(0, Math.min(1, detail)) * 12),
    dx = b.x - a.x,
    dz = b.z - a.z,
    len = Math.hypot(dx, dz),
    nx = -dz / (len || 1),
    nz = dx / (len || 1);
  // Two broad, oppositely turning reaches. Stable knot locations and amplitudes
  // avoid a periodic waveform and keep complexity from relocating the endpoints.
  const side = c.random(`${id}-bend-side`) < 0.5 ? -1 : 1;
  const knots = [0, 0.24 + c.random(`${id}-bend-first`) * 0.12, 0.62 + c.random(`${id}-bend-second`) * 0.12, 1];
  const values = [
    0,
    side * (0.7 + c.random(`${id}-bend-first-scale`) * 0.3),
    -side * (0.7 + c.random(`${id}-bend-second-scale`) * 0.3),
    0
  ];
  const field = (t: number) => {
    let i = 0;
    while (i < 2 && t > knots[i + 1]) i++;
    const span = knots[i + 1] - knots[i],
      u = (t - knots[i]) / span;
    const slope = (j: number) =>
      j === 0 || j === 3 ? 0 : (values[j + 1] - values[j - 1]) / (knots[j + 1] - knots[j - 1]);
    return (
      (2 * u * u * u - 3 * u * u + 1) * values[i] +
      (u * u * u - 2 * u * u + u) * span * slope(i) +
      (-2 * u * u * u + 3 * u * u) * values[i + 1] +
      (u * u * u - u * u) * span * slope(i + 1)
    );
  };
  const peak = Math.max(...Array.from({ length: 33 }, (_, i) => Math.abs(field(i / 32))), 0.01);
  const amplitude = len * 0.22 * (waterEdit(c, id).bend ?? c.parameters.riverBend);
  const points: PlanPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      base = mix(a, b, t),
      offset = (field(t) / peak) * amplitude;
    let p = { x: base.x + nx * offset, z: base.z + nz * offset };
    // Respect the usable inland corridor with bounded local retreat, retaining
    // the exact source and ocean/receiving-water endpoints.
    for (
      let k = 0;
      k < 6 &&
      i > 0 &&
      i < n &&
      (!queries.get(c)!.contains(p, c.plan.land) ||
        (c.plan.planning
          ? queries.get(c)!.boundaryDistance(p, c.plan.land) < width * 0.65 + 12
          : distance(p, c.plan.spawn) < 85 + width * 0.5));
      k++
    )
      p = mix(p, base, 0.5);
    points.push(i === 0 ? a : i === n ? b : p);
  }
  if (!spawnClear(c, points, width)) {
    for (const factor of [0.5, 0.25, 0]) {
      const candidate = points.map((p, i) => mix(mix(a, b, i / n), p, factor));
      if (spawnClear(c, candidate, width)) return candidate;
    }
  }
  return points;
}
/** Generate a deterministic network with independently located sources, mouths and confluences.
 * River and lake components share their owning system's generated or edited complexity.
 * This plans horizontal water space; downstream elevation solving remains separate.
 */
export function generateWorldWater(c: WorldLayoutContext): void {
  const query = new WorldPlanningWaterQuery();
  queries.set(c, query);
  const q = c.parameters,
    land = c.plan.land;
  // Interior maximum-clearance anchor is independent of the future spawn choice.
  let spawn = c.plan.spawn;
  if (c.plan.planning) {
    let clearance = -1;
    for (let z = 32; z < 2048; z += 32)
      for (let x = 32; x < 2048; x += 32) {
        const p = { x, z };
        if (!queries.get(c)!.contains(p, land)) continue;
        const d = query.boundaryDistance(p, land);
        if (d > clearance) {
          clearance = d;
          spawn = p;
        }
      }
    for (let i = 0; i < q.rivers; i++) c.plan.planning.requiredIds.push(`river-${i}`, `lake-${i}`);
  }
  const elevation = createPlanningElevationSampler(c.plan);
  const sources: PlanPoint[] = [],
    branchCapacity = new Map<string, { requested: number; attempted: number; resolved: number; tendency: number }>();
  for (let i = 0; i < q.rivers; i++) {
    const id = `river-${i}`,
      defaults = waterInstanceDefaults(c.random, id),
      width = q.riverWidth * defaults.widthScale * (c.edits[id]?.width ?? c.edits[id]?.size ?? 1);
    const branchCount = Math.max(
      0,
      Math.round(
        q.branches *
          (c.plan.planning ? 2 * Math.max(0, Math.min(1, waterEdit(c, id).branches)) : (c.edits[id]?.branches ?? 1))
      )
    );
    const branchIndices = new Set(Array.from({ length: branchCount }, (_, j) => j));
    // An addressed branch remains a construction candidate even when broad richness is lowered.
    for (const editedId of Object.keys(c.edits))
      if (editedId.startsWith(`${id}-branch-`)) {
        const suffix = editedId.slice(`${id}-branch-`.length),
          match = /^(\d+)(?:-branch-\d+)*$/.exec(suffix);
        if (match) branchIndices.add(Number(match[1]));
      }
    branchCapacity.set(id, {
      requested: branchCount,
      attempted: branchIndices.size,
      resolved: 0,
      tendency: waterEdit(c, id).branches
    });
    const ranked: { a: PlanPoint; b: PlanPoint; score: number; points?: PlanPoint[] }[] = [];
    const structure = i === 0 ? c.plan.structures?.[0] : undefined;
    if (structure && !activePlacement(c.edits, id))
      ranked.push({
        a: structure.axis[0],
        b: structure.outlet,
        score: Infinity,
        points: [...structure.axis, structure.outlet]
      });
    const footSites = c.plan.mountains
      .filter((m) => !m.offshore)
      .flatMap((m) => {
        const rocks = c.plan.rocks.filter((r) => r.groupId === m.id);
        return rocks
          .flatMap((r) => r.obb)
          .map((p) => {
            const angle = planningDownhill(elevation, p),
              gap = width * 0.8 + 24;
            return { x: p.x + Math.cos(angle) * gap, z: p.z + Math.sin(angle) * gap };
          });
      })
      .filter(
        (p) => queries.get(c)!.contains(p, land) && !c.plan.rocks.some((r) => queries.get(c)!.contains(p, r.obb))
      );

    // Candidate rays vary in origin and direction, rather than repeating parallel river templates.
    for (let k = 0; k < 48; k++) {
      const angle = c.random(`${id}-source-angle-${k}`) * Math.PI * 2,
        radius = 140 + c.random(`${id}-source-radius-${k}`) * 420;
      const a = footSites.length
        ? footSites[(k + i * 13) % footSites.length]
        : { x: spawn.x + Math.cos(angle) * radius, z: spawn.z + Math.sin(angle) * radius };
      if (!queries.get(c)!.contains(a, land) || query.boundaryDistance(a, land) < Math.max(35, width * 0.6)) continue;
      const heading =
          c.plan.parameters.globalElevation !== undefined
            ? planningDownhill(elevation, a) + (c.random(`${id}-mouth-angle-${k}`) - 0.5) * 1.2
            : c.random(`${id}-mouth-angle-${k}`) * Math.PI * 2 + (c.edits[id]?.direction ?? 0) * Math.PI,
        b = shore(c, a, heading);
      const len = distance(a, b);
      if (len < 150) continue;
      if (!c.plan.planning && segmentDistance(spawn, a, b) < 110 + width * 0.7) continue;
      if (c.plan.planning) {
        if (c.plan.waters.some((w) => ringGap(a, w.outline) < q.lakeSize * (c.edits[`lake-${i}`]?.size ?? 1) * 1.8))
          continue;
        if (!waterSpaceClear(c, meander(c, id, a, b, width), width)) continue;
      }
      const separation = sources.length ? Math.min(...sources.map((p) => distance(a, p))) : 200;
      const score = elevation(a) * 8 + len * 0.45 + Math.min(350, separation) + c.random(`${id}-choice-${k}`) * 180;
      ranked.push({ a, b, score });
    }
    if (!ranked.length && c.plan.planning && queries.get(c)!.contains(spawn, land)) {
      const angle = c.random(`${id}-fallback`) * Math.PI * 2,
        b = shore(c, spawn, angle);
      if (distance(spawn, b) > 40 && waterSpaceClear(c, meander(c, id, spawn, b, width), width))
        ranked.push({ a: spawn, b, score: 0 });
    }
    const saved = c.edits[id]?.placement;
    if (saved?.end) {
      const a = saved.origin,
        b = shore(c, a, Math.atan2(saved.end.z - a.z, saved.end.x - a.x));
      if (activePlacement(c.edits, id)) ranked.length = 0;
      ranked.push({ a, b, score: Infinity });
    }
    ranked.sort((a, b) => b.score - a.score);
    if (!ranked.length) {
      c.notes.push(`主河 ${i + 1}暂无足够连续陆域`);
      continue;
    }
    let acceptedAnchors: PlanPoint[] | undefined;
    // Search is bounded within this main network; accepted independent networks remain untouched.
    for (const { a, b, points } of ranked.slice(0, c.plan.planning ? 8 : 1)) {
      // Extend slightly into ocean so that the mouth has no artificial cap on the shore.
      const len = distance(a, b),
        extension = Math.max(0, Math.min(width * 0.6, Math.min(b.x, b.z, 2048 - b.x, 2048 - b.z) - width));
      const end = { x: b.x + ((b.x - a.x) / len) * extension, z: b.z + ((b.z - a.z) / len) * extension };
      const anchors = points ?? meander(c, id, a, end, width);
      if (!spawnClear(c, anchors, width)) {
        c.notes.push(`主河 ${i + 1}避让出生区域，暂不生成`);
        continue;
      }
      if (!channel(c, id, anchors, width, `主河 ${i + 1}`, `lake-${i}`, "ocean")) continue;
      const lakeId = `lake-${i}`,
        lakeScale = Math.min(
          q.lakeSize *
            defaults.lakeScale *
            (c.edits[lakeId]?.size ?? 1) *
            (c.edits[id]?.width ?? c.edits[id]?.size ?? 1),
          query.boundaryDistance(a, land) * 1.35
        );
      const recipe = growRegion({
        id: lakeId,
        center: a,
        width: lakeScale * 1.6,
        length: lakeScale * 1.4,
        angle: c.random(`${lakeId}-rotation`) * Math.PI * 2,
        count: 4 + Math.round(Math.max(0, Math.min(1, waterEdit(c, id).complexity ?? 0.5)) * 12),
        random: c.random
      });
      const lakeRadius = Math.max(
        ...recipe.blocks
          .flatMap((block) => envelope(block, block.width, block.length, (block.yaw * Math.PI) / 180))
          .map((p) => distance(p, a))
      );
      const lakeLimit = Math.min(
        ...c.plan.rocks.map((r) => query.boundaryDistance(a, r.obb) * 0.9),
        query.boundaryDistance(a, land) * 0.9,
        c.plan.planning ? Infinity : distance(a, spawn) - 85,
        Math.min(a.x, a.z, 2048 - a.x, 2048 - a.z) - 4
      );
      const lakeFit = Math.min(1, Math.max(4, lakeLimit) / lakeRadius);
      recipe.blocks = recipe.blocks.map((b) => ({
        ...b,
        x: a.x + (b.x - a.x) * lakeFit,
        z: a.z + (b.z - a.z) * lakeFit,
        width: b.width * lakeFit,
        length: b.length * lakeFit
      }));
      recipe.rounding *= lakeFit;
      recipe.label = `源头湖区 ${i + 1}`;
      const outline = compileRegion(recipe);
      if (c.plan.planning && c.plan.waters.some((w) => w.id !== id && queries.get(c)!.overlap(outline, w.outline))) {
        c.plan.waters = c.plan.waters.filter((w) => w.id !== id);
        c.plan.shapeRecipes = c.plan.shapeRecipes!.filter((r) => r.id !== id);
        c.notes.push(`源头湖区 ${i + 1}与无关联水网冲突，本河湖需求未满足`);
        continue;
      }
      c.plan.shapeRecipes!.push(recipe);
      c.plan.waters.push({ id: lakeId, label: recipe.label, kind: "lake", systemId: id, outline, to: id });
      if (points && structure) {
        const owner = c.plan.planning?.modules.find((m) => m.id === structure.id);
        if (owner && !owner.dependencies.includes(id)) owner.dependencies.push(id);
        c.plan.planning?.relations.push({
          id: `${structure.id}-water`,
          kind: "contains",
          owners: [structure.id, id],
          ports: [],
          required: true
        });
      }
      acceptedAnchors = anchors;
      sources.push(a);
      break;
    }
    if (!acceptedAnchors) {
      c.notes.push(`主河 ${i + 1}候选预算内未满足河湖连接要求`);
      continue;
    }
    const anchors = acceptedAnchors;
    branchCapacity.get(id)!.resolved = buildTributaries(c, id, anchors, width, branchIndices, String(i + 1), false);
  }
  if (c.plan.planning) {
    for (let index = 0; index < c.plan.waters.length; index++) {
      const parent = c.plan.waters[index];
      if (parent.kind !== "river" || !parent.id.includes("-branch-")) continue;
      const tendency = Math.max(0, Math.min(1, c.edits[parent.id]?.branches ?? 0)),
        count = Math.round(q.branches * 2 * tendency);
      const indices = new Set(Array.from({ length: count }, (_, j) => j));
      for (const editedId of Object.keys(c.edits))
        if (editedId.startsWith(`${parent.id}-branch-`)) {
          const match = /^(\d+)(?:-branch-\d+)*$/.exec(editedId.slice(`${parent.id}-branch-`.length));
          if (match) indices.add(Number(match[1]));
        }
      const recipe = c.plan.shapeRecipes!.find((r) => r.id === parent.id)!;
      const width = meanChannelWidth(recipe, parent.centerline!);
      const resolved = indices.size
        ? buildTributaries(c, parent.id, parent.centerline!, width, indices, parent.label.replace(/^支流 /, ""), true)
        : 0;
      branchCapacity.set(parent.id, { requested: count, attempted: indices.size, resolved, tendency });
    }
  }
  if (c.plan.planning) {
    recordWaterContracts(c);
    for (const main of c.plan.waters.filter((w) => w.id === waterSystemId(w.id))) {
      const members = c.plan.waters.filter((w) => w.systemId === main.id),
        module = c.plan.planning.modules.find((m) => m.id === main.id)!;
      module.memberIds = members.map((w) => w.id);
      module.outlines = members.map((w) => w.outline);
      module.requested = {
        ...module.requested,
        width: c.edits[main.id]?.width ?? 1,
        bend: waterEdit(c, main.id).bend,
        branches: waterEdit(c, main.id).branches,
        complexity: waterEdit(c, main.id).complexity,
        widthVariation: waterEdit(c, main.id).widthVariation
      };
      module.resolved = {
        ...module.resolved,
        waterBodies: members.length,
        baseWidth: q.riverWidth * waterInstanceDefaults(c.random, main.id).widthScale,
        baseLakeScale: q.lakeSize * waterInstanceDefaults(c.random, main.id).lakeScale
      };
    }
    for (const [id, capacity] of branchCapacity) {
      const module = c.plan.planning.modules.find((m) => m.id === id);
      if (module) {
        module.requested = {
          ...module.requested,
          branchRichness: capacity.tendency,
          branchCandidates: capacity.requested
        };
        module.resolved = {
          ...module.resolved,
          branchCount: capacity.resolved,
          branchCandidates: capacity.attempted,
          branchCapacity: capacity.resolved
        };
      }
      if (capacity.resolved < capacity.attempted)
        c.plan.planning.adjustments.push({
          owners: [id],
          reason: "支流丰富度在本轮可行岸内容量中分配；未提交候选不成为必需水体",
          requested: capacity.attempted,
          resolved: capacity.resolved
        });
    }
  }
}

/** Select a confluence inside the compiled receiver, even when its skeleton chord crosses a curved bank. */
export function receivingWaterJoin(
  outline: PlanPoint[],
  a: PlanPoint,
  b: PlanPoint,
  fraction: number,
  query = new WorldPlanningWaterQuery()
): PlanPoint | undefined {
  const intended = mix(a, b, fraction);
  const interior = (p: PlanPoint) => query.contains(p, outline) && query.boundaryDistance(p, outline) > 0.02;
  if (interior(intended)) return intended;
  return Array.from({ length: 33 }, (_, k) => mix(a, b, k / 32))
    .filter(interior)
    .sort((p, q) => distance(p, intended) - distance(q, intended))[0];
}

/** Construct tributaries through the same rectangle, clearance and connection path at every depth. */
function buildTributaries(
  c: WorldLayoutContext,
  id: string,
  anchors: PlanPoint[],
  width: number,
  indices: Set<number>,
  label: string,
  compact: boolean
): number {
  const elevation = createPlanningElevationSampler(c.plan);
  let resolved = 0;
  for (const j of [...indices].sort((a, b) => a - b)) {
    const branchId = `${id}-branch-${j}`,
      branchWidth =
        Math.max(6, width * (0.28 + c.random(`${branchId}-width`) * 0.3)) *
        (c.edits[branchId]?.width ?? c.edits[branchId]?.size ?? 1);
    const side = c.random(`${branchId}-side`) < 0.5 ? -1 : 1,
      angle = 0.65 + c.random(`${branchId}-angle`) * 1.5;
    const originalT = 0.16 + c.random(`${branchId}-join`) * 0.67;
    let committed = false;
    for (const joinT of compact ? [originalT, 0.2, 0.45, 0.7] : [originalT]) {
      const index = Math.min(anchors.length - 2, Math.floor(joinT * (anchors.length - 1))),
        fraction = joinT * (anchors.length - 1) - index;
      const receiver = c.plan.waters.find((w) => w.id === id)!;
      const join = receivingWaterJoin(receiver.outline, anchors[index], anchors[index + 1], fraction, queries.get(c)!);
      if (!join) continue;
      const tangent = Math.atan2(anchors[index + 1].z - anchors[index].z, anchors[index + 1].x - anchors[index].x);
      for (const factor of compact ? [1, 0.5, 0.25] : [1]) {
        for (const offset of [side * angle, -side * angle, side * 0.55, -side * 0.55]) {
          const heading = tangent + offset,
            coast = shore(c, join, heading, compact ? 280 : 650),
            available = distance(join, coast);
          const intended = compact
            ? Math.min(140, Math.max(35, distance(anchors[0], anchors[anchors.length - 1]) * 0.55))
            : 90 + c.random(`${branchId}-length`) * 260;
          const branchLength = Math.min(available * 0.7, intended) * factor;
          if (branchLength < 25) continue;
          const start = { x: join.x + Math.cos(heading) * branchLength, z: join.z + Math.sin(heading) * branchLength };
          if (c.plan.parameters.globalElevation !== undefined && elevation(start) <= elevation(join) + 0.5) continue;
          if (!spawnClear(c, [start, join], branchWidth)) continue;
          const points = meander(c, branchId, start, join, branchWidth);
          if (!spawnClear(c, points, branchWidth) || !waterSpaceClear(c, points, branchWidth, id)) continue;
          if (channel(c, branchId, points, branchWidth, `支流 ${label}.${j + 1}`, `${branchId}-source`, id)) {
            resolved++;
            committed = true;
            if (c.plan.planning && !c.plan.planning.requiredIds.includes(branchId))
              c.plan.planning.requiredIds.push(branchId);
          }
          // Legacy/main behavior keeps its original first candidate; new child branches can repair their local candidate.
          if (committed || !compact) break;
        }
        if (committed) break;
      }
      if (committed) break;
    }
    if (!committed) c.notes.push(`支流 ${label}.${j + 1}在可行岸内容量中未分配`);
  }
  return resolved;
}

/** Resolve water levels once from outlet to source; tributaries reference the receiving profile. */
function recordWaterContracts(c: WorldLayoutContext): void {
  const elevation = createPlanningElevationSampler(c.plan);
  const baseHeight = (p: PlanPoint) => {
    const d = Math.max(0, Math.min(1, queries.get(c)!.boundaryDistance(p, c.plan.land) / 100));
    return elevation(p) * d * d * (3 - 2 * d);
  };
  const data = c.plan.planning!;
  const waterById = new Map(c.plan.waters.map((w) => [w.id, w]));
  const lengths = (points: PlanPoint[]) => {
    let total = 0;
    return points.map((p, i) => {
      if (i) total += distance(points[i - 1], p);
      return total;
    });
  };
  const levelAt = (owner: string, p: PlanPoint) => {
    const profile = data.profiles.find((v) => v.ownerId === owner && v.kind === "water")!;
    let best = Infinity,
      level = profile.points[0].y;
    for (let i = 1; i < profile.points.length; i++) {
      const a = profile.points[i - 1],
        b = profile.points[i],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))),
        d = distance(p, mix(a, b, t));
      if (d < best) {
        best = d;
        level = a.y + (b.y - a.y) * t;
      }
    }
    return level;
  };
  const register = (water: PlanWater, points: PlanPoint[], start: number, end: number, width: number) => {
    const along = lengths(points),
      total = along[along.length - 1] || 1;
    const profile = points.map((p, i) => ({
      ...p,
      y: i === points.length - 1 ? end : i === 0 ? start : start + ((end - start) * along[i]) / total
    }));
    if (c.plan.parameters.globalElevation !== undefined && points.length > 1) {
      let previous = start;
      for (let i = 0; i < profile.length - 1; i++) {
        profile[i].y = Math.max(end, Math.min(previous, profile[i].y, baseHeight(profile[i]) - 1));
        previous = profile[i].y;
      }
    }
    data.modules.push({
      id: water.id,
      kind: "water",
      outline: water.outline,
      dependencies: [water.to === "ocean" ? "land-main" : (water.to ?? "land-main")],
      ownerId: water.id === waterSystemId(water.id) ? undefined : waterSystemId(water.id),
      requested: Object.fromEntries(
        Object.entries(waterEdit(c, water.id)).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number"
        )
      ),
      resolved: {
        width,
        ...(water.kind === "river" ? { widthVariation: waterEdit(c, water.id).widthVariation ?? 0.5 } : {}),
        sourceHeight: start,
        outletHeight: end
      }
    });
    data.profiles.push(
      {
        id: `${water.id}-water`,
        ownerId: water.id,
        kind: "water",
        points: profile,
        width,
        supportIds: [`${water.id}-bed`]
      },
      {
        id: `${water.id}-bed`,
        ownerId: water.id,
        kind: "bed",
        points: profile.map((p) => ({ ...p, y: p.y - Math.max(2, width * 0.08) })),
        width,
        supportIds: ["land-main"]
      }
    );
    const bank = slopeBand(`bank-${water.id}`, "河湖岸带", water.outline, 12, false);
    data.reservations.push({
      id: bank.id,
      ownerId: water.id,
      kind: "bank",
      outline: bank.outer,
      relatedIds: [water.id]
    });
  };
  // Generation order is receiver-before-tributary; lakes follow their receiving main river.
  for (const water of c.plan.waters) {
    if (water.kind === "lake") {
      const receiver = waterById.get(water.to!)!,
        p = receiver.centerline![0],
        height = levelAt(receiver.id, p);
      register(
        water,
        [p],
        height,
        height,
        c.parameters.lakeSize *
          waterInstanceDefaults(c.random, water.id).lakeScale *
          (c.edits[water.id]?.size ?? 1) *
          (c.edits[waterSystemId(water.id)]?.width ?? c.edits[waterSystemId(water.id)]?.size ?? 1)
      );
      const port = `${water.id}-outlet`;
      data.ports.push({
        id: port,
        ownerId: water.id,
        kind: "water",
        position: p,
        height,
        width: Math.min(c.parameters.riverWidth, c.parameters.lakeSize),
        surfaceId: `${water.id}-water`
      });
      data.relations.push({
        id: `${water.id}-flows`,
        kind: "flows",
        owners: [water.id, receiver.id],
        ports: [port],
        required: true
      });
    } else {
      const points = water.centerline!,
        endPoint = points[points.length - 1],
        isMain = water.to === "ocean";
      const width = meanChannelWidth(c.plan.shapeRecipes!.find((r) => r.id === water.id)!, points);
      const end = isMain ? 0 : levelAt(water.to!, endPoint);
      const distances = lengths(points),
        total = distances[distances.length - 1];
      const start =
        c.plan.parameters.globalElevation !== undefined
          ? Math.max(end + 1, baseHeight(points[0]) - 2)
          : end + Math.max(2, Math.min(22, total * 0.018)) * (c.edits[water.id]?.height ?? 1);
      register(water, points, start, end, width);
      const port = isMain ? `${water.id}-mouth` : `${water.id}-join`;
      data.ports.push({
        id: port,
        ownerId: isMain ? water.id : water.to!,
        kind: "water",
        position: endPoint,
        height: end,
        width,
        surfaceId: isMain ? "ocean" : `${water.to}-water`
      });
      data.relations.push({
        id: `${water.id}-flows`,
        kind: "flows",
        owners: [water.id, water.to!],
        ports: [port],
        required: true
      });
      if (!isMain) {
        const source = `${water.id}-source`;
        data.ports.push({
          id: source,
          ownerId: water.id,
          kind: "water",
          position: points[0],
          height: start,
          width,
          surfaceId: `${water.id}-water`
        });
      }
    }
  }
}
