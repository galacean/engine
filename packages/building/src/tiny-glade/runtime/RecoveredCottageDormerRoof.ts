/** Evidence port of 0x10114412c and 0x101146e7c, target SHA4b3c8437….
 * Pure TypeScript; no original-function runtime replay. Sampling contracts
 * must implement the original roof cross section; arbitrary UV meshes are not equivalent.
 */
import { f32 as f, add, sub, mul, div, cross, lerp, quaternionAxes as axes } from "./RecoveredRoofMath";
import { f32BitsToHalf } from "./UnitPacking.js";
import { IDENTITY_UNIT_SCALE, type UnitFootprintScale } from "./MaterialFootprint";
type V = number[];
const sum = (a: V, b: V) => a.map((v, i) => add(v, b[i])),
  dif = (a: V, b: V) => a.map((v, i) => sub(v, b[i])),
  scale = (a: V, s: number) => a.map((v) => mul(v, s));
const dot = (a: V, b: V) =>
  a.length === 2 ? add(mul(a[0], b[0]), mul(a[1], b[1])) : add(add(mul(a[0], b[0]), mul(a[1], b[1])), mul(a[2], b[2]));
const len = (a: V) => f(Math.sqrt(dot(a, a))),
  norm = (a: V) => scale(a, div(1, len(a))),
  mid = (a: V, b: V) => sum(scale(a, 0.5), scale(b, 0.5));
function qmul(a: V, b: V): V {
  const [x, y, z, w] = a,
    [X, Y, Z, W] = b;
  return [
    add(add(mul(w, X), mul(x, W)), add(mul(y, Z), mul(z, -Y))),
    add(add(mul(w, Y), mul(x, -Z)), add(mul(y, W), mul(z, X))),
    add(add(mul(w, Z), mul(x, Y)), add(mul(y, -X), mul(z, W))),
    add(add(mul(w, W), mul(x, -X)), add(mul(y, -Y), mul(z, -Z)))
  ];
}
function rotationNormal(n: V): V {
  let x = norm([-n[2], 0, n[0]]);
  if (!x.every(Number.isFinite)) x = [1, 0, 0];
  let y = norm(cross(n, x));
  if (!y.every(Number.isFinite)) y = [0, 1, 0];
  return axes(x, y, n);
}
class CottageRandom {
  state: bigint;
  constructor(state: bigint) {
    this.state = state;
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
    let p = BigInt(this.bits()) * 200n;
    while ((p & 0xffffffffn) < 96n) p = BigInt(this.bits()) * 200n;
    return Number(p >> 32n) - 100;
  }
}
const splits = (n: number, j: number, r: CottageRandom) => {
  const step = div(1, n - 1),
    amp = Math.min(f(j), mul(step, 0.495));
  return [0, ...Array.from({ length: n - 2 }, (_, i) => add(mul(i + 1, step), mul(sub(r.next(), 0.5), amp))), 1];
};
export interface CottageStrip {
  role: "front" | "tile" | "trim-left" | "trim-right" | "wall-left" | "wall-right";
  row: number;
  column: number;
  position: V;
  rotation: V;
  scale: V;
  clip: V;
  slot: number;
  ordinal: number;
}
interface CottageColumn {
  A: V;
  B: V;
  C: V;
  D: V;
  sourceY: [number, number];
  row: number;
  column: number;
  last: boolean;
  frontHeight: number;
  frontBackMid: V;
}
/** Native column body, independently differential-verifiable using captured section samples. */
function cottageColumn(
  c: CottageColumn,
  rng: CottageRandom,
  slot: number,
  sideWalls = true,
  depthScale = 1
): CottageStrip[] {
  const { A, B, C, D, row, column } = c,
    out: CottageStrip[] = [];
  const emit = (role: CottageStrip["role"], position: V, rotation: V, size: V, clip: V = [0, 1, 0, 65504]) =>
    out.push({
      role,
      row,
      column,
      position,
      rotation,
      scale: [size[0], size[1], mul(size[2], depthScale)],
      clip,
      slot,
      ordinal: rng.signed()
    });
  const midAB = mid(A, B),
    midCD = mid(C, D),
    width = len(dif(B, A));
  if (row === 0) {
    const d = norm([sub(c.frontBackMid[0], midAB[0]), 0, sub(c.frontBackMid[2], midAB[2])]);
    emit("front", sum(midAB, scale(d, mul(c.frontHeight, 0.5))), axes([-d[2], 0, d[0]], d, [0, 1, 0]), [
      width,
      c.frontHeight,
      f(0.1)
    ]);
  }
  const y = norm(dif(midCD, midAB)),
    x = norm(dif(B, A)),
    base = axes(x, y, cross(x, y)),
    draw = rng.next();
  const halfAngle = mul(mul(sub(mul(draw, -10), mul(sub(1, draw), 2)), f(Math.PI / 180)), 0.5),
    q = qmul(base, [f(Math.sin(halfAngle)), 0, 0, f(Math.cos(halfAngle))]);
  emit("tile", scale(sum(sum(sum(A, B), C), D), 0.25), q, [width, add(len(dif(A, C)), 0.1), f(0.1)]);
  const side = (a: V, b: V, right: boolean) => {
    const d = dif(a, b),
      q = qmul(rotationNormal(norm(d)), [f(Math.SQRT1_2), 0, 0, f(Math.SQRT1_2)]);
    emit(right ? "trim-right" : "trim-left", mid(a, b), q, [f(0.15), add(len(d), 0.16), f(0.2)]);
    if (!sideWalls) return;
    const floor = add(Math.min(...c.sourceY), -0.1),
      x = norm([sub(b[0], a[0]), 0, sub(b[2], a[2])]),
      normal = cross(x, [0, 1, 0]);
    let p = [mul(add(b[0], a[0]), 0.5), add(mul(b[1], 0.5), mul(floor, 0.5)), mul(add(b[2], a[2]), 0.5)],
      q2 = axes(x, [0, 1, 0], normal);
    p = right ? dif(p, scale(normal, 0.08)) : sum(p, scale(normal, 0.08));
    if (!right) q2 = qmul(q2, [0, 1, 0, f(-4.371138828673793e-8)]);
    const n = cross(dif(b, a), normal),
      clip = [...n, -add(add(mul(b[2], n[2]), mul(b[0], n[0])), mul(b[1], n[1]))];
    emit(
      right ? "wall-right" : "wall-left",
      p,
      q2,
      [len([sub(b[0], a[0]), sub(b[2], a[2])]), sub(b[1], floor), f(0.1)],
      clip
    );
  };
  if (column === 0) side(A, C, false);
  if (c.last) side(B, D, true);
  return out;
}
export interface CottageRoofSection {
  closestU(x: number, z: number): number;
  point(u: number): [number, number];
  perimeter(): number;
  expand(amount: number): CottageRoofSection;
}
export interface CottageRoofSampler {
  height: number;
  sectionAt(position: V): CottageRoofSection;
}
/** Author resizing is a host extension. Native endpoint wrapping cannot encode
 * a full lap: it loses the winding count and can turn a wide installation into
 * a short, apparently valid strip. Check the unwrapped span before any samples.
 * This guard is not a recovered Tiny Glade UI constraint. */
