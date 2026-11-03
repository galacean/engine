/** Recovered Gothic roof strip generator, 0x1011a848c. Static profile vertices
 * are original authored constants from 0x101114f14, not generated scene caches. */
import {
  f32,
  add,
  sub,
  mul,
  div,
  sqrt,
  dot,
  cross,
  lerp,
  roofHeight,
  expandedDimensions,
  RoofCurve,
  quaternionAxes,
  sincos
} from "./RecoveredRoofMath";
import type { RoofSurface, RoofFootprint } from "./RecoveredRoofMath";
import { RecoveredCottageRoofSection } from "./RecoveredCottageRoofSampler";
import { packRoof } from "./RecoveredRoofPlacement";
import type { GothicTransform } from "./GothicBlueprint";
import { IDENTITY_UNIT_SCALE, type UnitFootprintScale } from "./MaterialFootprint";
const PROFILES = [
  [
    [0, 0.93],
    [0.15, 0.78],
    [0.26, 0.6],
    [0.32, 0.4],
    [0.35, 0.19],
    [0.35, 0]
  ],
  [
    [0, 1.07],
    [0.18, 0.95],
    [0.34, 0.81],
    [0.46, 0.63],
    [0.54, 0.44],
    [0.59, 0.23],
    [0.59, 0]
  ],
  [
    [0, 1.45],
    [0.19, 1.34],
    [0.36, 1.19],
    [0.5, 1.02],
    [0.61, 0.82],
    [0.69, 0.62],
    [0.73, 0.4],
    [0.76, 0.18],
    [0.76, 0]
  ]
];
/** Same authored peak as the strip producer; installation must not duplicate it. */
export function gothicRoofProfilePeak(rank: 1 | 2 | 3, scaleY = 1): number {
  return mul(PROFILES[rank - 1][0][1], scaleY);
}

