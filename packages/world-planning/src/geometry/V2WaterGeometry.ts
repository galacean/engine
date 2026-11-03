import type { WorldRecipe, V2Heightfield, V2WaterSurface, V2Point3, V2Point } from "../spatial/V2Model.ts";
import { V2Meter } from "./V2Budget";
import {
  clamp,
  smooth5,
  curveLine,
  distance,
  sampleHeight,
  namedRandom,
  ribbon,
  triangulatePolygon,
  polygonDistance,
  pointInPolygon
} from "./V2Geometry";

/** Compile water surfaces from the same terrain and endpoints used for carving.
 * @param recipe Resolved layout in world metres.
 * @param field Natural terrain before any water cut.
 * @param meter Shared work budget.
 * @returns Authoritative river and lake triangle geometry.
 */
export function waterGeometry(recipe: WorldRecipe, field: V2Heightfield, meter: V2Meter): V2WaterSurface[] {
  const water: V2WaterSurface[] = [],
    spacing = Math.max(1, (recipe.size / (recipe.resolution - 1)) * 0.7);
  const lakeOutlines = new Map(recipe.lakes.map((lake) => [lake.id, lakeOutline(lake, recipe.seed)]));
  resolveRiverLevels(recipe, field, lakeOutlines, meter);
  for (const r of recipe.rivers) {
    const from = recipe.riverNodes.find((n) => n.id === r.from)!,
      to = recipe.riverNodes.find((n) => n.id === r.to)!;
    const points = curveLine([from, ...r.controls, to], spacing),
      lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
    meter.spend(points.length * 4);
    const length = lengths[lengths.length - 1];
    const samples = [
      { t: 0, width: r.width },
      ...(r.widthSamples || []).filter((w) => w.t > 0 && w.t < 1),
      { t: 1, width: r.widthEnd }
    ];
    const widths = lengths.map((l) => {
      const t = length > 0 ? l / length : 0;
      let j = 1;
      while (j < samples.length - 1 && samples[j].t < t) j++;
      const a = samples[j - 1],
        b = samples[j],
        q = smooth5((t - a.t) / (b.t - a.t));
      return (a.width * (1 - q) + b.width * q) * recipe.riverScale;
    });
    const centerline = points.map((p, i) => ({
      ...p,
      y: from.level + ((to.level - from.level) * lengths[i]) / Math.max(1e-6, length)
    }));
    if (r.fitTerrain) {
      const lake = recipe.lakes.find((lake) => lake.id === r.lakeId),
        outline = lake && lakeOutlines.get(lake.id),
        mouthLevel = to.level;
      const lakeEntry =
          outline && pointInPolygon(to, outline) ? points.findIndex((p) => pointInPolygon(p, outline)) : -1,
        approachLength = lakeEntry >= 0 ? lengths[lakeEntry] : length;
      const natural = points.map((p) => sampleHeight(field, p.x, p.z) - 0.6);
      centerline[0].y = from.level;
      for (let i = 1; i < centerline.length; i++) {
        const t = lengths[i] / Math.max(1e-6, approachLength),
          target = mouthLevel + Math.max(0, natural[i] - mouthLevel) * (1 - smooth5((t - 0.65) / 0.25));
        centerline[i].y = Math.max(mouthLevel, Math.min(centerline[i - 1].y, target));
      }
      centerline[centerline.length - 1].y = mouthLevel;
    }
    const shape = roundRiver(centerline, widths);
    water.push({ id: r.id, kind: "river", ...shape, centerline, widths, depth: r.depth, bankWidth: r.bankWidth });
  }
  // Junction caps make the shared mouth a geometric union instead of two disconnected endpoints.
  for (const node of recipe.riverNodes) {
    const reaches = recipe.rivers.filter((r) => r.from === node.id || r.to === node.id);
    if (reaches.length < 2) continue;
    const radius = Math.max(...reaches.map((r) => (r.from === node.id ? r.width : r.widthEnd) * recipe.riverScale)) / 2;
    const outline = Array.from({ length: 20 }, (_, i) => ({
      x: node.x + Math.cos((i * Math.PI) / 10) * radius,
      z: node.z + Math.sin((i * Math.PI) / 10) * radius
    }));
    water.push({
      id: `junction:${node.id}`,
      kind: "river",
      mesh: triangulatePolygon(outline, node.level),
      outline,
      centerline: [{ x: node.x, y: node.level, z: node.z }],
      widths: [radius * 2],
      depth: Math.max(...reaches.map((r) => r.depth)),
      bankWidth: Math.max(...reaches.map((r) => r.bankWidth))
    });
  }
  for (const l of recipe.lakes) {
    const outline = lakeOutlines.get(l.id)!;
    meter.spend(outline.length * outline.length);
    water.push({
      id: l.id,
      kind: "lake",
      mesh: triangulatePolygon(outline, l.level),
      outline,
      centerline: [{ ...l.center, y: l.level }],
      widths: [],
      depth: l.depth,
      bankWidth: Math.min(l.radiusX, l.radiusZ) * 0.35
    });
  }
  return water;
}

