import { connectorBlock, unionRectangles } from "./ComposedShape";
import { compileRegion } from "./WorldShapeGrowth";
import type { WorldLayoutContext } from "./WorldLayoutPlanner";
/** Reserve a river-associated valley before the mountain owner places its solid bodies.
 * @param c Transaction context containing resolved water geometry.
 */
export function proposeWorldValleys(c: WorldLayoutContext): void {
  const data = c.plan.planning;
  if (!data || c.parameters.draftLayout) return;
  const rivers = c.plan.waters.filter((w) => w.kind === "river" && !w.id.includes("branch"));
  for (const [index, water] of rivers.entries()) {
    const id = index === 0 ? "valley-main" : `valley-${index}`,
      points = water.centerline!;
    if (c.plan.structures?.some((s) => s.id === id)) continue;
    const width = (c.parameters.riverWidth + 70 + 80 * c.parameters.openness) * (c.edits[id]?.width ?? 1);
    // Only interior river segments own a valley; the estuary remains a separate shore space.
    const subset = points.slice(0, -1);
    if (subset.length < 2) continue;
    const recipe = {
      id,
      label: "河谷空间",
      rounding: width * 0.15,
      blocks: subset.slice(1).map((p, i) => connectorBlock(`${id}-${i}`, subset[i], p, width))
    };
    let outline;
    try {
      outline = compileRegion(recipe);
    } catch {
      outline = water.outline;
    }
    data.modules.push({
      id,
      optional: !c.edits[id],
      kind: "valley",
      outline,
      dependencies: [water.id],
      requested: { width: c.edits[id]?.width ?? 1, bend: c.edits[id]?.bend ?? 0.5 },
      resolved: { width }
    });
    data.reservations.push({ id: `${id}-floor`, ownerId: id, kind: "valley", outline, relatedIds: [water.id] });
    data.relations.push({ id: `${id}-water`, kind: "contains", owners: [id, water.id], ports: [], required: true });
  }
}

