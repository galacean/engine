import { cellularCornerShading } from "./CellularShading";
import type { FractureSurface, MeshBuffers } from "./types";
import { validateSlabSettings, type SlabSettings } from "./SlabSettings";
import { transportSurfaceNormals } from "./SurfaceNormalTransport";

type V3 = [number, number, number];
type Point = { vertex: number; x: number; y: number };
export interface CellularSlabPatch {
  id: string;
  /** Diagnostic labels only; they never participate in placement or inclusion. */
  cellKeys: string[];
  seedVertex: number;
  /** CCW polygon loop of exact source vertex IDs, in the tangent frame below. */
  cornerVertices: number[];
  /** Polygon boundary and the unchanged exterior vertices attaching it. */
  boundaryVertices: number[];
  /** Compatibility alias for boundaryVertices. */
  anchorVertices: number[];
  affectedVertices: number[];
  center: V3;
  normal: V3;
  tangentRight: V3;
  tangentUp: V3;
  planeOffset: number;
  width: number;
  height: number;
}
export interface CellularSlabResult {
  surface: FractureSurface;
  patches: CellularSlabPatch[];
  stats: {
    generationMs: number;
    patches: number;
    deformedVertices: number;
    maxDisplacement: number;
    overlapVertices: number;
    eligibleVertices: number;
    candidates: number;
    attenuatedVertices: number;
  };
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: V3): V3 => {
  const length = Math.hypot(...a);
  return length > 1e-12 ? (a.map((v) => v / length) as V3) : [0, 1, 0];
};
const read = (p: Float32Array, v: number): V3 => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]];
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let h = Math.imul(state ^ (state >>> 15), state | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}
function faceVector(p: Float32Array, indices: Uint32Array, face: number): V3 {
  const a = read(p, indices[face * 3]);
  return cross(sub(read(p, indices[face * 3 + 1]), a), sub(read(p, indices[face * 3 + 2]), a));
}
const turn = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function convexHull(points: Point[]): Point[] {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y || a.vertex - b.vertex);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const point of sorted) {
    while (lower.length > 1 && turn(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-9) lower.pop();
    lower.push(point);
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length > 1 && turn(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-9) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
/** Signed inward distance to the nearest edge of a convex CCW polygon. */
function polygonDistance(point: Point, polygon: Point[]): number {
  let distance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    distance = Math.min(distance, turn(a, b, point) / Math.hypot(b.x - a.x, b.y - a.y));
  }
  return distance;
}

/**
 * Select irregular polygons from existing vertices, then deform their connected
 * interiors into broad planes. Cell IDs and cap labels do not define a patch.
 * No remeshing, added shells, or position-based welding: polygon boundaries are
 * sampled on the existing triangulation, so coarse triangles cannot reproduce
 * an exact new polygon edge between vertices.
 */
export function deformCellularSlabs(
  source: FractureSurface,
  settings: SlabSettings,
  normalMode: "geometry" | "guide-transport" = "geometry"
): CellularSlabResult {
  const start = performance.now();
  validateSlabSettings(settings);
  if (!settings) throw Error("Cellular slab settings are required");
  if (normalMode !== "geometry" && normalMode !== "guide-transport") throw Error("Invalid cellular slab normal mode");
  const stats: CellularSlabResult["stats"] = {
    generationMs: 0,
    patches: 0,
    deformedVertices: 0,
    maxDisplacement: 0,
    overlapVertices: 0,
    eligibleVertices: 0,
    candidates: 0,
    attenuatedVertices: 0
  };
  const patches: CellularSlabPatch[] = [];
  const finish = (surface: FractureSurface): CellularSlabResult => {
    stats.generationMs = performance.now() - start;
    stats.patches = patches.length;
    return { surface, patches, stats };
  };
  if (!settings.enabled || settings.coverage === 0) return finish(source);
  const meta = source.cellular,
    mesh = source.mesh,
    p = mesh.positions,
    indices = mesh.indices;
  if (!meta) throw Error("Cellular slab deformation requires cellular topology metadata");
  const count = p.length / 3,
    faces = indices.length / 3,
    adjacent = meta.triangleNeighbors;
  if (
    p.length % 3 ||
    indices.length % 3 ||
    meta.isTop.length !== faces ||
    adjacent.length !== indices.length ||
    meta.cellIds.length !== count
  )
    throw Error("Cellular slab topology buffers do not match the source mesh");
  if (mesh.guideNormals && mesh.guideNormals.length !== p.length)
    throw Error("Cellular slab guide normals do not match source vertices");
  if (normalMode === "guide-transport" && !mesh.guideNormals)
    throw Error("Cellular slab normal transport requires guide normals");
  if (mesh.cellularShading && mesh.cellularShading.cells.length !== indices.length)
    throw Error("Cellular slab face shading does not match source triangles");
  for (const value of p) if (!Number.isFinite(value)) throw Error("Cellular slab source has non-finite positions");
  for (const v of indices) if (v >= count) throw Error("Cellular slab source index is out of range");
  for (const face of adjacent)
    if (face < -1 || face >= faces) throw Error("Cellular slab triangle neighbor is out of range");

  const graph: Set<number>[] = Array.from({ length: count }, () => new Set());
  const area = new Float64Array(count),
    activeArea = new Float64Array(count),
    openBoundary = new Uint8Array(count);
  let macro = new Float32Array(p.length);
  for (let t = 0; t < faces; t++) {
    const normal = faceVector(p, indices, t),
      share = Math.hypot(...normal) / 6;
    const active = (mesh.cellularShading?.cells[t * 3 + 2] ?? 1) > 0;
    for (let j = 0; j < 3; j++) {
      const v = indices[t * 3 + j],
        next = indices[t * 3 + ((j + 1) % 3)];
      graph[v].add(next);
      graph[next].add(v);
      area[v] += share;
      if (active) activeArea[v] += share;
      for (let k = 0; k < 3; k++) macro[v * 3 + k] += normal[k];
      if (adjacent[t * 3 + j] < 0) {
        openBoundary[v] = 1;
        openBoundary[next] = 1;
      }
    }
  }
  // Guide normals describe the underlying rock rather than the tiny groove
  // walls. Without them, a short graph filter recovers a macro direction using
  // geometry alone. It never consults cap labels or cell ownership.
  for (let v = 0; v < count; v++) macro.set(unit(read(macro, v)), v * 3);
  if (!mesh.guideNormals)
    for (let pass = 0; pass < 3; pass++) {
      const next = new Float32Array(p.length);
      for (let v = 0; v < count; v++) {
        const sum = read(macro, v).map((n) => n * 2) as V3;
        for (const n of graph[v]) for (let k = 0; k < 3; k++) sum[k] += macro[n * 3 + k];
        next.set(unit(sum), v * 3);
      }
      macro = next;
    }
  else
    for (let v = 0; v < count; v++) {
      const normal = read(mesh.guideNormals, v);
      if (normal.every(Number.isFinite) && Math.hypot(...normal) > 1e-8) macro.set(unit(normal), v * 3);
    }
  const eligible: number[] = [],
    cdf: number[] = [],
    steep = new Uint8Array(count);
  let totalArea = 0;
  for (let v = 0; v < count; v++)
    if (macro[v * 3 + 1] >= -0.1 && macro[v * 3 + 1] <= 0.75 && (activeArea[v] > 1e-9 || area[v] <= 1e-9)) {
      // Pure projection collapses some baked joint walls. Keep their zero-area
      // vertices traversable so the indexed network still connects across cells;
      // only vertices carrying active surface area can seed a polygon.
      steep[v] = 1;
      if (!openBoundary[v] && activeArea[v] > 1e-9) {
        eligible.push(v);
        totalArea += activeArea[v];
        cdf.push(totalArea);
      }
    }
  stats.eligibleVertices = eligible.length;
  if (!eligible.length) return finish(source);
  const rng = random(settings.seed),
    target = Math.min(96, Math.max(1, Math.ceil((totalArea * settings.coverage) / (settings.size ** 2 * 0.6))));
  const budget = Math.min(768, Math.max(24, target * 10));
  const delta = new Float32Array(p.length),
    winner = new Float32Array(count),
    influences = new Uint16Array(count);
  const visited = new Uint32Array(count),
    maximum = Math.max(settings.depth * 3, settings.size * 0.22);
  for (; stats.candidates < budget && patches.length < target; stats.candidates++) {
    const selection = rng() * totalArea;
    let lo = 0,
      hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < selection) lo = mid + 1;
      else hi = mid;
    }
    const seedVertex = eligible[lo],
      center = read(p, seedVertex),
      normal = read(macro, seedVertex);
    const right = unit(cross([0, 1, 0], normal)),
      up = unit(cross(normal, right));
    const width = settings.size * (0.64 + (rng() - 0.5) * 0.25 * settings.variation);
    const height = settings.size * (1.35 + (rng() - 0.5) * 0.65 * settings.variation);
    const queue = [seedVertex],
      points: Point[] = [],
      stamp = stats.candidates + 1;
    visited[seedVertex] = stamp;
    // Walk the actual indexed graph. Nearby disconnected sheets and the other
    // side of a formation cannot be selected just because projections overlap.
    for (let cursor = 0; cursor < queue.length && points.length < 16384; cursor++) {
      const v = queue[cursor],
        relative = sub(read(p, v), center);
      const x = dot(relative, right),
        y = dot(relative, up);
      points.push({ vertex: v, x, y });
      for (const n of graph[v]) {
        if (visited[n] === stamp) continue;
        visited[n] = stamp;
        if (!steep[n] || dot(read(macro, n), normal) < 0.62) continue;
        const offset = sub(read(p, n), center),
          nx = dot(offset, right) / (width * 0.5),
          ny = dot(offset, up) / (height * 0.5);
        if (nx * nx + ny * ny > 1.65 ** 2 || Math.abs(dot(offset, normal)) > width * 0.45 + settings.depth) continue;
        queue.push(n);
      }
    }
    if (points.length < 8) continue;
    const cornerCount = 4 + Math.floor(rng() * 4),
      phase = rng() * Math.PI * 2,
      corners: Point[] = [];
    for (let i = 0; i < cornerCount; i++) {
      const angle = phase + ((i + (rng() - 0.5) * 0.3 * settings.variation) * Math.PI * 2) / cornerCount;
      const radius = 0.82 + (rng() - 0.5) * 0.32 * settings.variation;
      const x = Math.cos(angle) * width * 0.5 * radius,
        y = Math.sin(angle) * height * 0.5 * radius;
      let best: Point | undefined,
        distance = Infinity;
      for (const point of points) {
        if (openBoundary[point.vertex] || corners.some((c) => c.vertex === point.vertex)) continue;
        const d = ((point.x - x) / width) ** 2 + ((point.y - y) / height) ** 2;
        if (d < distance || (d === distance && point.vertex < best!.vertex)) {
          best = point;
          distance = d;
        }
      }
      if (best) corners.push(best);
    }
    const polygon = convexHull(corners);
    if (polygon.length < 4 || polygonDistance({ vertex: seedVertex, x: 0, y: 0 }, polygon) < 0) continue;
    const distances = new Map<number, number>();
    for (const point of points) {
      const distance = polygonDistance(point, polygon);
      if (distance >= -1e-7) distances.set(point.vertex, Math.max(0, distance));
    }
    // Polygon clipping can divide a bent surface. Keep the component reached
    // from the selected source vertex, rather than leaping across a fold.
    const members = [seedVertex],
      included = new Set<number>(members);
    for (let cursor = 0; cursor < members.length; cursor++)
      for (const n of graph[members[cursor]]) {
        if (!included.has(n) && distances.has(n)) {
          included.add(n);
          members.push(n);
        }
      }
    if (polygon.some((point) => !included.has(point.vertex))) continue;
    members.sort((a, b) => a - b);
    const yaw = (rng() - 0.5) * 0.12 * settings.variation,
      pitch = (rng() - 0.5) * 0.1 * settings.variation;
    const planeNormal = unit(normal.map((v, k) => v + right[k] * yaw + up[k] * pitch) as V3);
    // Put the plane beyond every included source vertex, so a high corner is
    // still raised rather than silently becoming a fixed point inside the slab.
    let referenceDepth = -Infinity;
    for (const v of members) referenceDepth = Math.max(referenceDepth, dot(read(p, v), planeNormal));
    const lift = settings.depth * (1 + (rng() - 0.5) * 0.7 * settings.variation),
      planeOffset = referenceDepth + lift;
    const anchors = new Set<number>(polygon.map((point) => point.vertex));
    const affected: number[] = [];
    for (const v of members) {
      for (const neighbor of graph[v])
        if (!included.has(neighbor)) {
          anchors.add(v);
          anchors.add(neighbor);
        }
      if (openBoundary[v]) {
        anchors.add(v);
        continue;
      }
      const sourceDepth = dot(read(p, v), planeNormal);
      // A small geometric residual keeps joint walls from becoming degenerate
      // without classifying vertices as caps or bottoms. Both approach the same
      // tilted plane; all internal seams are reduced by the same 96.5 percent.
      const targetDepth = planeOffset + (sourceDepth - referenceDepth) * 0.035;
      // Corners and interior receive the same plane target. Exterior vertices
      // stay fixed, so the existing triangles crossing the polygon boundary
      // become the attachment rim instead of shrinking the raised front inward.
      const amount = Math.min(maximum, Math.max(0, targetDepth - sourceDepth));
      if (amount <= 1e-8) continue;
      influences[v]++;
      affected.push(v);
      // Overlap is permitted. There is no placement exclusion or collision
      // penalty: the strongest outward proposal wins with stable tie ordering.
      if (amount > winner[v]) {
        winner[v] = amount;
        for (let k = 0; k < 3; k++) delta[v * 3 + k] = planeNormal[k] * amount;
      }
    }
    if (!affected.length) continue;
    const boundaryVertices = Array.from(anchors).sort((a, b) => a - b);
    const cellKeys = Array.from(
      new Set(affected.map((v) => meta.cellKeys[meta.cellIds[v]] ?? String(meta.cellIds[v])))
    ).sort();
    patches.push({
      id: `cellular-slab:${settings.seed}:${stats.candidates}`,
      cellKeys,
      seedVertex,
      cornerVertices: polygon.map((point) => point.vertex),
      boundaryVertices,
      anchorVertices: boundaryVertices,
      affectedVertices: affected,
      center,
      normal: planeNormal,
      tangentRight: right,
      tangentUp: up,
      planeOffset,
      width,
      height
    });
  }
  if (!patches.length) return finish(source);

  // A local orientation/area guard attenuates only implicated vertices. This
  // is not an intersection test; independent overlapping caps remain allowed.
  const alpha = new Float32Array(count).fill(1),
    original = new Float32Array(indices.length),
    positions = p.slice();
  for (let t = 0; t < faces; t++) original.set(faceVector(p, indices, t), t * 3);
  const update = () => {
    for (let v = 0; v < count; v++)
      for (let k = 0; k < 3; k++) positions[v * 3 + k] = p[v * 3 + k] + delta[v * 3 + k] * alpha[v];
  };
  update();
  for (let pass = 0; pass < 14; pass++) {
    const bad = new Uint8Array(count);
    let failed = false;
    for (let t = 0; t < faces; t++) {
      const old = read(original, t),
        before = Math.hypot(...old);
      if (before < 1e-9) continue;
      const next = faceVector(positions, indices, t),
        length = Math.hypot(...next);
      if (length > before * 0.02 && dot(next, old) > length * before * 0.015) continue;
      for (let j = 0; j < 3; j++)
        if (winner[indices[t * 3 + j]] > 0) {
          bad[indices[t * 3 + j]] = 1;
          failed = true;
        }
    }
    if (!failed) break;
    for (let v = 0; v < count; v++) if (bad[v]) alpha[v] *= 0.5;
    update();
  }
  // Resolve any remaining local failure by restoring only its vertices. A
  // work queue checks affected neighbors as restoration moves the boundary;
  // each vertex can be restored once, so this cannot iterate indefinitely.
  const invalid = (t: number) => {
    const old = read(original, t),
      before = Math.hypot(...old);
    if (before < 1e-9) return false;
    const next = faceVector(positions, indices, t),
      length = Math.hypot(...next);
    return length <= before * 0.02 || dot(next, old) <= length * before * 0.015;
  };
  const repairs: number[] = [];
  for (let t = 0; t < faces; t++) if (invalid(t)) repairs.push(t);
  if (repairs.length) {
    const vertexFaces: number[][] = Array.from({ length: count }, () => []),
      queued = new Uint8Array(faces);
    for (let t = 0; t < faces; t++) for (let j = 0; j < 3; j++) vertexFaces[indices[t * 3 + j]].push(t);
    for (const t of repairs) queued[t] = 1;
    for (let cursor = 0; cursor < repairs.length; cursor++) {
      const t = repairs[cursor];
      queued[t] = 0;
      if (!invalid(t)) continue;
      for (let j = 0; j < 3; j++) {
        const v = indices[t * 3 + j];
        if (winner[v] <= 0 || alpha[v] === 0) continue;
        alpha[v] = 0;
        positions.set(p.subarray(v * 3, v * 3 + 3), v * 3);
        for (const adjacent of vertexFaces[v])
          if (!queued[adjacent]) {
            queued[adjacent] = 1;
            repairs.push(adjacent);
          }
      }
    }
  }
  const normals =
    normalMode === "guide-transport"
      ? transportSurfaceNormals({ positions: p, indices, guideNormals: mesh.guideNormals! }, positions, graph)
      : new Float32Array(p.length);
  if (normalMode === "geometry") {
    for (let t = 0; t < faces; t++) {
      const normal = faceVector(positions, indices, t);
      for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) normals[indices[t * 3 + j] * 3 + k] += normal[k];
    }
    for (let v = 0; v < count; v++) normals.set(unit(read(normals, v)), v * 3);
  }
  for (let v = 0; v < count; v++) {
    const distance = Math.hypot(
      positions[v * 3] - p[v * 3],
      positions[v * 3 + 1] - p[v * 3 + 1],
      positions[v * 3 + 2] - p[v * 3 + 2]
    );
    if (distance > 1e-7) stats.deformedVertices++;
    if (influences[v] > 1) stats.overlapVertices++;
    if (winner[v] > 0 && alpha[v] < 1) stats.attenuatedVertices++;
    stats.maxDisplacement = Math.max(stats.maxDisplacement, distance);
  }
  const output: MeshBuffers = { ...mesh, positions, indices: indices.slice(), normals };
  delete output.cornerNormals;
  delete output.edgeNeighbors;
  delete output.barycentrics;
  delete output.interpolatedNormals;
  cellularCornerShading(output, meta.isTop, adjacent, meta.cellIds);
  // Preserve original per-face identity/random/activation byte-for-byte.
  if (mesh.cellularShading) output.cellularShading!.cells = mesh.cellularShading.cells.slice();
  return finish({ ...source, mesh: output });
}
