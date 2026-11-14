import type { PlanPoint, PlanRoute } from "../../semantic-study/IslandPlanModel";
import { SETTLEMENT_PROFILE as profile } from "../../planning-data/SettlementProfile";

type RoadKeypoint = NonNullable<PlanRoute["keypoints"]>[number];
const pointDistance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const direction = (a: PlanPoint, b: PlanPoint): PlanPoint => {
  const length = pointDistance(a, b) || 1;
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
};

/** Sample the single road spline representation without building pavement or navigation records.
 * @param input Ordered positions, tangent directions and metre widths; inputs are never mutated.
 * @param options Closed-loop flag, handle scale and optional angular refinement for short bends.
 * @returns Authoritative keys and corresponding centreline/width samples, including exact endpoints.
 * @throws RangeError For invalid keys, widths or angular refinement.
 */
export function sampleRoadSpline(
  input: readonly RoadKeypoint[],
  options: { closed?: boolean; tension?: number; angleDegrees?: number } = {}
): { keys: RoadKeypoint[]; points: PlanPoint[]; widths: number[]; closed: boolean } {
  if (options.angleDegrees !== undefined && (!Number.isFinite(options.angleDegrees!) || options.angleDegrees! <= 0))
    throw new RangeError("Road angular sampling must be finite and positive");
  const keys = input.map((key) => ({
    position: { x: key.position.x, z: key.position.z },
    width: key.width,
    ...(key.tangent ? { tangent: { ...key.tangent } } : {})
  }));
  if (options.closed && keys.length > 1 && pointDistance(keys[0].position, keys.at(-1)!.position) < 1e-8) keys.pop();
  if (
    keys.length < 2 ||
    keys.some(
      (key) =>
        !Number.isFinite(key.width) ||
        key.width <= 0 ||
        !Number.isFinite(key.position.x) ||
        !Number.isFinite(key.position.z)
    )
  )
    throw new RangeError("Road keys require finite positions and positive widths");
  const closed = options.closed ?? false;
  const tangents = keys.map((key, i) => {
    if (key.tangent) return direction({ x: 0, z: 0 }, key.tangent);
    const a = keys[closed ? (i + keys.length - 1) % keys.length : Math.max(0, i - 1)].position;
    const b = keys[closed ? (i + 1) % keys.length : Math.min(keys.length - 1, i + 1)].position;
    return direction(a, b);
  });
  const points: PlanPoint[] = [],
    widths: number[] = [];
  const spans = closed ? keys.length : keys.length - 1;
  for (let i = 0; i < spans; i++) {
    const j = (i + 1) % keys.length,
      a = keys[i],
      b = keys[j];
    const length = pointDistance(a.position, b.position);
    if (length < 1e-8) continue;
    // Metre spacing alone omits the entire spline on short turning spans. Refine
    // those spans by their endpoint directions, without oversampling straight runs.
    const chord = direction(a.position, b.position);
    const turn =
      options.angleDegrees !== undefined
        ? [tangents[i], tangents[j]].reduce(
            (sum, tangent) => sum + Math.acos(Math.max(-1, Math.min(1, chord.x * tangent.x + chord.z * tangent.z))),
            0
          )
        : 0;
    const count = Math.max(
      1,
      Math.ceil(length / profile.road.surfaceSampleSpacingM),
      options.angleDegrees !== undefined ? Math.ceil((2 * turn) / ((options.angleDegrees! * Math.PI) / 180)) : 0
    );
    for (let k = 0; k < count; k++) {
      const t = k / count,
        t2 = t * t,
        t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1,
        h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2,
        h11 = t3 - t2;
      const coordinate = (axis: "x" | "z") =>
        h00 * a.position[axis] +
        h10 * length * (options.tension ?? 1) * tangents[i][axis] +
        h01 * b.position[axis] +
        h11 * length * (options.tension ?? 1) * tangents[j][axis];
      points.push({ x: coordinate("x"), z: coordinate("z") });
      // Zero width derivative at each key is continuous and cannot overshoot explicit bounds.
      widths.push(a.width + (b.width - a.width) * (3 * t2 - 2 * t3));
    }
  }
  const end = closed ? keys[0] : keys.at(-1)!;
  points.push({ ...end.position });
  widths.push(end.width);
  if (points.length < 2) throw new RangeError("Road keys require two distinct positions");
  return { keys, points, widths, closed };
}