import type { IslandPlan, PlanPoint, PlanRock } from "./IslandPlanModel";
import type { PlanningCheck, PlanningModule } from "./WorldPlanningContract";
import { samplePlanningGround } from "./WorldPlanningTerrain";
import { inRing, segmentGap, validRing } from "./WorldPlanningGeometry";
/** Explicit planning-only valley criteria; these are not character traversal capabilities. */
export const PLANNING_VALLEY = {
  sampleSpacing: 8,
  minLength: 24,
  maxBankDistance: 320,
  minRelief: 12,
  bankClearance: 12
};
interface Section {
  point: PlanPoint;
  left: PlanRock;
  right: PlanRock;
  leftGap: number;
  rightGap: number;
  leftRelief: number;
  rightRelief: number;
}
/** Intersection of a polygon with the local normal ray, measured from the river center. */
function crossSection(ring: PlanPoint[], p: PlanPoint, tangent: PlanPoint): [number, number] | undefined {
  const normal = { x: -tangent.z, z: tangent.x },
    hits: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      u = (a.x - p.x) * tangent.x + (a.z - p.z) * tangent.z,
      v = (b.x - p.x) * tangent.x + (b.z - p.z) * tangent.z;
    if (Math.abs(u) < 1e-7) hits.push((a.x - p.x) * normal.x + (a.z - p.z) * normal.z);
    if (u * v < 0) {
      const t = u / (u - v);
      hits.push((a.x + (b.x - a.x) * t - p.x) * normal.x + (a.z + (b.z - a.z) * t - p.z) * normal.z);
    }
  }
  return hits.length >= 2 ? [Math.min(...hits), Math.max(...hits)] : undefined;
}
function tangentAt(p: PlanPoint, line: PlanPoint[]): PlanPoint {
  let tangent = { x: 1, z: 0 },
    best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      d = segmentGap(p, a, b),
      length = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < best && length > 0) {
      best = d;
      tangent = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
    }
  }
  return tangent;
}
function section(plan: IslandPlan, module: PlanningModule, p: PlanPoint, allRocks: boolean): Section | undefined {
  const water = plan.waters.find((w) => module.dependencies.includes(w.id) && w.kind === "river");
  if (!water?.centerline) return;
  const tangent = tangentAt(p, water.centerline),
    waterRange = crossSection(water.outline, p, tangent);
  if (
    !waterRange ||
    !inRing(p, plan.land) ||
    !inRing(p, water.outline) ||
    Math.min(...water.centerline.slice(1).map((b, i) => segmentGap(p, water.centerline![i], b))) > 0.05
  )
    return;
  const ground = samplePlanningGround(plan, p);
  let left: { rock: PlanRock; distance: number; relief: number } | undefined, right: typeof left;
  for (const rock of plan.rocks) {
    if (!allRocks && !module.dependencies.includes(rock.groupId)) continue;
    const interval = crossSection(rock.obb, p, tangent);
    if (!interval) continue;
    const relief = (rock.baseHeight ?? NaN) + rock.height - ground;
    if (!Number.isFinite(relief) || relief < PLANNING_VALLEY.minRelief) continue;
    if (interval[1] < waterRange[0] - PLANNING_VALLEY.bankClearance) {
      const distance = -interval[1];
      if (distance <= PLANNING_VALLEY.maxBankDistance && (!left || distance < left.distance))
        left = { rock, distance, relief };
    }
    if (interval[0] > waterRange[1] + PLANNING_VALLEY.bankClearance) {
      const distance = interval[0];
      if (distance <= PLANNING_VALLEY.maxBankDistance && (!right || distance < right.distance))
        right = { rock, distance, relief };
    }
  }
  if (left && right)
    return {
      point: p,
      left: left.rock,
      right: right.rock,
      leftGap: left.distance,
      rightGap: right.distance,
      leftRelief: left.relief,
      rightRelief: right.relief
    };
}
function measureSections(
  plan: IslandPlan,
  module: PlanningModule,
  allRocks: boolean
): (p: PlanPoint) => Section | undefined {
  const cache = new Map<string, Section | undefined>();
  return (p) => {
    const key = `${p.x},${p.z}`;
    if (!cache.has(key)) cache.set(key, section(plan, module, p, allRocks));
    return cache.get(key);
  };
}
function supportedBetween(
  plan: IslandPlan,
  module: PlanningModule,
  a: PlanPoint,
  b: PlanPoint,
  allRocks: boolean,
  measure: (p: PlanPoint) => Section | undefined
): boolean {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length2 = dx * dx + dz * dz;
  if (!length2) return !!measure(a);
  const first = measure(a),
    last = measure(b);
  if (!first || !last) return false;
  const stable = first.left === last.left && first.right === last.right;
  const cuts = [0, 1];
  // Rectangle projection events partition every possible bank appearance/disappearance, including narrow gaps.
  for (const rock of stable ? [first.left, first.right] : plan.rocks)
    if (allRocks || module.dependencies.includes(rock.groupId))
      for (const p of rock.obb) {
        const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2;
        if (t > 0 && t < 1) cuts.push(t);
      }
  cuts.sort((a, b) => a - b);
  for (let i = 1; i < cuts.length; i++)
    for (const t of [cuts[i - 1], (cuts[i - 1] + cuts[i]) / 2, cuts[i]])
      if (!measure({ x: a.x + dx * t, z: a.z + dz * t })) return false;
  return true;
}
function riverSamples(line: PlanPoint[]): PlanPoint[] {
  const out: PlanPoint[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / PLANNING_VALLEY.sampleSpacing));
    for (let j = i === 1 ? 0 : 1; j <= count; j++) {
      const t = j / count;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}
const pathLength = (points: PlanPoint[]) =>
  points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.z - points[i].z), 0);
