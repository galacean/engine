import { planStudyLandforms } from "./WorldStudyLandforms";
import { planCanyon } from "./WorldCanyonStructure";
import { mountainDensityFootprints } from "./WorldMountainFootprint";
import { generateWorldLookout } from "./WorldLookout";
import { editFootprints, activePlacement } from "./WorldEditPlacement";
import { createMountainChain } from "./WorldMountainChain";
import { refineShapeBoundary, unionRectangles } from "./ComposedShape";
import { envelope, slopeBand } from "./IslandPlanAtoms";
import { pointInPolygon } from "../geometry/V2Geometry";
import type { IslandPlan, PlanPoint, PlanRock } from "./IslandPlanModel";
import {
  WORLD_LAYOUT_CONTROLS,
  WORLD_LAYOUT_DEFAULTS,
  type WorldLayoutParameters,
  type WorldObjectEdits,
  type WorldLayoutResult
} from "./WorldLayoutModel";
import { planWorldDomain as planLandDomain } from "./WorldLandDomain";
import { generateWorldWater } from "./WorldLayoutWater";
import { generateWorldOpenSpaces } from "./WorldOpenSpaces";
import { generateWorldPlaces } from "./WorldLayoutPlaces";
import { buildIslandRocks } from "./WorldIslandRocks";
import { buildWorldRoutes } from "./WorldLayoutRoutes";

import { createPlanningData } from "./WorldPlanningContract";
import { finalizePlanningTerrain } from "./WorldPlanningTerrain";
import { proposePlanningModule } from "./WorldPlanningExecution";
import { proposeWorldValleys } from "./WorldPlanningValley";
import { contains, ringArea, segmentGap } from "./WorldPlanningGeometry";
const WORLD = 2048;
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const hash = (seed: number, key: string) => {
  let h = seed | 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function segmentDistance(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
function ringDistance(p: PlanPoint, ring: PlanPoint[]): number {
  if (pointInPolygon(p, ring)) return 0;
  return Math.min(...ring.map((a, i) => segmentDistance(p, a, ring[(i + 1) % ring.length])));
}
const boundsCache = new WeakMap<PlanPoint[], { x0: number; x1: number; z0: number; z1: number }>();
function bounds(r: PlanPoint[]) {
  let b = boundsCache.get(r);
  if (!b) {
    b = {
      x0: Math.min(...r.map((p) => p.x)),
      x1: Math.max(...r.map((p) => p.x)),
      z0: Math.min(...r.map((p) => p.z)),
      z1: Math.max(...r.map((p) => p.z))
    };
    boundsCache.set(r, b);
  }
  return b;
}
function nearRing(p: PlanPoint, r: PlanPoint[], range: number): boolean {
  const b = bounds(r);
  if (p.x < b.x0 - range || p.x > b.x1 + range || p.z < b.z0 - range || p.z > b.z1 + range) return false;
  return ringDistance(p, r) < range;
}
function intersects(a: PlanPoint[], b: PlanPoint[]): boolean {
  const aa = bounds(a),
    bb = bounds(b);
  if (aa.x1 < bb.x0 || bb.x1 < aa.x0 || aa.z1 < bb.z0 || bb.z1 < aa.z0) return false;
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return true;
  const cross = (a: PlanPoint, b: PlanPoint, c: PlanPoint) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      const p = a[i],
        q = a[(i + 1) % a.length],
        r = b[j],
        s = b[(j + 1) % b.length];
      if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0) return true;
    }
  return false;
}
/** Shared module inputs and spatial facts; candidate data is private to one generation transaction. */
export interface WorldLayoutContext {
  parameters: WorldLayoutParameters;
  edits: WorldObjectEdits;
  plan: IslandPlan;
  notes: string[];
  frame: { width: number; length: number; angle: number; center?: PlanPoint };
  reservations: { a: PlanPoint; b: PlanPoint; width: number }[];
  random(key: string): number;
  position(x: number, z: number): PlanPoint;
}
/** A plug-in declares dependencies and writes its owned spatial records into the candidate plan. */
export interface WorldLayoutModule {
  id: string;
  requires: readonly string[];
  run(context: WorldLayoutContext): void;
}
/** Historical full-world composition keeps its island content outside the land owner. */
export function planWorldDomain(c: WorldLayoutContext, options: { islandContent?: boolean } = {}): void {
  planLandDomain(c);
  if (options.islandContent === false) return;
  for (const region of c.plan.regions.filter((region) => region.kind === "island")) {
    const { id, outline } = region;
    const islandRocks = buildIslandRocks(id, outline, c.random);
    c.plan.rocks.push(...islandRocks);
    if (islandRocks.length) {
      const densityOutlines = mountainDensityFootprints(islandRocks, outline, []);
      c.plan.mountains.push({
        id,
        label: region.label.replace("离岸岛", "离岛山群"),
        offshore: true,
        outline: densityOutlines[0],
        outlines: densityOutlines,
        densityOutlines,
        rockIds: islandRocks.map((r) => r.id)
      });
    }
    const islandModule = c.plan.planning?.modules.find((m) => m.id === id);
    if (islandModule) {
      islandModule.memberIds = islandRocks.map((r) => r.id);
      islandModule.resolved.rocks = islandRocks.length;
      islandModule.resolved.height = Math.max(0, ...islandRocks.map((r) => r.height));
    }
    if (!islandRocks.length) c.notes.push(`${region.label}内部暂无足够空间布置岩石组`);
  }
}

