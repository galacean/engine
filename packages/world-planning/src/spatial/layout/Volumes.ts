import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { envelope } from "../../semantic-study/IslandPlanAtoms";

/** A world-space box. Y is the bottom elevation; yaw is in radians. Dimensions are metres. */
export interface VolumeBox {
  center: PlanPoint;
  elevation: number;
  width: number;
  depth: number;
  height: number;
  yaw: number;
}
/** A logical occupied volume. Its component boxes may overlap and need not fill their enclosing bounds. */
export interface Volume {
  id: string;
  owner: string;
  boxes: VolumeBox[];
}
/** An explicit symmetric exclusion between two sets of volume IDs. No names or asset types are interpreted. */
export interface VolumeExclusion {
  id: string;
  a: string[];
  b: string[];
}
/** Broad-phase bounds in the ground plane; vertical overlap is tested in the narrow phase. */
export interface Bounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
/** @returns World X/Z bounds, optionally expanded in metres. */
export function bounds(points: readonly PlanPoint[], margin = 0): Bounds {
  const result = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const point of points) {
    result.x0 = Math.min(result.x0, point.x);
    result.z0 = Math.min(result.z0, point.z);
    result.x1 = Math.max(result.x1, point.x);
    result.z1 = Math.max(result.z1, point.z);
  }
  return { x0: result.x0 - margin, z0: result.z0 - margin, x1: result.x1 + margin, z1: result.z1 + margin };
}
/** @returns Whether two broad-phase rectangles touch or overlap. */
export function intersects(a: Bounds, b: Bounds): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
}
/** @returns The box's ground-plane footprint; a footprint alone is not an exclusion rule. */
export function boxOutline(box: VolumeBox): PlanPoint[] {
  return envelope(box.center, box.width, box.depth, box.yaw);
}
/** Compare only ground-plane occupancy. Height/elevation edits still require 3D checks, not 2D rerouting. */
export function sameVolumeFootprint(a: Volume, b: Volume | undefined): boolean {
  return (
    !!b &&
    a.boxes.length === b.boxes.length &&
    a.boxes.every((box, i) => {
      const old = b.boxes[i];
      return (
        box.center.x === old.center.x &&
        box.center.z === old.center.z &&
        box.width === old.width &&
        box.depth === old.depth &&
        box.yaw === old.yaw
      );
    })
  );
}
/** @returns Positive-volume intersection of yaw-oriented boxes. Face contact within 1e-6 m is allowed. */
export function boxesOverlap(a: VolumeBox, b: VolumeBox): boolean {
  const epsilon = 1e-6;
  if (Math.min(a.elevation + a.height, b.elevation + b.height) - Math.max(a.elevation, b.elevation) <= epsilon)
    return false;
  const cornersA = boxOutline(a),
    cornersB = boxOutline(b);
  for (const yaw of [a.yaw, b.yaw])
    for (const angle of [yaw, yaw + Math.PI / 2]) {
      const x = Math.cos(angle),
        z = Math.sin(angle);
      const aa = cornersA.map((p) => p.x * x + p.z * z),
        bb = cornersB.map((p) => p.x * x + p.z * z);
      if (Math.min(Math.max(...aa), Math.max(...bb)) - Math.max(Math.min(...aa), Math.min(...bb)) <= epsilon)
        return false;
    }
  return true;
}
/** Spatial index plus explicit relations. A read-only neighbour query never grants permission to move that neighbour. */
export class VolumeIndex {
  private bins = new Map<string, Set<string>>();
  private volumes = new Map<string, { volume: Volume; box: Bounds }>();
  private exclusions = new Map<string, Set<string>[]>();
  constructor(
    relations: readonly VolumeExclusion[] = [],
    private cellM = 32
  ) {
    if (!Number.isFinite(cellM) || cellM <= 0) throw new Error("空间索引单元须大于零");
    for (const relation of relations) {
      const a = new Set(relation.a),
        b = new Set(relation.b);
      for (const [members, targets] of [
        [a, b],
        [b, a]
      ])
        for (const id of members) {
          const groups = this.exclusions.get(id) ?? [];
          groups.push(targets);
          this.exclusions.set(id, groups);
        }
    }
  }
  private keys(box: Bounds): string[] {
    const result: string[] = [];
    for (let x = Math.floor(box.x0 / this.cellM); x <= Math.floor(box.x1 / this.cellM); x++)
      for (let z = Math.floor(box.z0 / this.cellM); z <= Math.floor(box.z1 / this.cellM); z++) result.push(`${x}:${z}`);
    return result;
  }
  /** Insert/replace one logical volume. Empty or non-finite geometry is a data error, not a spatial rule. */
  set(volume: Volume): void {
    if (
      !volume.boxes.length ||
      volume.boxes.some(
        (b) =>
          ![b.center.x, b.center.z, b.elevation, b.width, b.depth, b.height, b.yaw].every(Number.isFinite) ||
          Math.min(b.width, b.depth, b.height) <= 0
      )
    )
      throw new Error("空间体量需要有效的正尺寸 OBB");
    this.remove(volume.id);
    const copy = structuredClone(volume),
      box = bounds(copy.boxes.flatMap(boxOutline));
    this.volumes.set(copy.id, { volume: copy, box });
    for (const key of this.keys(box)) {
      const bin = this.bins.get(key) ?? new Set();
      bin.add(copy.id);
      this.bins.set(key, bin);
    }
  }
  /** Remove one ID; unrelated geometry and relations remain unchanged. */
  remove(id: string): void {
    const old = this.volumes.get(id);
    if (old)
      for (const key of this.keys(old.box)) {
        const bin = this.bins.get(key)!;
        bin.delete(id);
        if (!bin.size) this.bins.delete(key);
      }
    this.volumes.delete(id);
  }
  /** Query nearby footprints without inventing an exclusion relation. */
  nearby(candidate: Volume, margin = 0): Volume[] {
    const box = bounds(candidate.boxes.flatMap(boxOutline), margin),
      seen = new Set<string>();
    const result: Volume[] = [];
    for (const key of this.keys(box))
      for (const id of this.bins.get(key) ?? []) {
        if (seen.has(id) || id === candidate.id) continue;
        seen.add(id);
        const item = this.volumes.get(id)!;
        if (intersects(box, item.box)) result.push(item.volume);
      }
    return result;
  }
  /** @returns Only actual overlaps with explicitly mutually exclusive volumes. Self-parts are never tested. */
  conflicts(candidate: Volume): string[] {
    const excluded = this.exclusions.get(candidate.id);
    if (!excluded?.length) return [];
    const box = bounds(candidate.boxes.flatMap(boxOutline)),
      seen = new Set<string>(),
      conflicts: string[] = [];
    for (const key of this.keys(box))
      for (const id of this.bins.get(key) ?? []) {
        if (id === candidate.id || seen.has(id) || !excluded.some((group) => group.has(id))) continue;
        seen.add(id);
        const item = this.volumes.get(id)!;
        if (intersects(box, item.box) && candidate.boxes.some((a) => item.volume.boxes.some((b) => boxesOverlap(a, b))))
          conflicts.push(id);
      }
    return conflicts.sort();
  }
}
