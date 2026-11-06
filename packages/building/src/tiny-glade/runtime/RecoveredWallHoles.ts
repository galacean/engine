/** Original finite AABB subdivision; intentionally not a generic Boolean difference.
 * 0x101034ec8 (resolve_hole_overlap), 0x1010640c4 (horizontal split), 0x1010e8268 (padding).
 */
import { f32, add, sub, mul, div, lerp } from "./RecoveredRoofMath";
import type { WallRect, WallPiece, WallHole } from "./WallTypes";
export const wallIntersects = (a: WallRect, b: WallRect) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const copy = (p: WallPiece): WallPiece => ({ ...p, bounds: [...p.bounds], deformation: [...p.deformation] });
function fromCenter(cx: number, cy: number, w: number, h: number): WallRect {
  return [sub(cx, mul(w, 0.5)), sub(cy, mul(h, 0.5)), add(cx, mul(w, 0.5)), add(cy, mul(h, 0.5))];
}
export function splitWallHorizontally(p: WallPiece, value: number): WallPiece[] {
  const a = add(mul(value, f32(0.3999999761581421)), 0.3),
    b = sub(1, a),
    r = p.bounds,
    h = sub(r[3], r[1]),
    w = sub(r[2], r[0]),
    cx = mul(add(r[0], r[2]), 0.5);
  const middle = [lerp(p.deformation[0], p.deformation[2], a), lerp(p.deformation[1], p.deformation[3], a)];
  return [
    {
      ...copy(p),
      bounds: fromCenter(cx, add(r[1], mul(mul(h, a), 0.5)), w, mul(h, a)),
      deformation: [p.deformation[0], p.deformation[1], middle[0], middle[1]],
      splitX: false,
      splitY: false
    },
    {
      ...copy(p),
      bounds: fromCenter(cx, sub(r[3], mul(mul(h, b), 0.5)), w, mul(h, b)),
      deformation: [middle[0], middle[1], p.deformation[2], p.deformation[3]],
      id: (p.id + 1) >>> 0,
      splitX: false,
      splitY: false
    }
  ];
}
export function normalizedWallHoles(
  holes: WallHole[],
  length: number,
  height: number,
  closed: boolean,
  padding = 0.46
): WallRect[] {
  const out: WallRect[] = [];
  for (const h of holes) {
    if (closed && h.flags & 0x100) continue;
    const shifts = [0];
    if (closed) {
      if (h.bounds[0] < f32(padding)) shifts.push(length);
      else if (length < add(padding, h.bounds[2])) shifts.push(-length);
    }
    for (const shift of shifts)
      out.push([
        mul(div(1, length), add(h.bounds[0], shift)),
        mul(div(1, height), h.bounds[1]),
        mul(div(1, length), add(h.bounds[2], shift)),
        mul(div(1, height), h.bounds[3])
      ]);
  }
  // from_curve calls stable sort 0x1010bfce8: ldr s8,[x10,#8] compares maxU.
  return out.sort((a, b) => a[2] - b[2]);
}
export function resolveWallHole(h: WallRect, queue: WallPiece[]): void {
  if (!(h[2] > h[0] && h[3] > h[1])) return;
  const hx = mul(add(h[0], h[2]), 0.5),
    hy = mul(add(h[1], h[3]), 0.5),
    hw = mul(sub(h[2], h[0]), 0.5),
    hh = mul(sub(h[3], h[1]), 0.5);
  const remove = (i: number) => {
    if (i !== queue.length - 1) queue[i] = queue.at(-1)!;
    queue.pop();
  };
  let i = 0;
  while (i < queue.length) {
    const p = queue[i],
      r = p.bounds,
      d = p.deformation,
      w = sub(r[2], r[0]),
      height = sub(r[3], r[1]),
      cx = mul(add(r[0], r[2]), 0.5),
      cy = mul(add(r[1], r[3]), 0.5);
    // The original tests reconstructed center +/- half dimensions. Retaining the
    // apparently redundant operations is essential at coincident hole edges.
    const test = fromCenter(cx, cy, w, height);
    const inside = (x: number, y: number) => x >= h[0] && x <= h[2] && y >= h[1] && y <= h[3];
    const c = [inside(test[0], test[1]), inside(test[2], test[1]), inside(test[0], test[3]), inside(test[2], test[3])],
      n = c.filter(Boolean).length;
    if (n === 4) {
      remove(i);
      continue;
    }
    if (n === 2) {
      const q = copy(p);
      q.id %= 10;
      if (c[0] && c[2]) {
        const cut = sub(add(hx, hw), test[0]);
        q.bounds = fromCenter(add(cx, mul(cut, 0.5)), cy, sub(w, cut), height);
        q.deformation[0] = 0;
        q.deformation[2] = 0;
      } else if (c[1] && c[3]) {
        const cut = sub(test[2], sub(hx, hw));
        q.bounds = fromCenter(sub(cx, mul(cut, 0.5)), cy, sub(w, cut), height);
        q.deformation[1] = 0;
        q.deformation[3] = 0;
      } else if (c[0] && c[1]) {
        const cut = sub(add(hy, hh), test[1]);
        q.bounds = fromCenter(cx, add(cy, mul(cut, 0.5)), w, sub(height, cut));
        q.deformation[0] = 0;
        q.deformation[1] = 0;
      } else if (c[2] && c[3]) {
        const cut = sub(test[3], sub(hy, hh));
        q.bounds = fromCenter(cx, sub(cy, mul(cut, 0.5)), w, sub(height, cut));
        q.deformation[2] = 0;
        q.deformation[3] = 0;
      } else throw Error("Opposite-only AABB corners");
      queue[i++] = q;
      continue;
    }
    if (n === 1) {
      const cut = c[0] || c[2] ? add(hx, hw) : sub(hx, hw),
        t = Math.max(0, Math.min(1, div(sub(cut, test[0]), sub(test[2], test[0])))),
        v = sub(1, t);
      const removed = c[0] || c[1] ? sub(add(hy, hh), test[1]) : sub(test[3], sub(hy, hh));
      const remainingHeight = sub(height, removed),
        remainingCenter = c[0] || c[1] ? add(cy, mul(removed, 0.5)) : sub(cy, mul(removed, 0.5));
      const lw = mul(t, w),
        rw = mul(v, w),
        left = copy(p),
        right = copy(p);
      left.bounds = fromCenter(
        add(r[0], mul(lw, 0.5)),
        c[0] || c[2] ? remainingCenter : cy,
        lw,
        c[0] || c[2] ? remainingHeight : height
      );
      right.bounds = fromCenter(
        sub(r[2], mul(rw, 0.5)),
        c[1] || c[3] ? remainingCenter : cy,
        rw,
        c[1] || c[3] ? remainingHeight : height
      );
      left.id = p.id % 10;
      right.id = (p.id + 1) % 10;
      // Original assigns complementary weights when the right corner is cut.
      left.deformation = d.map((x) => mul(x, c[1] || c[3] ? v : t)) as WallPiece["deformation"];
      right.deformation = d.map((x) => mul(x, c[1] || c[3] ? t : v)) as WallPiece["deformation"];
      if (c[0]) left.deformation[0] = left.deformation[1] = 0;
      if (c[2]) left.deformation[2] = left.deformation[3] = 0;
      if (c[1]) right.deformation[0] = right.deformation[1] = 0;
      if (c[3]) right.deformation[2] = right.deformation[3] = 0;
      queue.unshift(left);
      queue.unshift(right);
      i += 2;
      remove(i);
      continue;
    }
    if (n !== 0) throw Error("Impossible AABB overlap");
    if (!p.splitX && r[0] < h[0] && h[2] < r[2]) {
      const a = copy(p),
        b = copy(p),
        half = mul(w, 0.5);
      a.bounds = fromCenter(add(r[0], mul(half, 0.5)), cy, half, height);
      b.bounds = fromCenter(sub(r[2], mul(half, 0.5)), cy, half, height);
      a.splitX = b.splitX = true;
      a.deformation = [0, 0, mul(d[2], 0.5), mul(d[3], 0.5)];
      b.deformation = [...a.deformation];
      b.id = (p.id + 100) >>> 0;
      queue[i] = a;
      queue.push(b);
    } else if (!p.splitY && r[1] < h[1] && h[3] < r[3]) {
      const a = copy(p),
        b = copy(p),
        half = mul(height, 0.5);
      a.bounds = fromCenter(cx, add(r[1], mul(half, 0.5)), w, half);
      b.bounds = fromCenter(cx, sub(r[3], mul(half, 0.5)), w, half);
      a.splitY = b.splitY = true;
      a.deformation = [0, 0, mul(d[2], 0.5), mul(d[3], 0.5)];
      b.deformation = [...a.deformation];
      b.id = (p.id + 100) >>> 0;
      queue[i] = a;
      queue.push(b);
    } else i++;
  }
}