function landforms(c: WorldLayoutContext): void {
  if (c.parameters.landformStudy) {
    planStudyLandforms(c);
    return;
  }
  planCanyon(c);
  if (c.parameters.canyonStudy) return;
  const q = c.parameters,
    sites: PlanPoint[] = [];
  let releasedOpen = false,
    ignoreOpen = false;
  const openAreas = c.plan.planning?.reservations.filter((r) => r.kind === "open").map((r) => r.outline) ?? [];
  for (let z = 160; z < 1900; z += 70)
    for (let x = 160; x < 1900; x += 70) if (pointInPolygon({ x, z }, c.plan.land)) sites.push({ x, z });
  let editingMountain = false;
  const clear = (obb: PlanPoint[], at: PlanPoint) => {
    if ((!c.plan.planning && distance(at, c.plan.spawn) < 100) || !contains(c.plan.land, obb)) return false;
    if (c.plan.waters.some((w) => intersects(obb, w.outline) || obb.some((p) => nearRing(p, w.outline, 18))))
      return false;
    if (
      c.plan.regions.some(
        (r) =>
          (r.kind === "village" || r.kind === "teleport") &&
          (intersects(obb, r.outline) || obb.some((p) => nearRing(p, r.outline, 20)))
      )
    )
      return false;
    // Provisional road corridors yield to the edited mountain; final routes avoid its resolved rocks.
    if (
      !editingMountain &&
      c.reservations.some(
        (r) =>
          obb.some((p) => segmentDistance(p, r.a, r.b) < r.width) ||
          intersects(
            obb,
            envelope(
              { x: (r.a.x + r.b.x) / 2, z: (r.a.z + r.b.z) / 2 },
              r.width,
              distance(r.a, r.b),
              Math.atan2(r.b.z - r.a.z, r.b.x - r.a.x) - Math.PI / 2
            )
          )
      )
    )
      return false;
    if (!ignoreOpen && openAreas.some((area) => intersects(obb, area))) return false;
    if (c.plan.rocks.some((r) => intersects(obb, r.obb))) return false;
    return true;
  };
  for (const i of Array.from({ length: q.mountains }, (_, i) => i).sort(
    (a, b) => Number(!!c.edits[`mountain-${b}`]?.placement) - Number(!!c.edits[`mountain-${a}`]?.placement)
  )) {
    if (c.plan.mountains.some((m) => m.id === `mountain-${i}`)) continue;
    const id = `mountain-${i}`,
      baseWidth = q.mountainWidth * (0.65 + c.random(`${id}-scale`) * 0.8),
      baseHeight = q.mountainHeight * (0.65 + c.random(`${id}-prominence`) * 0.85);
    editingMountain = activePlacement(c.edits, id);
    const requested = baseWidth * Math.sqrt(c.edits[id]?.size ?? 1);
    const rivers = c.plan.waters.filter((w) => w.kind === "river" && !w.id.includes("branch"));
    const valleyWater = rivers[(i < 2 ? 0 : i - 2) % Math.max(1, rivers.length)],
      line = valleyWater?.centerline;
    const valleyAngle =
      line && line.length > 1
        ? Math.atan2(line.at(-1)!.z - line[0].z, line.at(-1)!.x - line[0].x)
        : (c.plan.parameters.elevationAngle ?? 0) + Math.PI / 2;
    const axisAngle = valleyAngle;
    c.plan.planning?.requiredIds.push(id);
    const prototype = createMountainChain({
      id,
      span: requested * (i < 2 ? 2.2 : 1.8),
      width: requested * (i < 2 ? 0.7 : 0.9),
      angle: i < 2 ? 0 : axisAngle,
      count: Math.max(5, Math.round(q.complexity * (c.edits[id]?.size ?? 1))),
      random: c.random
    });
    const water = valleyWater;
    const channel = water?.centerline;
    const valleyWidth = 80 * (c.edits["valley-main"]?.width ?? 1);
    const arc = [0];
    for (let j = 1; j < (channel?.length ?? 0); j++) arc.push(arc[j - 1] + distance(channel![j - 1], channel![j]));
    const riverAt = (travel: number) => {
      let j = 1;
      while (j < arc.length - 1 && arc[j] < travel) j++;
      const a = channel![j - 1],
        b = channel![j],
        len = arc[j] - arc[j - 1],
        t = (travel - arc[j - 1]) / (len || 1);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, angle: Math.atan2(b.z - a.z, b.x - a.x) };
    };
    const score = (p: PlanPoint) => {
      if (!c.plan.planning) return c.random(`${id}-${p.x}-${p.z}`);
      if (!channel) {
        const previous = c.plan.rocks.filter((r) => r.role === "peak" && !r.groupId.startsWith("offshore-"));
        const separation = previous.length ? Math.min(...previous.map((r) => distance(p, r.center))) : 500;
        return -Math.min(separation, 600) / 600 + c.random(`${id}-${p.x}-${p.z}`) * 0.1;
      }
      const riverDistance = Math.min(...channel.slice(1).map((v, k) => segmentDistance(p, channel[k], v)));
      const a = channel[0],
        b = channel[Math.max(1, channel.length - 2)],
        side = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
      const sidePenalty = i < 2 && ((i % 2 === 0 && side < 0) || (i % 2 === 1 && side > 0)) ? 10 : 0;
      if (i >= 2) {
        const previous = c.plan.mountains
          .map((g) => c.plan.rocks.find((r) => r.groupId === g.id && r.role === "peak"))
          .filter(Boolean);
        const separation = previous.length
          ? Math.min(...previous.map((r) => Math.hypot(p.x - r!.center.x, p.z - r!.center.z)))
          : 600;
        const desiredDistance = q.riverWidth / 2 + valleyWidth / 2 + requested * 0.55 + Math.floor(i / 2) * 100;
        const upstream = channel[0];
        if (i < 2 + rivers.length) {
          const heading = c.plan.parameters.elevationAngle ?? -Math.PI / 2,
            up = (p.x - upstream.x) * Math.cos(heading) + (p.z - upstream.z) * Math.sin(heading);
          const footDistance = q.lakeSize + requested * 0.45;
          return (
            Math.abs(Math.hypot(p.x - upstream.x, p.z - upstream.z) - footDistance) / 180 +
            Math.max(0, -up) / 100 +
            c.random(`${id}-${p.x}-${p.z}`) * 0.04
          );
        }
        return (
          Math.abs(riverDistance - desiredDistance) / 400 +
          Math.hypot(p.x - upstream.x, p.z - upstream.z) / 1800 -
          Math.min(separation, 500) / 1000 +
          c.random(`${id}-${p.x}-${p.z}`) * 0.08
        );
      }
      return (
        sidePenalty +
        Math.abs(riverDistance - (q.riverWidth / 2 + valleyWidth / 2 + requested * 0.35 + 24)) / 600 +
        c.random(`${id}-${p.x}-${p.z}`) * 0.25
      );
    };
    const valleyScale = c.edits["valley-main"]?.width ?? 1;
    const candidates =
      channel && valleyScale !== 1
        ? sites.map((p) => {
            let nearest = p,
              best = Infinity;
            for (let j = 1; j < channel.length; j++) {
              const a = channel[j - 1],
                b = channel[j],
                dx = b.x - a.x,
                dz = b.z - a.z,
                t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))),
                q = { x: a.x + t * dx, z: a.z + t * dz },
                d = distance(p, q);
              if (d < best) {
                best = d;
                nearest = q;
              }
            }
            const shift = 40 * (valleyScale - 1);
            return {
              x: p.x + ((p.x - nearest.x) / (best || 1)) * shift,
              z: p.z + ((p.z - nearest.z) / (best || 1)) * shift
            };
          })
        : sites;
    const ordered = candidates
      .map((p) => ({ p, score: score(p) }))
      .sort((a, b) => a.score - b.score)
      .map((v) => v.p);
    // The second bank is a cooperating landform: prioritize the actual local
    // cross-section opposite the first mountain, rather than a global river chord.
    // All complete mountain candidates still go through the same occupancy checks.
    const firstBank =
      i === 1 ? c.plan.rocks.find((rock) => rock.groupId === "mountain-0" && rock.role === "peak") : undefined;
    const paired: PlanPoint[] = [];
    if (c.plan.planning && channel && firstBank) {
      const sections = channel
        .slice(1)
        .map((b, j) => {
          const a = channel[j],
            dx = b.x - a.x,
            dz = b.z - a.z,
            len = Math.hypot(dx, dz),
            t = Math.max(
              0.15,
              Math.min(0.85, ((firstBank.center.x - a.x) * dx + (firstBank.center.z - a.z) * dz) / (len * len || 1))
            ),
            p = { x: a.x + dx * t, z: a.z + dz * t };
          return { p, dx: dx / (len || 1), dz: dz / (len || 1), gap: distance(p, firstBank.center) };
        })
        .sort((a, b) => a.gap - b.gap)
        .slice(0, 3);
      for (const section of sections) {
        const side =
          Math.sign(
            section.dx * (firstBank.center.z - section.p.z) - section.dz * (firstBank.center.x - section.p.x)
          ) || 1;
        for (const offset of [0, -24, 24, -48, 48])
          for (const gap of [q.riverWidth / 2 + valleyWidth / 2 + requested * 0.35 + 24, 90, 130, 180])
            paired.push({
              x: section.p.x + section.dx * offset + section.dz * gap * side,
              z: section.p.z + section.dz * offset - section.dx * gap * side
            });
      }
    }
    let chosen: PlanRock[] = [],
      resolvedFactor = 1,
      chosenOrigin = { x: 0, z: 0 };
    // Open-space intent is reallocated around landforms; it must not force every
    // mountain into the same leftover corner before the terrain can be placed.
    for (const releaseOpen of [true]) {
      ignoreOpen = releaseOpen;
      for (const pool of activePlacement(c.edits, id)
        ? [[c.edits[id].placement!.origin]]
        : paired.length
          ? [paired, ordered]
          : [ordered]) {
        for (const factor of [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.5, 0.4, 0.25, 0.15]) {
          const turn = 0;
          const relative = prototype.blocks.map((b) => ({
            ...b,
            x: (b.x * Math.cos(turn) - b.z * Math.sin(turn)) * factor,
            z: (b.x * Math.sin(turn) + b.z * Math.cos(turn)) * factor,
            width: b.width * factor,
            length: b.length * factor,
            yaw: b.yaw + (turn * 180) / Math.PI
          }));
          for (const site of pool) {
            let bank: { arc: number; offset: number } | undefined;
            if (i < 2 && channel && channel.length > 1) {
              let best = Infinity;
              for (let k = 1; k < channel.length; k++) {
                const a = channel[k - 1],
                  b = channel[k],
                  dx = b.x - a.x,
                  dz = b.z - a.z,
                  len = arc[k] - arc[k - 1],
                  t = Math.max(0, Math.min(1, ((site.x - a.x) * dx + (site.z - a.z) * dz) / (len * len || 1))),
                  p = { x: a.x + dx * t, z: a.z + dz * t },
                  gap = distance(site, p);
                if (gap < best) {
                  best = gap;
                  bank = {
                    arc: arc[k - 1] + t * len,
                    offset: ((site.z - p.z) * dx - (site.x - p.x) * dz) / (len || 1)
                  };
                }
              }
              if (!editingMountain && relative.some((b) => bank!.arc + b.x < 0 || bank!.arc + b.x > arc.at(-1)!))
                continue;
            }
            const rocks: PlanRock[] = [];
            // Local growth retains its anchor and follows the local bank tangent; remapping
            // every rock onto a newly resolved river bend can compress the requested growth.
            for (let j = 0; j < relative.length; j++) {
              const b = relative[j],
                anchored = editingMountain && bank,
                heading = anchored ? riverAt(bank!.arc).angle : 0,
                sample = bank && !anchored ? riverAt(bank.arc + b.x) : undefined,
                w = b.width,
                d = b.length,
                yaw = (b.yaw * Math.PI) / 180 + (sample?.angle ?? heading);
              let at = sample
                ? {
                    x: sample.x - Math.sin(sample.angle) * (bank!.offset + b.z),
                    z: sample.z + Math.cos(sample.angle) * (bank!.offset + b.z)
                  }
                : {
                    x: site.x + b.x * Math.cos(heading) - b.z * Math.sin(heading),
                    z: site.z + b.x * Math.sin(heading) + b.z * Math.cos(heading)
                  };
              let obb = envelope(at, w, d, yaw);
              if (activePlacement(c.edits, id) && !clear(obb, at)) {
                const source = { ...at };
                for (const amount of [0.08, 0.16, 0.24, 0.32]) {
                  const inward = {
                    x: source.x + (site.x - source.x) * amount,
                    z: source.z + (site.z - source.z) * amount
                  };
                  const candidate = envelope(inward, w, d, yaw);
                  if (clear(candidate, inward)) {
                    at = inward;
                    obb = candidate;
                    break;
                  }
                }
              }
              if (!clear(obb, at) || editFootprints(c.edits, id).some((r) => intersects(obb, r))) break;
              const outline = [
                [-0.4, -0.46],
                [0.08, -0.48],
                [0.43, -0.29],
                [0.47, 0.1],
                [0.27, 0.44],
                [-0.13, 0.47],
                [-0.46, 0.23],
                [-0.43, -0.15]
              ].map(([u, v]) => ({
                x: at.x + u * w * Math.cos(yaw) - v * d * Math.sin(yaw),
                z: at.z + u * w * Math.sin(yaw) + v * d * Math.cos(yaw)
              }));
              const rank = j === 0 ? 0 : Math.ceil(j / 2),
                height =
                  baseHeight *
                  (c.edits[id]?.height ?? 1) *
                  (j === 0 ? 1 : Math.max(0.2, 0.88 - rank * 0.12) * (0.9 + c.random(`${id}-height-${j}`) * 0.15));
              rocks.push({
                id: `${id}-rock-${j}`,
                groupId: id,
                center: at,
                width: w,
                depth: d,
                yaw,
                height,
                role: j === 0 ? "peak" : rank >= 4 ? "skirt" : rank >= 2 ? "shoulder" : "wall",
                obb,
                outline
              });
            }
            if (rocks.length === prototype.blocks.length) {
              // Offset river bends must not compress an entire bank back into one heap.
              const blocks = rocks.map((r) => ({
                id: r.id,
                x: r.center.x,
                z: r.center.z,
                width: r.width,
                length: r.depth,
                yaw: (r.yaw * 180) / Math.PI
              }));
              const area = rocks.reduce((sum, r) => sum + r.width * r.depth, 0),
                union = unionRectangles(blocks).reduce((sum, ring) => sum + ringArea(ring), 0);
              if (1 - union / area > 0.24) continue;
              chosen = rocks;
              chosenOrigin = site;
              resolvedFactor = factor;
              break;
            }
          }
          if (chosen.length) break;
        }
        if (chosen.length) break;
      }
      if (chosen.length) {
        if (releaseOpen) releasedOpen = true;
        break;
      }
    }
    ignoreOpen = false;
    if (!chosen.length) {
      c.notes.push(`山群 ${i + 1}暂无可用空间`);
      continue;
    }
    if (resolvedFactor < 1) c.notes.push(`山群 ${i + 1}厚度协调为 ${(requested * resolvedFactor).toFixed(0)} 米`);
    const recipe = {
      id,
      label: `山群 ${i + 1}`,
      rounding: prototype.rounding * resolvedFactor,
      blocks: chosen.map((r) => ({
        id: `${r.id}-footprint`,
        ...r.center,
        width: r.width,
        length: r.depth,
        yaw: (r.yaw * 180) / Math.PI
      }))
    };
    const outlines = unionRectangles(recipe.blocks).sort((a, b) => ringArea(b) - ringArea(a)),
      outline = outlines[0];
    const sumArea = chosen.reduce((sum, r) => sum + r.width * r.depth, 0),
      unionArea = outlines.reduce((sum, r) => sum + ringArea(r), 0);
    const mean = {
      x: chosen.reduce((sum, r) => sum + r.center.x, 0) / chosen.length,
      z: chosen.reduce((sum, r) => sum + r.center.z, 0) / chosen.length
    };
    const xx = chosen.reduce((sum, r) => sum + (r.center.x - mean.x) ** 2, 0),
      zz = chosen.reduce((sum, r) => sum + (r.center.z - mean.z) ** 2, 0),
      xz = chosen.reduce((sum, r) => sum + (r.center.x - mean.x) * (r.center.z - mean.z), 0),
      major = 0.5 * Math.atan2(2 * xz, xx - zz);
    const projected = chosen
      .flatMap((r) => r.obb)
      .map((p) => ({
        u: p.x * Math.cos(major) + p.z * Math.sin(major),
        v: -p.x * Math.sin(major) + p.z * Math.cos(major)
      }));
    const chainSpan = Math.max(...projected.map((p) => p.u)) - Math.min(...projected.map((p) => p.u)),
      transverseWidth = Math.max(...projected.map((p) => p.v)) - Math.min(...projected.map((p) => p.v));
    c.plan.shapeRecipes!.push(recipe);
    c.plan.rocks.push(...chosen);
    if (c.plan.planning) {
      c.plan.planning.modules.push({
        id,
        kind: "mountain",
        outline,
        outlines,
        dependencies: [
          "land-main",
          ...c.plan.waters.map((w) => w.id),
          ...c.plan.regions.filter((r) => r.kind === "village" || r.kind === "teleport").map((r) => r.id)
        ],
        requested: { size: c.edits[id]?.size ?? 1, height: c.edits[id]?.height ?? 1 },
        resolved: {
          originX: chosenOrigin.x,
          originZ: chosenOrigin.z,
          area: unionArea,
          rockCount: chosen.length,
          overlapFootprintRatio: Math.max(0, 1 - unionArea / sumArea),
          chainSpan,
          transverseWidth,
          chainAspect: chainSpan / transverseWidth,
          baseWidth,
          baseHeight,
          width: requested * resolvedFactor,
          height: Math.max(...chosen.map((r) => r.height))
        }
      });
      if (resolvedFactor < 1)
        c.plan.planning.adjustments.push({
          owners: [id],
          reason: "避让水域、场所及通行预留",
          requested,
          resolved: requested * resolvedFactor
        });
    }
    if (c.plan.planning) {
      const valley = c.plan.planning.modules.find((m) => m.kind === "valley");
      if (valley) {
        valley.dependencies.push(id);
        c.plan.planning.relations.push({
          id: `${id}-valley`,
          kind: "frames",
          owners: [id, valley.id],
          ports: [],
          required: true
        });
      }
    }
    const ridge = chosen
      .slice(0, Math.max(3, chosen.length - 2))
      .sort((a, b) => (a.center.x - b.center.x) * Math.cos(major) + (a.center.z - b.center.z) * Math.sin(major))
      .map((r) => ({ ...r.center, height: r.height * 0.18 }));
    const shoulderWidth = Math.max(40, transverseWidth * 1.6);
    const domainBlocks = ridge.map((p, j) => ({
      id: `${id}-shoulder-${j}`,
      x: p.x,
      z: p.z,
      width: shoulderWidth,
      length: shoulderWidth,
      yaw: (major * 180) / Math.PI
    }));
    for (let j = 1; j < ridge.length; j++) {
      const a = ridge[j - 1],
        b = ridge[j];
      domainBlocks.push({
        id: `${id}-ridge-${j}`,
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        width: distance(a, b) + shoulderWidth,
        length: shoulderWidth,
        yaw: (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI
      });
    }
    // Fit shoulder components to the real coast; retain every accepted solid even
    // when a concave shoreline separates the broader influence into several rings.
    const fitted =
      c.plan.parameters.globalElevation !== undefined
        ? []
        : domainBlocks.flatMap((block) => {
            for (let factor = 1; factor > 0.08; factor *= 0.75) {
              const candidate = { ...block, width: block.width * factor, length: block.length * factor };
              if (
                contains(
                  c.plan.land,
                  envelope({ x: block.x, z: block.z }, candidate.width, candidate.length, (block.yaw * Math.PI) / 180)
                )
              )
                return [candidate];
            }
            return [];
          });
    const domains =
        c.plan.parameters.globalElevation !== undefined
          ? outlines
          : unionRectangles([...recipe.blocks, ...fitted]).sort((a, b) => ringArea(b) - ringArea(a)),
      domain = domains[0];
    const densityOutlines = mountainDensityFootprints(chosen, c.plan.land, [
      ...c.plan.waters.map((w) => w.outline),
      ...c.plan.regions.map((r) => r.outline)
    ]);
    c.plan.mountains.push({
      id,
      label: `山群 ${i + 1}`,
      outline,
      outlines,
      densityOutlines,
      rockIds: chosen.map((r) => r.id),
      landform:
        c.plan.parameters.globalElevation !== undefined
          ? undefined
          : { ridge, width: shoulderWidth, outline: domain, outlines: domains }
    });
    c.plan.ridges.push({ id: `${id}-ridge`, groupId: id, points: ridge.map((p) => ({ x: p.x, z: p.z })) });
    const mountainModule = c.plan.planning?.modules.find((m) => m.id === id);
    if (mountainModule) {
      mountainModule.resolved.solidArea = unionArea;
      mountainModule.resolved.area = densityOutlines.reduce((sum, ring) => sum + ringArea(ring), 0);
      mountainModule.resolved.ridgeLength = ridge.slice(1).reduce((sum, p, j) => sum + distance(p, ridge[j]), 0);
    }
  }
  if (releasedOpen && c.plan.planning) {
    const data = c.plan.planning;
    data.modules = data.modules.filter((m) => m.id !== "open-spaces");
    data.reservations = data.reservations.filter((r) => r.kind !== "open");
    data.adjustments = data.adjustments.filter((a) => !a.owners.includes("open-spaces"));
    generateWorldOpenSpaces(c);
    data.adjustments.push({
      owners: ["open-spaces", ...c.plan.mountains.map((m) => m.id)],
      reason: "开敞意图在必要山地实际落位后重分配；保留水岸、场所与通行净空，按重算后真实面积报告容量"
    });
  }
}
/** Default serial dependency schedule; independent plug-ins may be added through the module argument. */
export const WORLD_LAYOUT_MODULES: readonly WorldLayoutModule[] = [
  { id: "domain", requires: [], run: planWorldDomain },
  { id: "water", requires: ["domain"], run: generateWorldWater },
  { id: "places", requires: ["water"], run: generateWorldPlaces },
  { id: "open", requires: ["places"], run: generateWorldOpenSpaces },
  { id: "landforms", requires: ["open"], run: landforms },
  { id: "lookout", requires: ["landforms"], run: generateWorldLookout },
  {
    id: "routes",
    requires: ["lookout"],
    run: (c) => {
      const notes = buildWorldRoutes(c.plan, c.parameters);
      if (notes) c.notes.push(...notes);
    }
  }
];
/** Builds a complete deterministic semantic layout using a replaceable dependency schedule.
 * @param overrides Global/module intent, independently seeded from each object's identity.
 * @param edits Local semantic object overrides.
 * @param modules Plug-in modules with explicit dependency identities.
 * @param onPreview Receives incomplete owned-stage geometry for explicitly unvalidated editing previews.
 * @returns Fresh snapshot and resolution notes; never mutates caller parameters.
 */