function lakeOutline(lake: WorldRecipe["lakes"][number], seed: number): V2Point[] {
  return (
    lake.outline ||
    Array.from({ length: 48 }, (_, i) => {
      const t = (i / 48) * Math.PI * 2,
        modulation =
          1 + lake.irregularity * (Math.sin(t * 3 + namedRandom(seed, lake.id) * 6) * 0.6 + Math.sin(t * 5) * 0.4),
        x = Math.cos(t) * lake.radiusX * modulation,
        z = Math.sin(t) * lake.radiusZ * modulation;
      return {
        x: lake.center.x + x * Math.cos(lake.yaw) - z * Math.sin(lake.yaw),
        z: lake.center.z + x * Math.sin(lake.yaw) + z * Math.cos(lake.yaw)
      };
    })
  );
}

function resolveRiverLevels(
  recipe: WorldRecipe,
  field: V2Heightfield,
  lakeOutlines: Map<string, V2Point[]>,
  meter: V2Meter
): void {
  const nodes = new Map(recipe.riverNodes.map((node) => [node.id, node])),
    fitted = new Set<string>(),
    authored = new Set<string>(),
    outgoing = new Map<string, string[]>(),
    anchors = new Map<string, number>();
  for (const reach of recipe.rivers) {
    if (!reach.fitTerrain) {
      authored.add(reach.from);
      authored.add(reach.to);
      continue;
    }
    fitted.add(reach.from);
    fitted.add(reach.to);
    outgoing.set(reach.from, [...(outgoing.get(reach.from) || []), reach.to]);
    const lake = recipe.lakes.find((lake) => lake.id === reach.lakeId),
      outline = lake && lakeOutlines.get(lake.id);
    if (!lake || !outline) continue;
    for (const id of [reach.from, reach.to]) {
      meter.spend(outline.length);
      if (pointInPolygon(nodes.get(id)!, outline)) anchors.set(id, Math.min(anchors.get(id) ?? Infinity, lake.level));
    }
  }
  const preferred = new Map(
    recipe.riverNodes.map((node) => [
      node.id,
      anchors.get(node.id) ??
        (fitted.has(node.id) && !authored.has(node.id) ? sampleHeight(field, node.x, node.z) - 0.6 : node.level)
    ])
  );
  const resolved = new Map(preferred);
  for (const id of fitted) {
    if (anchors.has(id) || authored.has(id)) continue;
    let level = preferred.get(id)!;
    const pending = [id],
      visited = new Set<string>();
    // Each downstream node is visited once; shared junctions use original preferences,
    // never a partially updated reach. A lake is a fixed drainage boundary.
    while (pending.length) {
      const next = pending.pop()!;
      if (visited.has(next)) continue;
      visited.add(next);
      meter.spend();
      level = Math.max(level, preferred.get(next)!);
      if (anchors.has(next) || authored.has(next)) continue;
      const downstream = outgoing.get(next) || [];
      meter.spend(downstream.length);
      pending.push(...downstream);
    }
    resolved.set(id, level);
  }
  for (const node of recipe.riverNodes) node.level = resolved.get(node.id)!;
}

/** Apply the union of water cuts once, independent of river/lake ordering.
 * @param field Natural terrain, updated in place.
 * @param waters Authoritative surfaces to join to the terrain.
 * @param meter Shared work budget.
 * @returns Per-height-sample wetness.
 */
