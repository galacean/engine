/** Editor-side overlap of small convex installation volumes. The producer owns
 * the point cloud (including native dormer colliders); this module computes SAT
 * in double precision. It is not a port of Tiny Glade's physics/cache backend.
 * Called during editing, never during rendering. Touching is allowed, matching
 * the existing flat-roof and wall attachment policy.
 */
export interface DecorationConvexOccupancy {
  id: string;
  points: readonly (readonly number[])[];
  bounds: { min: number[]; max: number[] };
  faceAxes: number[][];
  chordAxes: number[][];
}
const sub = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v - b[i]);
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
function axis(v: number[]): number[] | undefined {
  const largest = Math.max(...v.map(Math.abs));
  return largest > 0 && Number.isFinite(largest) ? v.map((x) => x / largest) : undefined;
}

export function decorationConvexOccupancy(
  id: string,
  input: readonly (readonly number[])[]
): DecorationConvexOccupancy {
  const points: number[][] = [],
    seen = new Set<string>();
  for (const p of input) {
    if (p.length !== 3 || !p.every(Number.isFinite)) throw Error("Finite 3D installation points required");
    const key = JSON.stringify(p);
    if (!seen.has(key)) {
      seen.add(key);
      points.push(p.slice());
    }
  }
  if (points.length < 4) throw Error("A convex installation volume requires at least four distinct points");
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of points)
    for (let i = 0; i < 3; i++) {
      bounds.min[i] = Math.min(bounds.min[i], p[i]);
      bounds.max[i] = Math.max(bounds.max[i], p[i]);
    }
  const faceAxes: number[][] = [],
    chordAxes: number[][] = [];
  let hasVolume = false;
  for (let a = 0; a < points.length; a++)
    for (let b = a + 1; b < points.length; b++) {
      const ab = sub(points[b], points[a]),
        direction = axis(ab);
      if (direction) chordAxes.push(direction);
      for (let c = b + 1; c < points.length; c++) {
        const normal = axis(cross(ab, sub(points[c], points[a])));
        if (!normal) continue;
        let positive = false,
          negative = false;
        for (let d = 0; d < points.length; d++) {
          if (d === a || d === b || d === c) continue;
          const delta = sub(points[d], points[a]),
            distance = dot(normal, delta);
          // Arithmetic uncertainty only, relative to this face. No metre-scale
          // welding tolerance that could erase an explicitly narrow volume.
          const error = 16 * Number.EPSILON * delta.reduce((sum, v, i) => sum + Math.abs(v * normal[i]), 0);
          positive ||= distance > error;
          negative ||= distance < -error;
        }
        hasVolume ||= positive || negative;
        if (!(positive && negative)) faceAxes.push(normal);
      }
    }
  if (!hasVolume) throw Error("Degenerate convex installation volume");
  return { id, points, bounds, faceAxes, chordAxes };
}

export function decorationVolumesOverlap(a: DecorationConvexOccupancy, b: DecorationConvexOccupancy): boolean {
  for (let i = 0; i < 3; i++)
    if (a.bounds.max[i] <= b.bounds.min[i] || b.bounds.max[i] <= a.bounds.min[i]) return false;
  // Translate both clouds by one common origin to avoid cancellation at large
  // world coordinates. Adding chord cross products is a superset of all hull
  // edge-pair axes: it cannot introduce a separator for intersecting volumes.
  const origin = a.points[0],
    ap = a.points.map((p) => sub(p, origin)),
    bp = b.points.map((p) => sub(p, origin));
  const separated = (n: readonly number[]) => {
    let amin = Infinity,
      amax = -Infinity,
      bmin = Infinity,
      bmax = -Infinity,
      magnitude = 0;
    for (const p of ap) {
      const d = dot(n, p);
      amin = Math.min(amin, d);
      amax = Math.max(amax, d);
      magnitude = Math.max(
        magnitude,
        p.reduce((sum, v, i) => sum + Math.abs(v * n[i]), 0)
      );
    }
    for (const p of bp) {
      const d = dot(n, p);
      bmin = Math.min(bmin, d);
      bmax = Math.max(bmax, d);
      magnitude = Math.max(
        magnitude,
        p.reduce((sum, v, i) => sum + Math.abs(v * n[i]), 0)
      );
    }
    const error = 16 * Number.EPSILON * magnitude;
    return amax <= bmin + error || bmax <= amin + error;
  };
  for (const normal of [...a.faceAxes, ...b.faceAxes]) if (separated(normal)) return false;
  for (const x of a.chordAxes)
    for (const y of b.chordAxes) {
      const normal = axis(cross(x, y));
      if (normal && separated(normal)) return false;
    }
  return true;
}

/** Preserve an original collision mesh as individual surfaces. In particular,
 * Gothic dormer colliders are neither convex nor closed: taking their convex
 * hull would fill real empty regions and falsely reject nearby attachments.
 */
export function decorationTriangleOccupancy(
  id: string,
  input: readonly (readonly number[])[]
): DecorationConvexOccupancy | undefined {
  if (input.length !== 3 || input.some((p) => p.length !== 3 || !p.every(Number.isFinite)))
    throw Error("Three finite collision triangle vertices required");
  const points = input.map((p) => p.slice()),
    chordAxes = points.map((p, i) => sub(points[(i + 1) % 3], p));
  const normal = axis(cross(chordAxes[0], chordAxes[1]));
  if (!normal) return undefined;
  return {
    id,
    points,
    faceAxes: [normal],
    chordAxes,
    bounds: {
      min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))),
      max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])))
    }
  };
}
