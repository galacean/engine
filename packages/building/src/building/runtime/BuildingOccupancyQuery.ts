import type { Matrix } from "@galacean/engine";
import type { ConstructionPreviewPart } from "./ConstructionPreview";

type V = [number, number, number];
type Point = [number, number];
export interface BuildingOccupancyPart {
  owner: string;
  min: V;
  max: V;
  footprint: Point[];
}

function hull(points: Point[]): Point[] {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  if (unique.length < 3) return unique;
  const chain = (list: Point[]) => {
    const result: Point[] = [];
    for (const p of list) {
      while (result.length > 1) {
        const a = result[result.length - 2],
          b = result[result.length - 1];
        if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) > 0) break;
        result.pop();
      }
      result.push(p);
    }
    result.pop();
    return result;
  };
  return [...chain(unique), ...chain(unique.slice().reverse())];
}

/** Conservative occupied volumes of the published building parts, independent of
 * render residency. Openings inside a part's envelope remain occupied. No triangles
 * or render arrays are retained. World footprints preserve rotated empty corners. */
export class BuildingOccupancyQuery {
  private constructor(private readonly parts: readonly BuildingOccupancyPart[]) {}

  static fromPreview(parts: readonly ConstructionPreviewPart[]): BuildingOccupancyQuery {
    const occupied: BuildingOccupancyPart[] = [];
    for (const part of parts) {
      if (!part.positions.length || !part.indices.length) continue;
      const min: V = [Infinity, Infinity, Infinity],
        max: V = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < part.positions.length; i++) {
        const axis = i % 3;
        min[axis] = Math.min(min[axis], part.positions[i]);
        max[axis] = Math.max(max[axis], part.positions[i]);
      }
      occupied.push({
        owner: part.owner,
        min,
        max,
        footprint: [
          [min[0], min[2]],
          [max[0], min[2]],
          [max[0], max[2]],
          [min[0], max[2]]
        ]
      });
    }
    return new BuildingOccupancyQuery(occupied);
  }

  static fromBounds(
    bounds: readonly { owner: string; min: readonly number[]; max: readonly number[] }[]
  ): BuildingOccupancyQuery {
    return new BuildingOccupancyQuery(
      bounds.map((b) => ({
        owner: b.owner,
        min: [...b.min] as V,
        max: [...b.max] as V,
        footprint: [
          [b.min[0], b.min[2]],
          [b.max[0], b.min[2]],
          [b.max[0], b.max[2]],
          [b.min[0], b.max[2]]
        ]
      }))
    );
  }

  static fromSnapshot(parts: readonly BuildingOccupancyPart[]): BuildingOccupancyQuery {
    return new BuildingOccupancyQuery(parts);
  }
  snapshot() {
    return this.parts;
  }
  withoutOwner(owner: string) {
    return new BuildingOccupancyQuery(this.parts.filter((p) => p.owner !== owner));
  }
  hasSameGeometry(other: BuildingOccupancyQuery): boolean {
    return (
      this.parts.length === other.parts.length &&
      this.parts.every((p, i) => {
        const q = other.parts[i];
        return (
          p.owner === q.owner &&
          p.min.every((v, j) => v === q.min[j]) &&
          p.max.every((v, j) => v === q.max[j]) &&
          p.footprint.length === q.footprint.length &&
          p.footprint.every((v, j) => v[0] === q.footprint[j][0] && v[1] === q.footprint[j][1])
        );
      })
    );
  }
  transformed(matrix: Matrix): BuildingOccupancyQuery {
    const m = matrix.elements;
    return new BuildingOccupancyQuery(
      this.parts.map((part) => {
        const min: V = [Infinity, Infinity, Infinity],
          max: V = [-Infinity, -Infinity, -Infinity];
        const points: Point[] = [];
        for (const x of [part.min[0], part.max[0]])
          for (const y of [part.min[1], part.max[1]])
            for (const z of [part.min[2], part.max[2]]) {
              const p: V = [0, 1, 2].map((a) => m[a] * x + m[4 + a] * y + m[8 + a] * z + m[12 + a]) as V;
              for (let a = 0; a < 3; a++) {
                min[a] = Math.min(min[a], p[a]);
                max[a] = Math.max(max[a], p[a]);
              }
              points.push([p[0], p[2]]);
            }
        return { owner: part.owner, min, max, footprint: hull(points) };
      })
    );
  }
  get bounds() {
    return this.parts.map((p) => ({ min: [...p.min] as V, max: [...p.max] as V }));
  }

  intersectBounds(min: V, max: V): { building: string; subject: string } | null {
    if (![...min, ...max].every(Number.isFinite) || min.some((v, i) => v > max[i]))
      throw Error("Ordered finite occupancy bounds required");
    for (const p of this.parts) {
      if (p.min.some((v, i) => v > max[i] || p.max[i] < min[i])) continue;
      const polygon = p.footprint;
      let separated = false;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        const nx = b[1] - a[1],
          nz = a[0] - b[0];
        let lo = Infinity,
          hi = -Infinity;
        for (const q of polygon) {
          const d = q[0] * nx + q[1] * nz;
          lo = Math.min(lo, d);
          hi = Math.max(hi, d);
        }
        const qlo = nx * (nx < 0 ? max[0] : min[0]) + nz * (nz < 0 ? max[2] : min[2]);
        const qhi = nx * (nx < 0 ? min[0] : max[0]) + nz * (nz < 0 ? min[2] : max[2]);
        if (qhi < lo || qlo > hi) {
          separated = true;
          break;
        }
      }
      if (!separated) return { building: p.owner, subject: p.owner };
    }
    return null;
  }
}