/** Resolve broad valley proposals to continuous local river stretches with real opposing banks.
 * @param plan Candidate after rock grounding. Updates valley-owned extents, profiles and relations.
 */
export function finalizeWorldValleys(plan: IslandPlan): void {
  const data = plan.planning;
  if (!data) return;
  for (const module of data.modules.filter((m) => m.kind === "valley")) {
    const water = plan.waters.find((w) => module.dependencies.includes(w.id) && w.kind === "river");
    if (!module.optional && !data.requiredIds.includes(module.id)) data.requiredIds.push(module.id);
    data.profiles = data.profiles.filter((p) => p.id !== `${module.id}-ground`);
    data.relations = data.relations.filter((r) => !(r.kind === "frames" && r.owners.includes(module.id)));
    const measure = measureSections(plan, module, true);
    let longest: Section[] = [],
      run: Section[] = [],
      runLength = 0,
      longestLength = 0;
    for (const p of water?.centerline ? riverSamples(water.centerline) : []) {
      const found = measure(p);
      if (found) {
        if (run.length && !supportedBetween(plan, module, run[run.length - 1].point, p, true, measure)) {
          run = [];
          runLength = 0;
        }
        if (run.length) runLength += Math.hypot(p.x - run[run.length - 1].point.x, p.z - run[run.length - 1].point.z);
        run.push(found);
      } else {
        run = [];
        runLength = 0;
      }
      if (runLength > longestLength) {
        longest = run;
        longestLength = runLength;
      }
    }
    const length = pathLength(longest.map((s) => s.point));
    module.dependencies = water ? [water.id] : [];
    if (length < PLANNING_VALLEY.minLength) {
      module.resolved = { ...module.resolved, length: 0 };
      continue;
    }
    // A valley organization extent spans both actual bank feet; its source remains connected rectangles.
    const centers = longest
      .map((s) => s.point)
      .filter((p, i, points) => {
        if (i === 0 || i === points.length - 1) return true;
        const a = points[i - 1],
          b = points[i + 1],
          cross = (p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x);
        return Math.abs(cross) > 1e-6;
      });
    // Organization range encloses both measured banks. Keep a stable width and the true river bends;
    // per-sample left/right switches otherwise create zigzag rectangle unions unrelated to valley shape.
    const extentWidth = 2 * Math.max(...longest.flatMap((s) => [s.leftGap, s.rightGap]));
    const blocks = centers.slice(1).map((p, i) => {
      const block = connectorBlock(`${module.id}-resolved-${i}`, centers[i], p, extentWidth);
      block.length = Math.hypot(p.x - centers[i].x, p.z - centers[i].z) + PLANNING_VALLEY.sampleSpacing;
      return block;
    });
    let outline: PlanPoint[];
    try {
      outline = compileRegion({ id: module.id, label: "实际两岸河谷", rounding: 0, blocks });
      // A very wide, short valley can have its measured centerline endpoints cut
      // off by the generic Bezier corner tangents. Preserve the actual rectangle
      // extent in that case; never discard the valid bank measurements to fit it.
      if (!longest.every((section) => inRing(section.point, outline))) {
        const rings = unionRectangles(blocks, 1e-10);
        if (rings.length !== 1) throw new Error("河谷矩形范围不连通");
        outline = rings[0];
      }
    } catch {
      module.resolved = { ...module.resolved, length: 0 };
      continue;
    }
    // Narrow bank handovers can occur between the regular 8m samples. Retain
    // those actual witnesses as dependencies too, so the independent audit sees
    // exactly the same physical banks that established the continuous run.
    const witnesses = new Map<string, PlanRock>();
    const witnessMeasure = (p: PlanPoint) => {
      const found = measure(p);
      if (found) {
        witnesses.set(found.left.id, found.left);
        witnesses.set(found.right.id, found.right);
      }
      return found;
    };
    for (const section of longest) witnessMeasure(section.point);
    for (let i = 1; i < longest.length; i++)
      supportedBetween(plan, module, longest[i - 1].point, longest[i].point, true, witnessMeasure);
    module.outline = outline;
    module.dependencies.push(...new Set([...witnesses.values()].map((rock) => rock.groupId)));
    module.resolved = {
      ...module.resolved,
      length,
      width: Math.min(...longest.map((s) => s.leftGap + s.rightGap)),
      minRelief: Math.min(...longest.flatMap((s) => [s.leftRelief, s.rightRelief]))
    };
    const reservation = data.reservations.find((r) => r.ownerId === module.id && r.kind === "valley");
    if (reservation) {
      reservation.outline = outline;
      reservation.relatedIds = [...module.dependencies];
    }
    data.profiles.push({
      id: `${module.id}-ground`,
      ownerId: module.id,
      kind: "ground",
      points: longest.map((s) => ({ ...s.point, y: samplePlanningGround(plan, s.point) })),
      width: module.resolved.width,
      supportIds: [...witnesses.keys()]
    });
    for (const id of module.dependencies.filter((id) => id !== water!.id))
      data.relations.push({
        id: `${id}-${module.id}-frames`,
        kind: "frames",
        owners: [id, module.id],
        ports: [],
        required: true
      });
  }
  const absent = data.modules
    .filter(
      (m) => m.kind === "valley" && m.optional && !data.profiles.some((p) => p.ownerId === m.id && p.kind === "ground")
    )
    .map((m) => m.id);
  if (absent.length) {
    data.modules = data.modules.filter((m) => !absent.includes(m.id));
    data.reservations = data.reservations.filter((r) => !absent.includes(r.ownerId));
    data.relations = data.relations.filter((r) => !r.owners.some((id) => absent.includes(id)));
    data.adjustments.push({ owners: absent, reason: "当前河段未形成两岸围合，不将普通河道标作河谷" });
  }
}
/** Independently remeasure the published local valley, without accepting generated success metadata.
 * @param plan Resolved candidate snapshot.
 * @returns Required T02 evidence with actual length and bank criteria.
 */
