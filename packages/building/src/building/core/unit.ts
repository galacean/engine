import {
  finite,
  identityMatrix,
  multiply,
  quatFromEuler,
  rotation,
  scaling,
  sub,
  transformPoint,
  translation,
  vec3,
  type Mat4,
  type Vec3
} from "./math";

/** Opaque, serializable asset reference. Only the packing layer interprets it. */
export type AssetRef = string | Readonly<Record<string, unknown>>;
/** Normalized stretch factors, per unit-local axis, applied on top of `scale`. */
export interface UnitRange {
  readonly min: Vec3;
  readonly max: Vec3;
}
/** The laying unit prototype. A laying algorithm consumes it and lays copies of it. */
export interface BuildingUnit {
  readonly source: AssetRef;
  /** Local bounds of the source asset, measured by the asset layer. */
  readonly bounds?: { readonly min: Vec3; readonly max: Vec3 };
  /** Normalized point in `bounds` that lands on the laying frame. Default: the center. */
  readonly pivot?: Vec3;
  /** Offset in the laying frame, in metres. */
  readonly position?: Vec3;
  /** Euler degrees, Galacean `Transform.rotation` order. */
  readonly rotation?: Vec3;
  /** Brings the source asset to its size in the building. */
  readonly scale?: Vec3;
  /** How far an algorithm may stretch each axis. Default: [1, 1, 1] to [1, 1, 1]. */
  readonly range?: UnitRange;
  /** Salt mixed into every laid unit seed of this prototype. */
  readonly seed?: number;
}

const ONE: Vec3 = [1, 1, 1];
const EPSILON = 1e-9;

export function unitIssue(unit: BuildingUnit): string | undefined {
  try {
    if (!unit || (typeof unit.source !== "string" && (typeof unit.source !== "object" || unit.source === null)))
      return "Unit needs a source asset reference";
    if (unit.bounds) {
      const min = vec3(unit.bounds.min, "Unit bounds min"),
        max = vec3(unit.bounds.max, "Unit bounds max");
      if (!min.every((v, i) => max[i] >= v)) return "Unit bounds max must not be below min";
    }
    if (unit.pivot) {
      if (!unit.bounds) return "Unit pivot needs bounds";
      vec3(unit.pivot, "Unit pivot");
    }
    if (unit.position) vec3(unit.position, "Unit position");
    if (unit.rotation) vec3(unit.rotation, "Unit rotation");
    if (unit.scale && !vec3(unit.scale, "Unit scale").every((v) => v > 0)) return "Unit scale must be positive";
    if (unit.range) {
      const min = vec3(unit.range.min, "Unit range min"),
        max = vec3(unit.range.max, "Unit range max");
      if (!min.every((v, i) => v > 0 && max[i] >= v)) return "Unit range needs 0 < min <= max";
    }
    if (unit.seed !== undefined && !Number.isSafeInteger(finite(unit.seed, "Unit seed")))
      return "Unit seed must be an integer";
  } catch (error) {
    return (error as Error).message;
  }
}
/** Issue when a stretch leaves the prototype's range. */
export function stretchIssue(unit: BuildingUnit, stretch: Vec3): string | undefined {
  const { min, max } = unit.range ?? { min: ONE, max: ONE };
  for (let i = 0; i < 3; i++)
    if (!Number.isFinite(stretch[i]) || stretch[i] < min[i] - EPSILON || stretch[i] > max[i] + EPSILON)
      return `Stretch ${stretch.join(", ")} is outside the unit range`;
}
/** T(position) · R(rotation) · S(scale ⊙ stretch) · T(-pivot point). */
export function unitMatrix(unit: BuildingUnit, stretch: Vec3 = ONE): number[] {
  let m: Mat4 = identityMatrix();
  if (unit.position) m = translation(unit.position);
  if (unit.rotation) m = multiply(m, rotation(quatFromEuler(unit.rotation)));
  const s = unit.scale ?? ONE;
  m = multiply(m, scaling([s[0] * stretch[0], s[1] * stretch[1], s[2] * stretch[2]]));
  if (!unit.bounds) return [...m];
  const { min, max } = unit.bounds,
    pivot = unit.pivot ?? [0.5, 0.5, 0.5];
  return multiply(m, translation([0, 1, 2].map((i) => -(min[i] + pivot[i] * (max[i] - min[i]))) as unknown as Vec3));
}
/** Bounds of a laid copy in the laying frame, or undefined when the asset bounds are unknown. */
export function unitBox(unit: BuildingUnit, stretch: Vec3 = ONE): { min: Vec3; max: Vec3 } | undefined {
  if (!unit.bounds) return;
  const m = unitMatrix(unit, stretch),
    { min, max } = unit.bounds;
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const p = transformPoint(m, [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  }
  return { min: lo as unknown as Vec3, max: hi as unknown as Vec3 };
}
/** Size of an unstretched laid copy along the laying frame axes. */
export function unitExtent(unit: BuildingUnit): Vec3 | undefined {
  const box = unitBox(unit);
  return box && sub(box.max, box.min);
}
/** The unit-local axis that ends up along a laying frame axis, for axis-aligned rotations. */
export function unitAxisAlong(unit: BuildingUnit, frameAxis: 0 | 1 | 2): 0 | 1 | 2 {
  const r = rotation(quatFromEuler(unit.rotation ?? [0, 0, 0]));
  let best: 0 | 1 | 2 = 0;
  for (const i of [1, 2] as const) if (Math.abs(r[i * 4 + frameAxis]) > Math.abs(r[best * 4 + frameAxis])) best = i;
  return best;
}
/** Size of an unstretched laid copy along the unit's own axes: bounds × scale. */
export function unitNominal(unit: BuildingUnit): Vec3 {
  if (!unit.bounds) throw Error("Sizing a unit needs its bounds");
  const s = unit.scale ?? ONE,
    { min, max } = unit.bounds;
  return [(max[0] - min[0]) * s[0], (max[1] - min[1]) * s[1], (max[2] - min[2]) * s[2]];
}
/** Normalized stretch of a laid size against the nominal size. */
export function unitStretch(unit: BuildingUnit, size: Vec3): Vec3 {
  const nominal = unitNominal(unit);
  return [0, 1, 2].map((i) =>
    nominal[i] > 0 ? size[i] / nominal[i] : size[i] === 0 ? 1 : Infinity
  ) as unknown as Vec3;
}
/** Whether a laid size stays inside the unit's range. */
export function unitFits(unit: BuildingUnit, size: Vec3): boolean {
  return stretchIssue(unit, unitStretch(unit, size)) === undefined;
}