export function generateWorldLayout(
  overrides: Partial<WorldLayoutParameters> = {},
  edits: WorldObjectEdits = {},
  modules: readonly WorldLayoutModule[] = WORLD_LAYOUT_MODULES,
  planning = false,
  onPreview?: (plan: IslandPlan, stage: string) => void
): WorldLayoutResult {
  const parameters = { ...WORLD_LAYOUT_DEFAULTS, ...overrides };
  for (const control of WORLD_LAYOUT_CONTROLS)
    parameters[control.key] = Math.max(
      planning && control.key === "landSize" ? 0.2 : control.min,
      Math.min(
        control.max,
        Number.isFinite(parameters[control.key]) ? parameters[control.key] : WORLD_LAYOUT_DEFAULTS[control.key]
      )
    );
  for (const k of ["complexity", "islands", "rivers", "branches", "mountains", "villages", "buildings"] as const)
    parameters[k] = Math.round(parameters[k]);
  const plan: IslandPlan = {
    landformStudy: !!parameters.landformStudy,
    canyonStudy: !!parameters.canyonStudy,
    mode: "base-map",
    parameters: {
      globalElevation: parameters.globalElevation,
      elevationAngle: parameters.elevationAngle,
      width: WORLD,
      depth: WORLD,
      valleyWidth: parameters.openness,
      riverWidth: parameters.riverWidth,
      mountainHeight: parameters.mountainHeight,
      seed: parameters.seed
    },
    land: [],
    islands: [],
    rocks: [],
    mountains: [],
    waters: [],
    routes: [],
    places: [],
    bridges: [],
    sights: [],
    spawn: { x: 1024, z: 1024 },
    regions: [],
    buildings: [],
    ridges: [],
    supports: [],
    slopes: [],
    shapeRecipes: [],
    raster: { heightSamples: 1025, alphaSamples: 1024, spacing: 2 },
    prompt: "模块化山水、场所、通行规划"
  };
  if (planning) {
    plan.planning = createPlanningData();
    if (parameters.draftLayout) plan.planning.auditMode = "paused";
    if (parameters.villages > 0) plan.planning.requiredIds.push("village-0");
  }
  const context: WorldLayoutContext = {
    parameters: { ...parameters },
    edits,
    plan,
    notes: [],
    frame: { width: 0, length: 0, angle: 0 },
    reservations: [],
    random: (key) => hash(parameters.seed, key),
    position: (x, z) => ({
      x: (context.frame.center?.x ?? 1024) + x * Math.cos(context.frame.angle) - z * Math.sin(context.frame.angle),
      z: (context.frame.center?.z ?? 1024) + x * Math.sin(context.frame.angle) + z * Math.cos(context.frame.angle)
    })
  };
  const pending = [...modules],
    done = new Set<string>();
  while (pending.length) {
    const at = pending.findIndex((m) => m.requires.every((id) => done.has(id)));
    if (at < 0) throw new Error("模块依赖缺失或存在循环");
    const module = pending.splice(at, 1)[0];
    if (planning && module.id === "routes") finalizePlanningTerrain(plan);
    if (planning && module.id === "landforms")
      context.reservations.push(
        ...((parameters as typeof parameters & { repairCorridors?: { a: PlanPoint; b: PlanPoint; width: number }[] })
          .repairCorridors ?? [])
      );
    const ownedBefore = planning && !parameters.draftLayout ? JSON.stringify(plan) : "";
    try {
      if (planning && !parameters.draftLayout) {
        const proposal = proposePlanningModule(module, context);
        Object.assign(plan, proposal.plan);
        context.notes = proposal.notes;
        context.frame = proposal.frame;
        context.reservations = proposal.reservations;
      } else module.run(context);
      if (planning && module.id === "water") proposeWorldValleys(context);
    } catch (error) {
      if (!planning || parameters.draftLayout) throw error;
      Object.assign(plan, JSON.parse(ownedBefore));
      context.notes.push(`${module.id}未满足：${String(error)}`);
      plan.planning!.checks.push({
        id: `module-${module.id}`,
        rule: "E01",
        owners: [module.id],
        required: true,
        status: "fail",
        message: String(error)
      });
    }
    onPreview?.(plan, module.id);
    done.add(module.id);
  }
  plan.slopes = [
    slopeBand("coast-soil", "海岸缓坡", plan.land, 24, true),
    ...plan.islands.map((r, i) => slopeBand(`island-soil-${i}`, "岛岸缓坡", r, 12, true)),
    ...plan.waters.map((w) => slopeBand(`bank-${w.id}`, "河岸缓坡", w.outline, 12, false))
  ];

  return { plan, notes: context.notes, parameters };
}

