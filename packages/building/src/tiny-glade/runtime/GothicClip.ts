/** Original DormerHole48 domain, plus explicitly bounded editor-only chords.
 * The GPU must receive raw48; polygon planes do not replace its cubic predicate. */
const dot = (a: number[], b: number[]) => a.reduce((v, x, i) => v + x * b[i], 0),
  scale = (a: number[], s: number) => a.map((x) => x * s);
export interface DormerDomain {
  position: number[];
  size: number[];
  normal: number[];
  k: number;
  a: number;
  wall_slot_id: number;
  axes: number[][];
  y_min: number;
  y_max: number;
  x_world_scale: number;
}
export type ClipPlane = [number[], number];
export function decodeDormer(raw: Uint8Array): DormerDomain {
  if (raw.length !== 48) throw Error("DormerHole48 required");
  const v = new DataView(raw.buffer, raw.byteOffset, 48),
    f = (i: number) => v.getFloat32(i * 4, true),
    position = [f(0), f(1), f(2)],
    size = [f(4), f(5), f(6)],
    nx = f(8),
    nz = f(9),
    k = f(10),
    a = f(11),
    normal = [nx, 0, nz],
    norm2 = dot(normal, normal);
  if (![...position, ...size, nx, nz, k, a].every(Number.isFinite) || norm2 <= 0 || Math.min(...size) <= 0)
    throw Error("Invalid native hole transform");
  return {
    position,
    size,
    normal,
    k,
    a,
    wall_slot_id: v.getUint32(12, true),
    axes: [scale([-nz, 0, nx], 1 / (norm2 * size[0])), [0, 1 / size[1], 0], scale(normal, 1 / (norm2 * size[2]))],
    y_min: -0.5,
    y_max: k === 1 ? 0.5 : Math.fround(0.7),
    x_world_scale: Math.sqrt(norm2) * size[0]
  };
}
export function dormerHalfWidth(d: DormerDomain, y: number) {
  const t = Math.min(1, Math.max(0, y * d.k + d.a));
  return 0.5 * (1 - t * t * t);
}
export function dormerContains(d: DormerDomain, p: number[]) {
  const delta = p.map((v, i) => v - d.position[i]),
    [x, y, z] = d.axes.map((a) => dot(a, delta));
  return Math.abs(x) < dormerHalfWidth(d, y) && d.y_min < y && y < d.y_max && Math.abs(z) < 0.5;
}
export function dormerSupportClip(raw: Uint8Array, worldTolerance = 0.0001) {
  if (!Number.isFinite(worldTolerance) || worldTolerance <= 0)
    throw Error("Positive finite support tolerance required");
  const d = decodeDormer(raw),
    { k, a } = d,
    p = d.position;
  let lo = d.y_min,
    hi = d.y_max;
  const planes: ClipPlane[] = [];
  const result = (method: string, bound = 0, knots: number[] = []) => ({
    domain: d,
    planes,
    method,
    side_error_bound_world: bound,
    requested_world_tolerance: worldTolerance,
    y_knots: knots
  });
  if (Math.max(k * lo + a, k * hi + a) <= 0) {
    const n = d.normal,
      n2 = dot(n, n),
      x = [-n[2], 0, n[0]];
    for (const [axis, extent, lower, upper] of [
      [scale(x, 1 / n2), d.size[0], -0.5, 0.5],
      [[0, 1, 0], d.size[1], lo, hi],
      [scale(n, 1 / n2), d.size[2], -0.5, 0.5]
    ] as [number[], number, number, number][]) {
      planes.push([axis, -dot(axis, p) - lower * extent], [scale(axis, -1), dot(axis, p) + upper * extent]);
    }
    return result("exact_box_specialization");
  }
  if (k > 0) hi = Math.min(hi, (1 - a) / k);
  else if (k < 0) lo = Math.max(lo, (1 - a) / k);
  if (hi <= lo || (k === 0 && a >= 1)) {
    planes.push([[0, 0, 0], -1]);
    return result("exact_empty_domain");
  }
  const ys = [lo, hi];
  if (k && lo < -a / k && -a / k < hi) ys.push(-a / k);
  ys.sort((a, b) => a - b);
  const knots = [ys[0]],
    dtMax = Math.sqrt((8 * worldTolerance) / (3 * d.x_world_scale));
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i],
      y1 = ys[i + 1],
      t0 = Math.min(1, Math.max(0, k * y0 + a)),
      t1 = Math.min(1, Math.max(0, k * y1 + a)),
      count = Math.max(1, Math.ceil(Math.abs(t1 - t0) / dtMax));
    if (count > 100000) throw Error("Support subdivision budget exceeded");
    for (let j = 1; j <= count; j++) knots.push(y0 + ((y1 - y0) * j) / count);
  }
  const [ax, ay, az] = d.axes,
    plane = (axis: number[], c: number) => planes.push([axis, c - dot(axis, p)]);
  plane(ay, -lo);
  plane(scale(ay, -1), hi);
  plane(az, 0.5);
  plane(scale(az, -1), 0.5);
  let bound = 0;
  for (let i = 0; i < knots.length - 1; i++) {
    const y0 = knots[i],
      y1 = knots[i + 1],
      w0 = dormerHalfWidth(d, y0),
      w1 = dormerHalfWidth(d, y1),
      slope = (w1 - w0) / (y1 - y0),
      intercept = w0 - slope * y0;
    for (const sign of [-1, 1])
      plane(
        ax.map((x, j) => slope * ay[j] + sign * x),
        intercept
      );
    const dt = Math.min(1, Math.max(0, k * y1 + a)) - Math.min(1, Math.max(0, k * y0 + a));
    bound = Math.max(bound, (3 / 8) * dt * dt * d.x_world_scale);
  }
  return result("inward_cubic_chords", bound, knots);
}