export function carveWater(field: V2Heightfield, waters: V2WaterSurface[], meter: V2Meter): Float32Array {
  const r = field.resolution,
    cell = field.size / (r - 1),
    half = field.size / 2,
    wetness = new Float32Array(r * r),
    naturalHeights = field.heights.slice(),
    beds = new Float32Array(r * r).fill(Infinity),
    banks = new Float32Array(r * r),
    bankWeights = new Float32Array(r * r);
  for (const w of waters) {
    const distanceField = new Float32Array(r * r).fill(Infinity),
      levels = new Float32Array(r * r),
      widths = new Float32Array(r * r);
    if (w.centerline.length > 1) {
      for (let i = 1; i < w.centerline.length; i++) {
        const a = w.centerline[i - 1],
          b = w.centerline[i],
          width0 = w.widths[i - 1] / 2,
          width1 = w.widths[i] / 2,
          outer = Math.max(width0, width1) + w.bankWidth + cell * 2;
        const x0 = clamp(Math.floor((Math.min(a.x, b.x) - outer + half) / cell), 0, r - 1),
          x1 = clamp(Math.ceil((Math.max(a.x, b.x) + outer + half) / cell), 0, r - 1);
        const z0 = clamp(Math.floor((Math.min(a.z, b.z) - outer + half) / cell), 0, r - 1),
          z1 = clamp(Math.ceil((Math.max(a.z, b.z) + outer + half) / cell), 0, r - 1);
        const dx = b.x - a.x,
          dz = b.z - a.z,
          length2 = dx * dx + dz * dz;
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) {
            meter.spend();
            const px = x * cell - half,
              pz = z * cell - half,
              t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / Math.max(1e-8, length2), 0, 1),
              width = width0 + t * (width1 - width0),
              d = Math.hypot(px - a.x - dx * t, pz - a.z - dz * t) - width,
              id = z * r + x;
            if (d < distanceField[id]) {
              distanceField[id] = d;
              levels[id] = a.y + t * (b.y - a.y);
              widths[id] = width;
            }
          }
      }
    } else {
      const outer = w.bankWidth + cell * 2,
        xs = w.outline.map((p) => p.x),
        zs = w.outline.map((p) => p.z);
      const x0 = clamp(Math.floor((Math.min(...xs) - outer + half) / cell), 0, r - 1),
        x1 = clamp(Math.ceil((Math.max(...xs) + outer + half) / cell), 0, r - 1),
        z0 = clamp(Math.floor((Math.min(...zs) - outer + half) / cell), 0, r - 1),
        z1 = clamp(Math.ceil((Math.max(...zs) + outer + half) / cell), 0, r - 1);
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          meter.spend(w.outline.length);
          const id = z * r + x;
          distanceField[id] = polygonDistance({ x: x * cell - half, z: z * cell - half }, w.outline);
          levels[id] = w.centerline[0].y;
          widths[id] = Math.max(6, Math.min((x1 - x0) * cell, (z1 - z0) * cell) * 0.2);
        }
    }
    for (let id = 0; id < distanceField.length; id++) {
      meter.spend();
      const d = distanceField[id];
      if (d > w.bankWidth + cell * 2) continue;
      wetness[id] = Math.max(wetness[id], 1 - smooth5(Math.max(0, d) / Math.max(2, w.bankWidth)));
      const level = levels[id],
        natural = naturalHeights[id];
      if (d <= 0)
        beds[id] = Math.min(beds[id], natural, level - 0.3 - w.depth * smooth5(-d / Math.max(cell, widths[id])));
      else {
        const blend = smooth5(d / Math.max(cell * 2, w.bankWidth));
        const shore = level - 0.3 + Math.min(d, cell * 2) * 0.4;
        const target = shore * (1 - blend) + natural * blend;
        const weight = 1 - blend;
        banks[id] += target * weight;
        bankWeights[id] += weight;
      }
    }
  }
  for (let id = 0; id < beds.length; id++) {
    meter.spend();
    field.heights[id] = Number.isFinite(beds[id])
      ? beds[id]
      : bankWeights[id] > 0
        ? banks[id] / bankWeights[id]
        : naturalHeights[id];
  }
  return wetness;
}

function roundRiver(points: V2Point3[], widths: number[]): ReturnType<typeof ribbon> {
  const shape = ribbon(points, widths),
    n = points.length;
  const left = shape.outline.slice(0, n),
    right = shape.outline.slice(n);
  const cap = (at: number, toward: number): V2Point[] => {
    const p = points[at],
      q = points[toward],
      angle = Math.atan2(p.z - q.z, p.x - q.x),
      radius = widths[at] / 2;
    const steps = Math.max(8, Math.ceil((Math.PI * radius) / 2));
    const arc = Array.from({ length: steps + 1 }, (_, i) => {
      const t = angle + Math.PI / 2 - (i * Math.PI) / steps;
      return { x: p.x + Math.cos(t) * radius, z: p.z + Math.sin(t) * radius };
    });
    const base = shape.mesh.positions.length / 3;
    shape.mesh.positions.push(p.x, p.y, p.z);
    for (const a of arc) shape.mesh.positions.push(a.x, p.y, a.z);
    for (let i = 0; i < steps; i++) shape.mesh.indices.push(base, base + i + 1, base + i + 2);
    return arc.slice(1, -1);
  };
  const end = cap(n - 1, n - 2),
    start = cap(0, 1);
  shape.outline = [...left, ...end, ...right, ...start];
  return shape;
}