export class CottageRoofSpanError extends RangeError {
  constructor(
    readonly span: number,
    readonly length: number
  ) {
    super("Dormer attachment span must be smaller than the roof-section perimeter");
  }
}
export function assertCottageRoofSpan(span: number, length: number): void {
  if (!(f(span) < f(length))) throw new CottageRoofSpanError(f(span), f(length));
}
const wrap = (a: number) => {
  const q = f(a - Math.trunc(a));
  return q < 0 ? add(q, 1) : q;
};
const wrappedLerp = (u: number, width: number, t: number) => {
  const a = wrap(add(u, mul(width, -0.5))),
    b = wrap(add(u, mul(width, 0.5)));
  return wrap(lerp(a, b < a ? add(b, 1) : b, t));
};
/** Entire native row/column schedule. Sampler must be Roof::get_roof_shape_from_pos_ws_clamped. */
export function assembleCottageDormerRoof(
  position: V,
  rank: 1 | 2 | 3,
  width: number,
  rise: number,
  expand: number,
  roof: CottageRoofSampler,
  slot: number,
  sideWalls = true,
  unitScale: UnitFootprintScale = IDENTITY_UNIT_SCALE,
  tileSeed?: bigint
): CottageStrip[] {
  if (position.length !== 3 || !position.every((v) => Number.isFinite(f(v))))
    throw Error("Finite dormer position required");
  if (
    ![1, 2, 3].includes(rank) ||
    ![width, roof.height].every((v) => Number.isFinite(f(v)) && f(v) > 0) ||
    ![rise, expand].every((v) => Number.isFinite(f(v)))
  )
    throw Error("Finite dormer parameters and positive width/roof height required");
  if (!Number.isInteger(slot) || slot < 0 || slot > 0xffffffff) throw Error("uint32 roof owner slot required");
  if (Object.values(unitScale).some((v) => !Number.isFinite(f(v)) || f(v) <= 0))
    throw Error("Positive finite material dimensions required");
  if (tileSeed !== undefined && (typeof tileSeed !== "bigint" || tileSeed < 0n || tileSeed >= 1n << 64n))
    throw Error("uint64 tile seed required");
  const p = position.map(f),
    shape0 = roof.sectionAt(p);
  assertCottageRoofSpan(width, shape0.perimeter());
  const frontY = add(p[1], rise),
    backY = add(frontY, mul(roof.height, [f(0.1), f(0.15), f(0.2)][rank - 1]));
  const xz0 = shape0.point(shape0.closestU(p[0], p[2])),
    shapeBack = roof.sectionAt([p[0], backY, p[2]]),
    xz1 = shapeBack.point(shapeBack.closestU(p[0], p[2]));
  const depth = len([sub(xz1[0], xz0[0]), sub(backY, frontY), sub(xz1[1], xz0[1])]),
    rng = new CottageRandom(tileSeed ?? BigInt(Math.trunc(len(scale(p, 10)))));
  if (!(depth > 0) || !Number.isFinite(depth) || !(backY > frontY) || !(shape0.perimeter() > 0))
    throw Error("Degenerate dormer roof section");
  const boundaries = splits(
      Math.max(2, Math.ceil(div(depth, mul(0.4, unitScale.height)))),
      div(mul(0.08000000566244125, unitScale.height), depth),
      rng
    ),
    basePerimeter = shape0.perimeter(),
    fraction = div(width, basePerimeter),
    out: CottageStrip[] = [];
  const ts = boundaries.map((t) => div(sub(lerp(frontY, backY, t), frontY), sub(backY, frontY)));
  for (let row = 0; row < ts.length - 1; row++) {
    const t0 = ts[row],
      t1 = ts[row + 1],
      y0 = lerp(p[1], backY, t0),
      y1 = lerp(p[1], backY, t1),
      a = roof.sectionAt([p[0], y0, p[2]]).expand(lerp(expand, 0, t0)),
      b = roof.sectionAt([p[0], y1, p[2]]).expand(lerp(expand, 0, t1));
    const u0 = a.closestU(p[0], p[2]),
      u1 = b.closestU(p[0], p[2]),
      rowWidth = mul(width, div(a.perimeter(), basePerimeter)),
      cols = splits(
        Math.max(2, Math.floor(div(rowWidth, mul(0.3, unitScale.width)))),
        div(mul(0.06000000238418579, unitScale.width), rowWidth),
        rng
      ),
      vy0 = lerp(frontY, backY, t0),
      vy1 = lerp(frontY, backY, t1);
    const point = (s: CottageRoofSection, u: number, y: number) => {
      const q = s.point(u);
      return [q[0], y, q[1]];
    };
    let frontHeight = 0;
    if (row === 0) {
      const left = a.point(wrap(add(u0, mul(fraction, -0.5)))),
        right = a.point(wrap(add(u0, mul(fraction, 0.5)))),
        center = a.point(u0);
      frontHeight = Math.max(add(len(dif(mid(left, right), center)), 0.1), f(0.3));
    }
    for (let column = 0; column < cols.length - 1; column++) {
      const l0 = wrappedLerp(u0, fraction, cols[column]),
        r0 = wrappedLerp(u0, fraction, cols[column + 1]),
        l1 = wrappedLerp(u1, fraction, cols[column]),
        r1 = wrappedLerp(u1, fraction, cols[column + 1]);
      for (const strip of cottageColumn(
        {
          A: point(a, l0, vy0),
          B: point(a, r0, vy0),
          C: point(b, l1, vy1),
          D: point(b, r1, vy1),
          sourceY: [y0, y1],
          row,
          column,
          last: column === cols.length - 2,
          frontHeight,
          frontBackMid: row === 0 ? mid(point(b, l1, vy0), point(b, r1, vy0)) : [0, 0, 0]
        },
        rng,
        slot,
        sideWalls,
        unitScale.depth
      ))
        out.push(strip);
    }
  }
  return out;
}

/** Native column format. Channel48=1 is mandatory; common roof packer's default0 is not this path. */
export function packCottageStrip64(v: CottageStrip): Uint8Array {
  const bytes = new Uint8Array(64),
    view = new DataView(bytes.buffer),
    tmp = new DataView(new ArrayBuffer(4));
  v.position.forEach((x, i) => view.setFloat32(i * 4, x, true));
  const half = (x: number) => {
    tmp.setFloat32(0, x, true);
    return f32BitsToHalf(tmp.getUint32(0, true));
  };
  [...v.clip, ...v.scale, 0, ...v.rotation].forEach((x, i) => view.setUint16(16 + i * 2, half(x), true));
  view.setUint32(40, v.slot, true);
  view.setFloat32(48, 1, true);
  view.setInt32(52, v.ordinal, true);
  return bytes;
}
