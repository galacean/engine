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
  private readonly minX: number;
  private readonly minY: number;
  private readonly minZ: number;
  private readonly maxX: number;
  private readonly maxY: number;
  private readonly maxZ: number;

  private constructor(private readonly parts: readonly BuildingOccupancyPart[]) {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.min[0] < minX) minX = p.min[0];
      if (p.min[1] < minY) minY = p.min[1];
      if (p.min[2] < minZ) minZ = p.min[2];
      if (p.max[0] > maxX) maxX = p.max[0];
      if (p.max[1] > maxY) maxY = p.max[1];
      if (p.max[2] > maxZ) maxZ = p.max[2];
    }
    this.minX = minX;
    this.minY = minY;
    this.minZ = minZ;
    this.maxX = maxX;
    this.maxY = maxY;
    this.maxZ = maxZ;
  }

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
    const min0 = min[0],
      min1 = min[1],
      min2 = min[2],
      max0 = max[0],
      max1 = max[1],
      max2 = max[2];
    if (
      !Number.isFinite(min0) ||
      !Number.isFinite(min1) ||
      !Number.isFinite(min2) ||
      !Number.isFinite(max0) ||
      !Number.isFinite(max1) ||
      !Number.isFinite(max2) ||
      min0 > max0 ||
      min1 > max1 ||
      min2 > max2
    )
      throw Error("Ordered finite occupancy bounds required");
    const parts = this.parts;
    if (
      parts.length === 0 ||
      this.minX > max0 ||
      this.maxX < min0 ||
      this.minY > max1 ||
      this.maxY < min1 ||
      this.minZ > max2 ||
      this.maxZ < min2
    )
      return null;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      const pmin = p.min,
        pmax = p.max;
      if (pmin[0] > max0 || pmax[0] < min0 || pmin[1] > max1 || pmax[1] < min1 || pmin[2] > max2 || pmax[2] < min2)
        continue;
      const polygon = p.footprint;
      let separated = false;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        const nx = b[1] - a[1],
          nz = a[0] - b[0];
        let lo = Infinity,
          hi = -Infinity;
        for (let j = 0; j < polygon.length; j++) {
          const q = polygon[j];
          const d = q[0] * nx + q[1] * nz;
          if (d < lo) lo = d;
          if (d > hi) hi = d;
        }
        const qlo = nx * (nx < 0 ? max0 : min0) + nz * (nz < 0 ? max2 : min2);
        const qhi = nx * (nx < 0 ? min0 : max0) + nz * (nz < 0 ? min2 : max2);
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
