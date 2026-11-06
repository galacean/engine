/** Original add_wall_corners 0x1010e5894, no-gable branch. */
import { f32, add, sub, mul, div, sqrt, lerp, RoofCurve, RoofRandom, randomSplits } from "./RecoveredRoofMath";
import { encodeBrick96 } from "./UnitPacking.js";
import { IDENTITY_UNIT_SCALE, type UnitFootprintScale } from "./MaterialFootprint";
import { resolveWallHole, wallIntersects } from "./RecoveredWallHoles";
import type { WallRect, WallPiece, WallInstance } from "./WallTypes";
export interface WallCornerInput {
  variationKey?: string;
  unitScale?: UnitFootprintScale;
  id: string;
  slot: number;
  control: RoofCurve;
  points: [number, number, number][];
  bottom: number[];
  top: number[];
  third: number[];
  closed: boolean;
  lowerTop: boolean;
  gableEave?: number;
  holes: { centerU: number; centerY: number; width: number; height: number; kind: number }[];
}
const centerRect = (x: number, y: number, w: number, h: number): WallRect => [
  sub(x, mul(w, 0.5)),
  sub(y, mul(h, 0.5)),
  add(x, mul(w, 0.5)),
  add(y, mul(h, 0.5))
];
function findCorners(c: RoofCurve, closed: boolean): number[] {
  const p = c.points,
    out: number[] = [];
  // Original constants are fixed 80 and 100 degree f32 inputs to cosf.
  const thresholdLo = f32(Math.cos(f32(1.7453292608261108))),
    thresholdHi = f32(Math.cos(f32(1.3962633609771729)));
  for (let i = closed ? 0 : 1; i < p.length - 1; i++) {
    const a = p[i ? i - 1 : p.length - 2],
      b = p[i],
      d = p[i + 1];
    const x = sub(b[0], a[0]),
      z = sub(b[1], a[1]),
      u = sub(d[0], b[0]),
      v = sub(d[1], b[1]);
    const cosine = div(add(mul(x, u), mul(z, v)), sqrt(mul(add(mul(x, x), mul(z, z)), add(mul(u, u), mul(v, v)))));
    if (Number.isFinite(cosine) && cosine >= thresholdLo && cosine < thresholdHi) out.push(i);
  }
  return out;
}
function rotation(dx: number, dz: number) {
  let inv = div(1, sqrt(add(mul(dx, dx), mul(dz, dz))));
  dx = mul(dx, inv);
  dz = mul(dz, inv);
  // xz_rotation_mat3_bad normalizes its input and then its cross-product X axis.
  let a = f32(-dz),
    b = dx;
  inv = div(1, sqrt(add(mul(a, a), mul(b, b))));
  a = mul(a, inv);
  b = mul(b, inv);
  const y = sub(mul(a, 0), mul(b, 0)),
    z = sub(0, a);
  inv = div(1, sqrt(add(mul(z, z), add(mul(b, b), mul(y, y)))));
  return [mul(b, inv), mul(y, inv), mul(z, inv), 0, 1, 0, a, 0, b];
}
export function generateWallCorners(q: WallCornerInput) {
  const scale = q.unitScale ?? IDENTITY_UNIT_SCALE;
  if (
    q.points.length < 2 ||
    q.points.some((p) => p.length !== 3) ||
    [...q.points.flat(), ...q.bottom, ...q.top, ...q.third].some((x) => !Number.isFinite(x)) ||
    q.lowerTop
  )
    throw Error("This corner producer requires a finite profile and no flat-roof lowering");
  if (
    !Number.isInteger(q.slot) ||
    q.slot < 0 ||
    q.slot > 0xffffffff ||
    q.holes.some(
      (h) =>
        [h.centerU, h.centerY, h.width, h.height, h.kind].some((x) => !Number.isFinite(x)) ||
        h.width < 0 ||
        h.height < 0
    )
  )
    throw Error("Invalid corner owner or hole");
  const c = q.control,
    L = c.length,
    profile = new RoofCurve(q.points.map((p) => [p[0], p[2]]));
  if (q.points.length !== q.top.length || q.top.length !== q.bottom.length || q.top.length !== q.third.length)
    throw Error("Corner profile dimensions differ");
  const project = (u: number) => {
    if (!q.closed) return Math.max(0, Math.min(L, u));
    const r = f32(u % L);
    return r < 0 ? add(r, L) : r;
  };
  const value = (values: number[], u: number, delta = false) => {
    const [i, t] = profile.coord(u);
    return delta ? add(values[i], mul(t, sub(values[i + 1], values[i]))) : lerp(values[i], values[i + 1], t);
  };
  const world = (x: number) => {
    const u = div(x, L),
      pos = c.sample(Math.max(0, Math.min(1, u)));
    if (x >= 0 && x <= L) return pos;
    let tangent = c.tangent(Math.max(0, Math.min(1, u))),
      inv = div(1, sqrt(add(mul(tangent[0], tangent[0]), mul(tangent[1], tangent[1]))));
    tangent = tangent.map((v) => mul(v, inv));
    return pos.map((v, i) => (x > L ? add(v, mul(tangent[i], sub(x, L))) : sub(v, mul(tangent[i], x))));
  };
  const output: WallInstance[] = [],
    occupancy: WallCornerInput["holes"] = [];
  for (const k of findCorners(c, q.closed)) {
    const u = mul(c.knots[k], L),
      bottom = value(q.bottom, c.knots[k], true);
    let top = value(q.top, c.knots[k], true);
    if (q.lowerTop) top = sub(top, 0.46);
    else if (k === 0) top = Math.max(top, add(q.top.at(-2)!, sub(q.top.at(-1)!, q.top.at(-2)!)));
    let serial = q.holes.reduce(
      (a, h) => (Math.abs(sub(u, h.centerU)) < f32(0.01) ? a + Math.max(0, Math.trunc(h.centerY)) : a),
      0
    );
    const rng = new RoofRandom(BigInt.asUintN(64, BigInt(serial + k))),
      n = Math.max(2, Math.ceil(div(sub(top, bottom), mul(0.69, scale.height))));
    const ys = randomSplits(n, div(mul(0.21, scale.height), sub(top, bottom)), rng).map((t) => lerp(bottom, top, t));
    for (let row = 0; row + 1 < ys.length; row++) {
      const r = rng.next();
      let width = mul(add(sub(mul(r, 0.16), mul(sub(1, r), 0.16)), 0.92), scale.width);
      const last = row === n - 2 && q.closed;
      if (last) width = mul(0.76, scale.width);
      if (q.gableEave !== undefined && q.gableEave <= ys[row]) width = mul(0.56, scale.width);
      const height = sub(ys[row + 1], ys[row]);
      if (!(height > 0 && width > 0)) continue;
      const half = mul(width, 0.5),
        shift = sub(sub(half, mul(0.28, scale.depth)), mul(0.0385, scale.depth)),
        cx = project(add(u, mul(row % 2 ? -1 : 1, shift))),
        cy = mul(add(ys[row + 1], ys[row]), 0.5);
      const rect = centerRect(cx, cy, width, height);
      let pieces: WallPiece[] = [{ bounds: rect, deformation: [0, 0, 0, 0], id: 0, splitX: false, splitY: false }];
      for (const hole of q.holes) {
        const h = centerRect(hole.centerU, hole.centerY, hole.width, hole.height),
          hs = [h];
        if (q.closed) {
          if (add(hole.centerU, mul(hole.width, 0.5)) > L)
            hs.push(centerRect(sub(hole.centerU, L), hole.centerY, hole.width, hole.height));
          else if (hole.centerU < mul(hole.width, 0.5))
            hs.push(centerRect(add(hole.centerU, L), hole.centerY, hole.width, hole.height));
        }
        for (const h of hs) {
          if (last) {
            if (h[0] <= cx && cx < h[2]) {
              if (cy < hole.centerY) rect[3] = Math.min(rect[3], h[1]);
              else if (hole.centerY < cy) rect[1] = Math.max(rect[1], h[3]);
            }
          } else if (wallIntersects(h, rect)) resolveWallHole(h, pieces);
        }
      }
      if (last && sub(rect[3], rect[1]) <= mul(0.1, scale.height)) pieces = [];
      const us = [div(project(sub(cx, half)), L), div(cx, L), div(project(add(cx, half)), L)];
      let lower = us.map((t) => value(q.third, t));
      if (add(add(lower[0], lower[1]), lower[2]) <= 0) lower = [-100, -100, -100];
      else lower = lower.map((v, i) => add(v, value(q.bottom, us[i])));
      if (lower.every((v) => v > ys[row + 1])) continue;
      serial++;
      const prev = c.points[k ? k - 1 : c.points.length - 2],
        at = c.points[k],
        next = c.points[k + 1],
        direction = row % 2 ? [sub(at[0], prev[0]), sub(at[1], prev[1])] : [sub(next[0], at[0]), sub(next[1], at[1])],
        rot = rotation(direction[0], direction[1]);
      for (const p of pieces) {
        const w = sub(p.bounds[2], p.bounds[0]),
          h = sub(p.bounds[3], p.bounds[1]);
        if (w <= mul(0.1, scale.width) || height <= mul(0.1, scale.height) || h <= 0) continue;
        const x = mul(add(p.bounds[0], p.bounds[2]), 0.5),
          y = mul(add(p.bounds[1], p.bounds[3]), 0.5),
          pos = world(x);
        const bytes = new Uint8Array(96),
          v = new DataView(bytes.buffer),
          values = [
            ...rot.slice(0, 3).map((v) => mul(v, w)),
            ...rot.slice(3, 6).map((v) => mul(v, h)),
            ...rot.slice(6, 9).map((v) => mul(v, mul(0.637, scale.depth))),
            pos[0],
            y,
            pos[1],
            0,
            0,
            0,
            0,
            ...lower
          ];
        values.forEach((x, i) => v.setFloat32(i * 4, x, true));
        v.setUint32(76, serial, true);
        v.setUint32(80, q.slot, true);
        v.setFloat32(84, sub(x, mul(w, 0.5)), true);
        v.setFloat32(88, add(x, mul(w, 0.5)), true);
        v.setUint32(92, Math.abs(sub(y, top)) < f32(0.75) ? 20 : 4, true);
        output.push({
          id: `${q.id}/corner/${output.length}`,
          ...(q.variationKey !== undefined ? { seed_id: `${q.variationKey}/corner/${output.length}` } : {}),
          sourceId: serial,
          row,
          column: k,
          domain96: bytes,
          packed64: encodeBrick96(bytes)
        });
        occupancy.push({ centerU: x, centerY: y, width: w, height: h, kind: 2 });
      }
    }
  }
  return { instances: output, occupancy };
}