export function auditPlanningValleys(plan: IslandPlan): PlanningCheck[] {
  const data = plan.planning;
  if (!data) return [];
  return data.modules
    .filter((m) => m.kind === "valley")
    .map((module) => {
      const profile = data.profiles.find((p) => p.ownerId === module.id && p.kind === "ground"),
        water = plan.waters.find((w) => module.dependencies.includes(w.id) && w.kind === "river");
      const points = profile?.points ?? [],
        length = pathLength(points),
        measure = measureSections(plan, module, false);
      let pass =
        validRing(module.outline) &&
        !!water?.centerline &&
        points.length >= 2 &&
        length >= PLANNING_VALLEY.minLength &&
        points.every((p) => inRing(p, module.outline) && Math.abs(p.y - samplePlanningGround(plan, p)) < 0.01);
      for (let i = 1; i < points.length && pass; i++) {
        const a = points[i - 1],
          b = points[i],
          n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / PLANNING_VALLEY.sampleSpacing));
        for (let j = 0; j <= n; j++) {
          const t = j / n,
            p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
          if (!measure(p)) {
            pass = false;
            break;
          }
        }
        if (pass && !supportedBetween(plan, module, a, b, false, measure)) pass = false;
      }
      return {
        id: `audit-valley-${module.id}`,
        rule: "T02",
        owners: [module.id, ...module.dependencies],
        status: pass ? "pass" : "fail",
        required: true,
        message: `局部河谷需连续 ${PLANNING_VALLEY.minLength} 米，两岸实体距河心不超过 ${PLANNING_VALLEY.maxBankDistance} 米且高于谷底 ${PLANNING_VALLEY.minRelief} 米`,
        position: points[0] ?? module.outline[0],
        measured: length,
        limit: PLANNING_VALLEY.minLength
      };
    });
}