class Random {
  state: bigint;
  constructor(seed: bigint) {
    this.state = seed;
  }
  bits() {
    this.state = BigInt.asUintN(64, this.state + 0xa0761d6478bd642fn);
    const p = this.state * (this.state ^ 0xe7037ed1a0b428dbn);
    return Number((p ^ (p >> 64n)) & 0xffffffffn);
  }
  next() {
    return (this.bits() >>> 9) / 2 ** 23;
  }
  signed() {
    let v = this.bits(),
      p = BigInt(v) * 200n;
    while ((p & 0xffffffffn) < 96n) {
      v = this.bits();
      p = BigInt(v) * 200n;
    }
    return Number(p >> 32n) - 100;
  }
}
function splits(n: number, jitter: number, rng: Random) {
  const step = div(1, n - 1),
    amp = Math.min(f32(jitter), mul(step, 0.495));
  return [0, ...Array.from({ length: n - 2 }, (_, i) => add(mul(i + 1, step), mul(sub(rng.next(), 0.5), amp))), 1];
}
function length(v: number[]) {
  return sqrt(dot(v, v));
}
function norm(v: number[]) {
  const r = div(1, length(v));
  return v.map((x) => mul(x, r));
}
function qmul(a: number[], b: number[]) {
  const [x, y, z, w] = a,
    [X, Y, Z, W] = b;
  return [
    add(add(mul(w, X), mul(x, W)), sub(mul(y, Z), mul(z, Y))),
    add(add(mul(w, Y), mul(y, W)), sub(mul(z, X), mul(x, Z))),
    add(add(mul(w, Z), mul(z, W)), sub(mul(x, Y), mul(y, X))),
    sub(sub(sub(mul(w, W), mul(x, X)), mul(y, Y)), mul(z, Z))
  ];
}
function rotate(v: number[], q: number[]) {
  const [x, y, z, w] = q,
    axis = [x, y, z],
    d = mul(dot(v, axis), 2),
    t = sub(mul(w, w), dot(axis, axis)),
    c = cross(axis, v),
    w2 = add(w, w);
  return v.map((x, i) => add(mul(c[i], w2), add(mul(x, t), mul(axis[i], d))));
}
function transform(v: number[], t: GothicTransform) {
  const [x, y, z, w] = t.rotation,
    x2 = add(x, x),
    y2 = add(y, y),
    z2 = add(z, z);
  const a = [sub(1, add(mul(y2, y), mul(z2, z))), add(mul(y2, x), mul(z2, w)), sub(mul(z2, x), mul(y2, w))].map((v) =>
      mul(v, t.scale[0])
    ),
    b = [sub(mul(y2, x), mul(z2, w)), sub(1, add(mul(x, x2), mul(z2, z))), add(mul(z2, y), mul(x2, w))].map((v) =>
      mul(v, t.scale[1])
    );
  return t.translation.map((p, i) => add(p, add(mul(a[i], v[0]), mul(b[i], v[1]))));
}
export function gothicRoofIntersection(s: RoofSurface, f: RoofFootprint, y: number, p: number[]): number[] | null {
  const h = roofHeight(s, f),
    base = s.base_height;
  if (y !== base && !(y >= base && y < add(base, h))) return null;
  const t =
    y === base ? 0 : f32(Math.pow(div(sub(y, base), h), div(1, add(mul(s.profile, 1.5), mul(sub(1, s.profile), 0.5)))));
  if ("radius" in f) {
    const radius = mul(sub(1, t), f.radius),
      d = norm([sub(p[0], f.center[0]), sub(p[2], f.center[1])]);
    return [add(f.center[0], mul(d[0], radius)), y, add(f.center[1], mul(d[1], radius))];
  }
  const [, top] = expandedDimensions(s, f),
    size = [f.width, f.depth].map((v, i) => lerp(v, top[i], sub(1, sub(1, t)))),
    section = new RecoveredCottageRoofSection({ ...f, width: size[0], depth: size[1] });
  const closest = section.closestRectanglePoint(p[0], p[2]);
  return [closest[0], y, closest[1]];
}
export interface GothicTile {
  id: string;
  role: "ridge" | "tile";
  position: number[];
  rotation: number[];
  scale: number[];
  initial64_hex: string;
  side: number;
  row: number;
  column: number;
}
export function gothicRoofTiles(
  id: string,
  rank: 1 | 2 | 3,
  t: GothicTransform,
  s: RoofSurface,
  f: RoofFootprint,
  slot: number,
  unitScale: UnitFootprintScale = IDENTITY_UNIT_SCALE,
  tileSeed?: bigint
): GothicTile[] {
  const profiles = [1, -1].map(
    (sign) => new RoofCurve(PROFILES[rank - 1].map(([x, y]) => transform([mul(x, sign), f32(y), 0], t)))
  );
  return gothicRoofTilesFromProfiles(id, profiles as [RoofCurve, RoofCurve], t, s, f, slot, unitScale, tileSeed);
}

/** Original shared strip assembler also consumes half-Gothic and arrow profiles.
 * Keep subdivision, RNG, packing and host intersection under this single owner. */
