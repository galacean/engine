/** Original get_collision_mesh 0x101168ed8 point construction only. Cache/convex hull excluded. */
import { f32 as f, add, sub, mul, div } from "./RecoveredRoofMath";
import { RecoveredCottageRoofSampler } from "./RecoveredCottageRoofSampler";
import { assertCottageRoofSpan } from "./RecoveredCottageDormerRoof";
import type { CottageDormerFrameTransform } from "./RecoveredCottageDormerPlacement";
const cross = (a: number[], b: number[]) => [
  sub(mul(a[1], b[2]), mul(a[2], b[1])),
  sub(mul(a[2], b[0]), mul(a[0], b[2])),
  sub(mul(a[0], b[1]), mul(a[1], b[0]))
];
function inverseRows(t: CottageDormerFrameTransform) {
  const [x, y, z, w] = t.quaternion,
    xx = add(x, x),
    yy = add(y, y),
    zz = add(z, z),
    xx2 = mul(x, xx),
    yy2 = mul(yy, y),
    zz2 = mul(zz, z),
    xy = mul(yy, x),
    xz = mul(zz, x),
    yz = mul(zz, y),
    xw = mul(xx, w),
    yw = mul(yy, w),
    zw = mul(zz, w);
  const a = [sub(1, add(yy2, zz2)), add(xy, zw), sub(xz, yw)].map((v) => mul(v, t.scale[0]));
  const b = [sub(xy, zw), sub(1, add(xx2, zz2)), add(yz, xw)].map((v) => mul(v, t.scale[1]));
  const c = [add(xz, yw), sub(yz, xw), sub(1, add(xx2, yy2))].map((v) => mul(v, t.scale[2]));
  const ab = cross(a, b),
    inv = div(1, add(mul(c[2], ab[2]), add(mul(c[0], ab[0]), mul(c[1], ab[1]))));
  return [cross(b, c), cross(c, a), ab].map((r) => r.map((v) => mul(v, inv)));
}
export function cottageDormerCollisionPoints(
  t: CottageDormerFrameTransform,
  rank: 1 | 2 | 3,
  roof: RecoveredCottageRoofSampler,
  width = f([0.8, 1.5, 2.2][rank - 1]),
  height = 1,
  padding = f(0.2)
) {
  const p = t.position,
    perimeter = roof.sectionAt(p).perimeter();
  assertCottageRoofSpan(add(width, padding), perimeter);
  const span = div(add(width, padding), perimeter),
    rise = add(height, padding),
    frontY = add(rise, p[1]),
    topY = add(mul(roof.height, [0.1, 0.15, 0.2][rank - 1]), frontY);
  const bottomSampleY = add(mul(topY, 0), p[1]),
    topSampleY = add(topY, mul(p[1], 0)),
    bottom = roof.sectionAt([p[0], bottomSampleY, p[2]]).expand(add(padding, 0)),
    top = roof.sectionAt([p[0], topSampleY, p[2]]).expand(add(mul(padding, 0), 0)),
    bottomCenter = bottom.closestU(p[0], p[2]),
    topCenter = top.closestU(p[0], p[2]);
  const rows = inverseRows(t),
    dot = (r: number[], v: number[]) => add(mul(r[2], v[2]), add(mul(r[1], v[1]), mul(r[0], v[0]))),
    origin = rows.map((r) => dot(r, p)),
    local = (v: number[]) => rows.map((r, i) => sub(dot(r, v), origin[i]));
  const wrap = (x: number) => {
    x = f(x % 1);
    return x < 0 ? add(x, 1) : x;
  };
  const at = (center: number, i: number, n: number) => {
    const a = wrap(add(mul(span, -0.5), center)),
      b = wrap(add(mul(span, 0.5), center)),
      q = div(i, add(n, -1)),
      lo = mul(sub(1, q), a),
      hi = mul(q, a > b ? add(b, 1) : b);
    return wrap(a > b ? add(lo, hi) : add(hi, lo));
  };
  const n = rank === 1 ? 2 : 3,
    output: number[][] = [];
  const by = add(mul(topY, 0), frontY),
    ty = add(topY, mul(frontY, 0));
  const baseDrop = sub(by, bottomSampleY),
    topDrop = sub(ty, topSampleY),
    zeroBase = mul(baseDrop, 0),
    zeroTop = mul(topDrop, 0),
    zeroRise = mul(rise, 0);
  const down = (v: number[], x: number, y: number, z: number) => [sub(v[0], x), sub(v[1], y), sub(v[2], z)];
  for (let i = 0; i < n - 1; i++) {
    const bl = bottom.point(at(bottomCenter, i, n)),
      br = bottom.point(at(bottomCenter, i + 1, n)),
      tl = top.point(at(topCenter, i, n)),
      tr = top.point(at(topCenter, i + 1, n));
    const a = local([bl[0], by, bl[1]]),
      b = local([br[0], by, br[1]]),
      c = local([tl[0], ty, tl[1]]),
      d = local([tr[0], ty, tr[1]]);
    output.push(a, b, c, b, d, c);
    // Native also emits this internal cap on segment1 of rank2/3; retain original order and duplicates.
    if (i === 0 || (i === 1 && n === 3)) {
      const a0 = down(a, zeroBase, baseDrop, zeroBase),
        c0 = down(c, zeroTop, topDrop, zeroTop);
      output.push(a, a0, c, a0, c0, c);
    }
    if (i === n - 2) {
      const b0 = down(b, zeroBase, baseDrop, zeroBase),
        d0 = down(d, zeroTop, topDrop, zeroTop);
      output.push(b0, b, d0, b, d, d0);
    }
    const a0 = down(a, zeroRise, mul(rise, 1), zeroRise),
      b0 = down(b, zeroRise, rise, zeroRise);
    output.push(a, b, a0, b, b0, a0);
  }
  return output;
}
