import type { PlanPoint } from "./IslandPlanModel";
import type { WorldLayoutContext } from "./WorldLayoutPlanner";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";
import { ringArea, segmentGap } from "./WorldPlanningGeometry";
import { WorldPlanningWaterQuery } from "./WorldPlanningWaterQuery";

const CELL = 48,
  N = Math.ceil(2048 / CELL),
  AREA = CELL * CELL;
const rectangle = (x: number, z: number, w = CELL, h = CELL): PlanPoint[] => [
  { x, z },
  { x: x + w, z },
  { x: x + w, z: z + h },
  { x, z: z + h }
];
/** Reserve connected open ground around actual places and water, before mountain placement.
 * @param c Transaction context after water and places have been generated.
 * @returns Writes authoritative region contours and merged rectangular exclusions.
 */
export function generateWorldOpenSpaces(c: WorldLayoutContext): void {
  const { plan } = c,
    data = plan.planning;
  if (!data || plan.land.length < 3 || c.parameters.openness <= 0) return;
  const land = createPlanningRingQuery(plan.land),
    query = new WorldPlanningWaterQuery(),
    water = plan.waters.map((w) => ({ outline: w.outline, query: createPlanningRingQuery(w.outline) }));
  const places = plan.regions.filter((r) => r.kind === "village" || r.kind === "teleport").map((r) => r.outline);
  const blockers = [...water.map((w) => w.outline), ...places, ...plan.rocks.map((r) => r.obb)];
  const anchors = data.ports.filter((p) => p.kind === "entrance").map((p) => ({ id: p.ownerId, p: p.position }));
  const protectedSegments: { a: PlanPoint; b: PlanPoint; radius: number }[] = [],
    valleys = data.modules.filter((m) => m.kind === "valley");
  for (const w of plan.waters.filter((w) => w.to === "ocean" && w.centerline)) {
    const line = w.centerline!;
    for (let i = 1; i < line.length; i++) {
      const t = (i - 0.5) / (line.length - 1);
      const valley = valleys.find((v) => v.dependencies.includes(w.id));
      if (valley && t >= 0.2 && t <= 0.8) {
        const halfWater =
          (data.profiles.find((p) => p.ownerId === w.id && p.kind === "water")?.width ?? c.parameters.riverWidth) / 2;
        const valleyWidth = valley.requested.width ?? 80;
        protectedSegments.push({
          a: line[i - 1],
          b: line[i],
          radius: halfWater + valleyWidth / 2 + c.parameters.mountainWidth * 0.65
        });
      } else anchors.push({ id: w.systemId ?? w.id, p: line[i] });
    }
  }
  const eligible = new Uint8Array(N * N),
    centers: PlanPoint[] = [],
    selected = new Uint8Array(N * N);
  let waterArea = 0,
    eligibleCount = 0,
    uncertainArea = 0;
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const index = z * N + x,
        ring = rectangle(x * CELL, z * CELL),
        p = { x: (x + 0.5) * CELL, z: (z + 0.5) * CELL };
      centers[index] = p;
      const touchesWater = water.some((w) => query.overlap(ring, w.outline));
      if (touchesWater) {
        let wet = 0;
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++) {
            const point = { x: (x + (i + 0.5) / 4) * CELL, z: (z + (j + 0.5) / 4) * CELL };
            if (land.inside(point) && water.some((w) => w.query.inside(point))) wet++;
          }
        waterArea += (wet * AREA) / 16;
        const fullyWet =
          ring.every((a, i) => land.containsSegment(a, ring[(i + 1) % 4], 0)) &&
          water.some((w) => ring.every((a, i) => w.query.containsSegment(a, ring[(i + 1) % 4], 0)));
        if (!fullyWet) uncertainArea += AREA;
      }
      if (!ring.every((a, i) => land.containsSegment(a, ring[(i + 1) % 4], 0))) continue;
      if (blockers.some((b) => query.overlap(ring, b))) continue;
      // Keep the central river's two-bank mountain/valley corridor available.
      if (protectedSegments.some((s) => segmentGap(p, s.a, s.b) < s.radius + CELL / Math.SQRT2)) continue;
      eligible[index] = 1;
      eligibleCount++;
    }
  const dryLand = Math.max(0, ringArea(plan.land) - waterArea),
    requested = Math.max(0, Math.min(1, c.parameters.openness));
  const terrainReserveArea = c.parameters.mountains * Math.pow(c.parameters.mountainWidth, 2),
    occupiedPlaceArea = places.reduce((sum, ring) => sum + ringArea(ring), 0),
    terrainLimitedArea = Math.max(0, dryLand - occupiedPlaceArea - terrainReserveArea);
  const capacity = Math.min(eligibleCount, Math.floor(terrainLimitedArea / AREA)),
    target = Math.min(capacity, Math.floor((dryLand * requested) / AREA));
  const queue: number[] = [],
    queued = new Uint8Array(N * N),
    related = new Set<string>();
  const neighbors = (i: number) => {
    const x = i % N,
      z = Math.floor(i / N);
    return [z > 0 ? i - N : -1, x < N - 1 ? i + 1 : -1, z < N - 1 ? i + N : -1, x > 0 ? i - 1 : -1];
  };
  for (const anchor of anchors) {
    if (queue.length >= 4) break;
    let best = -1,
      distance = Infinity;
    for (let i = 0; i < eligible.length; i++)
      if (eligible[i]) {
        const d = Math.hypot(centers[i].x - anchor.p.x, centers[i].z - anchor.p.z);
        if (
          d < distance &&
          d <= 240 &&
          !queue.some((j) => Math.hypot(centers[j].x - centers[i].x, centers[j].z - centers[i].z) < CELL * 4)
        ) {
          best = i;
          distance = d;
        }
      }
    if (best >= 0) {
      queue.push(best);
      queued[best] = 1;
      related.add(anchor.id);
    }
  }
  const seeds = new Set(queue);
  let count = 0;
  for (let cursor = 0; cursor < queue.length && count < target; cursor++) {
    const i = queue[cursor],
      x = i % N,
      z = Math.floor(i / N),
      adj = neighbors(i).map((j) => j >= 0 && !!selected[j]);
    const occupied = adj.filter(Boolean).length,
      runs = adj.filter((v, k) => v && !adj[(k + 3) % 4]).length;
    // Connected edge attachment and no corner-only contact preserve simple regions.
    if (occupied === 4 || runs > 1 || (!occupied && !seeds.has(i))) continue;
    let cornerTouch = false;
    for (const [dx, dz, a, b] of [
      [-1, -1, 3, 0],
      [1, -1, 1, 0],
      [1, 1, 1, 2],
      [-1, 1, 3, 2]
    ])
      if (
        x + dx >= 0 &&
        x + dx < N &&
        z + dz >= 0 &&
        z + dz < N &&
        selected[(z + dz) * N + x + dx] &&
        !adj[a] &&
        !adj[b]
      )
        cornerTouch = true;
    if (cornerTouch) continue;
    selected[i] = 1;
    count++;
    for (const j of neighbors(i))
      if (j >= 0 && eligible[j] && !queued[j]) {
        queue.push(j);
        queued[j] = 1;
      }
  }
  // Trace grid-boundary edges, then remove all collinear cell vertices.
  const edges = new Map<string, { a: PlanPoint; b: PlanPoint }>(),
    key = (p: PlanPoint) => `${p.x},${p.z}`;
  for (let i = 0; i < selected.length; i++)
    if (selected[i]) {
      const ring = rectangle((i % N) * CELL, Math.floor(i / N) * CELL),
        adj = neighbors(i);
      for (let side = 0; side < 4; side++)
        if (adj[side] < 0 || !selected[adj[side]]) {
          const a = ring[side],
            b = ring[(side + 1) % 4];
          edges.set(key(a), { a, b });
        }
    }
  const outlines: PlanPoint[][] = [];
  while (edges.size) {
    const first = edges.values().next().value!,
      ring: PlanPoint[] = [];
    let at = first.a;
    do {
      const edge = edges.get(key(at));
      if (!edge) throw new Error("开敞区域边界未闭合");
      ring.push(edge.a);
      edges.delete(key(at));
      at = edge.b;
    } while (key(at) !== key(first.a));
    outlines.push(
      ring.filter((p, i) => {
        const a = ring[(i + ring.length - 1) % ring.length],
          b = ring[(i + 1) % ring.length];
        return (p.x - a.x) * (b.z - p.z) !== (p.z - a.z) * (b.x - p.x);
      })
    );
  }
  // Merge identical horizontal runs across rows for exact, compact exclusions.
  const runs: { x: number; z: number; w: number; h: number }[] = [],
    active = new Map<string, number>();
  for (let z = 0; z < N; z++) {
    const next = new Map<string, number>();
    for (let x = 0; x < N; ) {
      if (!selected[z * N + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < N && selected[z * N + x]) x++;
      const key = `${start}:${x}`,
        previous = active.get(key);
      if (previous !== undefined) {
        runs[previous].h += CELL;
        next.set(key, previous);
      } else {
        next.set(key, runs.length);
        runs.push({ x: start * CELL, z: z * CELL, w: (x - start) * CELL, h: CELL });
      }
    }
    active.clear();
    for (const [key, value] of next) active.set(key, value);
  }
  const area = count * AREA;
  data.modules.push({
    id: "open-spaces",
    kind: "open",
    outline: outlines[0] ?? [],
    outlines,
    dependencies: ["land-main", ...related],
    requested: { coverage: requested },
    resolved: {
      area,
      coverage: dryLand ? area / dryLand : 0,
      requestedCoverage: requested,
      dryLandAreaEstimate: dryLand,
      waterAreaEstimate: waterArea,
      sampleSpacing: 12,
      boundaryUncertaintyArea: uncertainArea,
      cellSize: CELL,
      capacityArea: capacity * AREA,
      terrainReserveArea,
      occupiedPlaceArea,
      unassignedArea: Math.max(0, dryLand - area - occupiedPlaceArea),
      regions: outlines.length
    }
  });
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    data.reservations.push({
      id: `open-spaces-${i}`,
      ownerId: "open-spaces",
      kind: "open",
      outline: rectangle(r.x, r.z, r.w, r.h),
      relatedIds: [...related]
    });
  }
  if (area + AREA < dryLand * requested)
    data.adjustments.push({
      owners: ["open-spaces"],
      reason: "开敞区域受实际水陆边界、场所占地、连通范围和河谷地貌预留限制；剩余空地不计为已组织开敞区域",
      requested: dryLand * requested,
      resolved: area
    });
}