export function gothicRoofTilesFromProfiles(
  id: string,
  profiles: readonly [RoofCurve, RoofCurve],
  t: GothicTransform,
  s: RoofSurface,
  f: RoofFootprint,
  slot: number,
  unitScale: UnitFootprintScale = IDENTITY_UNIT_SCALE,
  tileSeed?: bigint
): GothicTile[] {
  const peak = profiles[0].points[0],
    back = gothicRoofIntersection(s, f, peak[1], peak);
  if (!back) return [];
  const delta = peak.map((v, i) => sub(v, back[i])),
    depth = length(delta),
    extended = peak.map((v, i) => add(v, mul(delta[i], 0.05)));
  const seed = tileSeed ?? BigInt(Math.trunc(length(t.translation.map((v) => mul(v, 10))))),
    rng = new Random(seed),
    out: GothicTile[] = [];
  const emit = (
    role: "ridge" | "tile",
    p: number[],
    q: number[],
    scale: number[],
    side: number,
    row: number,
    column: number
  ) => {
    const ordinal = rng.signed();
    let hex = packRoof(p, q, scale, 0, slot, ordinal >>> 0, 0);
    hex = hex.slice(0, 96) + "0000803f" + hex.slice(104);
    out.push({
      id: `${id}/${role}/${side}/${row}/${column}`,
      role,
      position: p,
      rotation: q,
      scale,
      initial64_hex: hex,
      side,
      row,
      column
    });
  };
  // Host target specifications change native strip subdivision, leaving the
  // authored arch profile, body transform and opening in their original space.
  const ridge = splits(
      Math.max(2, Math.floor(add(div(depth, mul(0.46875, unitScale.width)), 0.5))),
      div(mul(0.09375, unitScale.width), depth),
      rng
    ),
    along = norm(extended.map((v, i) => sub(v, back[i]))),
    right = norm(cross(along, [0, 1, 0])),
    up = cross(right, along),
    rq = quaternionAxes(right, along, up);
  for (let col = 0; col < ridge.length - 1; col++) {
    const a = ridge[col],
      b = ridge[col + 1],
      u = mul(add(a, b), 0.5);
    emit(
      "ridge",
      extended.map((v, i) => add(mul(back[i], u), mul(v, sub(1, u)))),
      rq,
      [mul(0.1, unitScale.height), mul(mul(depth, sub(b, a)), 1.2), mul(0.2, unitScale.depth)],
      0,
      0,
      col
    );
  }
  const rows = splits(
      Math.max(2, Math.ceil(div(depth, mul(0.3, unitScale.width)))),
      div(mul(0.03, unitScale.width), depth),
      rng
    ),
    forward = rotate([0, 0, 1], t.rotation);
  for (let side = 0; side < 2; side++) {
    const curve = profiles[side],
      columns = splits(
        Math.max(2, Math.ceil(div(curve.length, mul(0.320000022649765, unitScale.height)))),
        div(mul(0.03200000151991844, unitScale.height), curve.length),
        rng
      ),
      fwd = rotate([0, 0, side === 0 ? 1 : -1], t.rotation);
    for (let row = 0; row < rows.length - 1; row++) {
      const depthWidth = mul(depth, sub(rows[row + 1], rows[row])),
        mid = mul(add(rows[row], rows[row + 1]), 0.5),
        offset = forward.map((v) => mul(v, -mul(depth, mid)));
      for (let col = 0; col < columns.length - 1; col++) {
        const a = curve.sample(columns[col]),
          b = curve.sample(columns[col + 1]),
          tangent = norm(b.map((v, i) => sub(v, a[i]))),
          normal = cross(tangent, fwd),
          q = quaternionAxes(fwd, normal, tangent),
          tilt = rng.next(),
          overlap = rng.next();
        const ov = mul(add(mul(overlap, 0.2), mul(sub(1, overlap), 0.1)), unitScale.height);
        const angle = mul(add(mul(tilt, 5), mul(sub(1, tilt), 2)), f32(0.01745329238474369)),
          [sn, cs] = sincos(mul(angle, 0.5));
        const quat = qmul(qmul(q, [sn, 0, 0, cs]), [f32(0.7071067690849304), 0, 0, f32(0.7071067690849304)]);
        const position = a.map((v, i) =>
          add(
            offset[i],
            add(
              add(add(mul(v, 0.5), mul(b[i], 0.5)), mul(mul(tangent[i], ov), 0.5)),
              mul(mul(normal[i], mul(-0.08000000566244125, unitScale.depth)), 0.5)
            )
          )
        );
        emit(
          "tile",
          position,
          quat,
          [depthWidth, add(length(a.map((v, i) => sub(v, b[i]))), ov), mul(0.08000000566244125, unitScale.depth)],
          side,
          row,
          col
        );
      }
    }
  }
  return out;
}