/** Refine the resolved authoritative boundaries without replacing coordinated geometry.
 * @param plan Macro-layout snapshot; rectangle geometry, water graph, solids and routes stay fixed.
 * @param detail Relative boundary detail in [0,1]. Drafts still require the regular final audit.
 */
export function applyWorldContourDetail(plan: IslandPlan, detail: number): void {
  type Guard = { a: PlanPoint; b: PlanPoint; minX: number; maxX: number; minZ: number; maxZ: number; margin: number };
  const guards: Guard[] = [];
  const add = (points: PlanPoint[], margin = 0, closed = true) => {
    for (let i = 0; i < (closed ? points.length : points.length - 1); i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      guards.push({
        a,
        b,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minZ: Math.min(a.z, b.z),
        maxZ: Math.max(a.z, b.z),
        margin
      });
    }
  };
  for (const rock of plan.rocks) add(rock.obb);
  for (const building of plan.buildings) add(building.outline);
  for (const place of plan.places) if (place.outline.length) add(place.outline);
  for (const route of plan.routes) {
    if (route.outline?.length) add(route.outline);
    else add(route.points, route.width / 2, false);
  }
  for (const region of plan.regions)
    for (const link of region.navigationLinks ?? []) add(link.points, link.width / 2, false);
  for (const port of plan.planning?.ports ?? []) add([port.position], Math.min(4, port.width / 2));
  const clearance = (extra: Guard[] = []) => {
    const all = [...guards, ...extra];
    return (p: PlanPoint) => {
      let distance = Infinity;
      for (const guard of all) {
        const pad = 12 + guard.margin;
        if (p.x < guard.minX - pad || p.x > guard.maxX + pad || p.z < guard.minZ - pad || p.z > guard.maxZ + pad)
          continue;
        distance = Math.min(distance, segmentGap(p, guard.a, guard.b) - guard.margin);
      }
      return distance;
    };
  };
  for (const recipe of plan.shapeRecipes ?? []) {
    // Road surfaces retain their full-width material/clearance geometry.
    if (plan.routes.some((r) => r.id === recipe.id || r.shapeRecipeId === recipe.id)) continue;
    const water = plan.waters.find((w) => w.id === recipe.id),
      region = plan.regions.find((r) => r.id === recipe.id),
      mountain = plan.mountains.find((m) => m.id === recipe.id);
    if (recipe.id !== "land-main" && !water && !region && !mountain) continue;
    // Persist the actual resolved geometry: river mouths may have been stitched after
    // rectangle compilation, and mountain rings can represent separate solid groups.
    const current = recipe.id === "land-main" ? plan.land : (water?.outline ?? region?.outline ?? mountain!.outline);
    if (!recipe.resolvedContourBase)
      recipe.resolvedContourBase = {
        outline: structuredClone(current),
        ...(mountain?.outlines ? { outlines: structuredClone(mountain.outlines) } : {})
      };
    const base = recipe.resolvedContourBase.outline;
    const extra: Guard[] = [];
    if (water?.centerline) {
      for (let i = 1; i < water.centerline.length; i++) {
        const a = water.centerline[i - 1],
          b = water.centerline[i];
        extra.push({
          a,
          b,
          minX: Math.min(a.x, b.x),
          maxX: Math.max(a.x, b.x),
          minZ: Math.min(a.z, b.z),
          maxZ: Math.max(a.z, b.z),
          margin: 0
        });
      }
    }
    const outline = refineShapeBoundary(base, detail, clearance(extra));
    recipe.contourDetail = detail;
    if (recipe.id === "land-main") plan.land = outline;
    if (water) water.outline = outline;
    if (mountain) {
      mountain.outline = outline;
      if (recipe.resolvedContourBase.outlines)
        mountain.outlines = recipe.resolvedContourBase.outlines.map((r) =>
          refineShapeBoundary(r, detail, clearance(extra))
        );
    }
    if (region) {
      if (region.kind === "island") {
        const i = plan.regions.filter((r) => r.kind === "island").findIndex((r) => r.id === region.id);
        if (i >= 0) plan.islands[i] = outline;
      }
      region.outline = outline;
      if (region.navigationArea) region.navigationArea = outline;
    }
    const module = plan.planning?.modules.find((m) => m.id === recipe.id);
    if (module) {
      module.outline = outline;
      module.requested = { ...module.requested, contourDetail: detail };
    }
  }
  plan.slopes = [
    slopeBand("coast-soil", "海岸缓坡", plan.land, 24, true),
    ...plan.islands.map((ring, i) => slopeBand(`island-soil-${i}`, "岛岸缓坡", ring, 12, true)),
    ...plan.waters.map((w) => slopeBand(`bank-${w.id}`, "河岸缓坡", w.outline, 12, false))
  ];
  for (const water of plan.waters) {
    const bank = plan.slopes.find((s) => s.id === `bank-${water.id}`),
      reservation = plan.planning?.reservations.find((r) => r.ownerId === water.id && r.kind === "bank");
    if (bank && reservation) reservation.outline = bank.outer;
  }
}
