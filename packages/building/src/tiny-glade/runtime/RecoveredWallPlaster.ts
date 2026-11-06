/** Original level and gable wall plaster grid and patch construction, 0x101051fdc.
 * GPU-address-bearing patch fields are represented as side + vertex offset;
 * the renderer owns resource allocation. This is not a captured mesh replay.
 */
import { recoveredSinCosF32 } from "./RecoveredSine";
import { FLAT_PLASTER_CROWN, FLAT_PLASTER_NO_RIM_SHORTENING } from "./PlasterFinishPolicy";
import { f32, add, sub, mul, div, sqrt, lerp } from "./RecoveredRoofMath";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import type { WallConnectionShape, WallConnectionFinalHole } from "./WallConnectionTypes";
export interface WallPlasterPatch {
  side: number;
  firstVertex: number;
  quadCount: number;
  rowStride: number;
  bounds: [number, number, number, number];
}
export interface WallPlasterOptions {
  baseY?: number;
  flatRoof?: boolean;
  flatWithoutRim?: boolean;
  holes?: WallConnectionFinalHole[];
  sincos?: (x: number) => [number, number];
}
interface Grid {
  u: number;
  y: number;
  clip: number;
  edge: number;
  normal: number[];
  discard: boolean;
}
export function generateWallPlaster(
  shape: WallConnectionShape,
  p: PublishedWallProfile,
  options: WallPlasterOptions = {}
) {
  const holes = options.holes ?? [];
  for (const h of holes)
    if (![h.minU, h.maxU, h.minY, h.maxY].every(Number.isFinite) || h.minU > h.maxU || h.minY > h.maxY)
      throw Error("Finite ordered plaster hole bounds required");
  const L = p.control.length,
    base = f32(options.baseY ?? 0),
    maxY = p.topY,
    span = sub(maxY, base),
    gridSize = (v: number) => Math.max(2, Math.min(65535, Math.floor(div(v, 0.4) + 0.5)));
  if (
    p.points.length < 2 ||
    p.points.length !== p.bottom.length ||
    p.points.length !== p.third.length ||
    [...p.points.flat(), ...p.bottom, ...p.third, L, span].some((x) => !Number.isFinite(x)) ||
    !(L > 0)
  )
    throw Error("Finite plaster profile required");
  if (!Number.isFinite(base) || !(span > 0)) throw Error("Positive plaster height required");
  const sincos = options.sincos ?? recoveredSinCosF32;
  const ranges: number[][] = [];
  if (shape.type === "circle") ranges.push([0, 1]);
  else {
    const sum = add(shape.width, shape.depth),
      perimeter = add(sum, sum),
      knots = [
        0,
        div(shape.depth, perimeter),
        div(sum, perimeter),
        div(add(add(shape.depth, shape.depth), shape.width), perimeter),
        1
      ];
    for (let i = 0; i < 4; i++) ranges.push([add(knots[i], 1e-7), sub(knots[i + 1], 1e-7)]);
  }
  const sides: { columns: number; rows: number; vertices48: Uint8Array }[] = [],
    patches: WallPlasterPatch[] = [];
  for (const [start, end] of ranges) {
    const gableSide = !!p.gable && p.gable.ranges.some((v, j) => j % 2 === 0 && Math.abs(v - start) < 1e-6),
      sideSpan = gableSide ? sub(add(maxY, p.roofRise ?? 0), base) : span;
    // Original generate_plaster_mesh: is_flat_w_no_rim shortens the side
    // by .79-.15; flat tops constrain erosion to top-y-.3.
    const height = options.flatWithoutRim ? Math.max(0, sub(sideSpan, FLAT_PLASTER_NO_RIM_SHORTENING)) : sideSpan;
    if (height === 0) continue;
    // Keep the recovered regular grid byte-for-byte when there are no openings.
    // Finite wall apertures use host-side exact chart subdivision: insert every
    // rectangle boundary, then omit only quads contained in that hole. This is
    // explicit TS clipping, not a claim of native window-SDF byte parity.
    const stations = (lo: number, hi: number, count: number, extra: number[]) => {
      const base = Array.from({ length: count }, (_, i) => lerp(lo, hi, div(i, count - 1)));
      if (!extra.length) return base;
      const out = [...new Set([...base, ...extra.filter((v) => v > lo && v < hi).map(f32)])].sort((a, b) => a - b);
      if (out.length > 65535) throw Error("Plaster aperture grid exceeds uint16 row stride");
      return out;
    };
    const sideHoles = holes.filter(
      (h) => h.maxU > mul(start, L) && h.minU < mul(end, L) && h.maxY > base && h.minY < add(base, height)
    );
    const us = stations(
      mul(start, L),
      mul(end, L),
      gridSize(mul(sub(end, start), L)),
      sideHoles.flatMap((h) => [h.minU, h.maxU])
    );
    const ys = stations(
      base,
      add(base, height),
      gridSize(sideSpan),
      sideHoles.flatMap((h) => [h.minY, h.maxY])
    );
    const columns = us.length,
      rows = ys.length,
      grid: Grid[] = new Array(columns * rows);
    for (let x = 0; x < columns; x++) {
      const u = sideHoles.length ? us[x] : mul(L, lerp(start, end, div(x, columns - 1)));
      // Original CurveSlice remaps published points to XZ before measuring segments.
      let i = 0,
        remaining = Math.max(0, u),
        segment = 0,
        t = 0;
      for (; i < p.points.length - 1; i++) {
        const a = p.points[i],
          b = p.points[i + 1],
          dx = sub(b[0], a[0]),
          dz = sub(b[2], a[2]);
        segment = sqrt(add(mul(dz, dz), mul(dx, dx)));
        remaining = sub(segment, remaining);
        if (remaining >= 0) {
          t = sub(1, div(remaining, segment));
          break;
        }
        remaining = f32(-remaining);
      }
      if (i >= p.points.length - 1) {
        i = p.points.length - 2;
        t = 1;
      }
      const top = add(p.top[i], mul(t, sub(p.top[i + 1], p.top[i]))),
        bottom = add(p.bottom[i], mul(t, sub(p.bottom[i + 1], p.bottom[i]))),
        third = add(p.third[i], mul(t, sub(p.third[i + 1], p.third[i]))),
        lower = third > 0 ? add(bottom, third) : -3.4028234663852886e38;
      let normal: number[];
      if (shape.type === "circle") {
        const tau = f32(Math.PI * 2);
        let phase = f32(f32(shape.phase) % tau);
        if (phase < 0) phase = add(phase, tau);
        const [s, c] = sincos(add(mul(sub(1, div(u, L)), tau), phase));
        normal = [c, 0, s];
      } else {
        const [c, s] = shape.orientation,
          k = ranges.findIndex((r) => r[0] === start);
        normal = k === 0 ? [-c, 0, -s] : k === 1 ? [-s, 0, c] : k === 2 ? [c, 0, s] : [s, 0, -c];
      }
      for (let y = 0; y < rows; y++) {
        const yy = sideHoles.length ? ys[y] : add(base, mul(height, div(y, rows - 1))),
          edge = Math.min(
            sub(yy, lower),
            options.flatRoof ? sub(sub(maxY, yy), FLAT_PLASTER_CROWN) : Infinity,
            gableSide ? sub(sub(top, 0.46), yy) : Infinity
          );
        grid[y * columns + x] = {
          u,
          y: yy,
          clip: 1,
          edge,
          normal,
          discard: yy < sub(bottom, base <= 0 ? 0.5 : 0) || (gableSide && yy > top)
        };
      }
    }
    const verts: number[][] = grid.map((g) => {
      const pos = p.control.sample(div(g.u, L)),
        s = Math.min(1, Math.max(0, g.edge)),
        blend = sub(1, mul(mul(s, s), sub(3, add(s, s))));
      return [
        add(mul(g.normal[0], 0.2975), pos[0]),
        add(mul(g.normal[1], 0.2975), g.y),
        add(mul(g.normal[2], 0.2975), pos[1]),
        Math.min(g.clip, g.edge),
        ...g.normal,
        add(mul(blend, 5), sub(1, blend)),
        g.u,
        g.y,
        0,
        0
      ];
    });
    const side = sides.length,
      bytes = new Uint8Array(verts.length * 48),
      view = new DataView(bytes.buffer);
    verts.forEach((v, i) => v.forEach((x, k) => view.setFloat32(i * 48 + k * 4, x, true)));
    sides.push({ columns, rows, vertices48: bytes });
    for (let y = 0; y < rows - 1; y++) {
      let current: WallPlasterPatch | undefined;
      for (let x = 0; x < columns - 1; x++) {
        const a = y * columns + x,
          b = a + columns;
        const inHole = sideHoles.some(
          (h) =>
            grid[a].u >= h.minU - 1e-6 &&
            grid[a + 1].u <= h.maxU + 1e-6 &&
            grid[a].y >= h.minY - 1e-6 &&
            grid[b].y <= h.maxY + 1e-6
        );
        if (inHole || [a, a + 1, b, b + 1].every((i) => grid[i].discard)) {
          current = undefined;
          continue;
        }
        if (!current || current.quadCount >= 32) {
          current = { side, firstVertex: a, quadCount: 0, rowStride: columns, bounds: [0, 0, 0, 0] };
          patches.push(current);
        }
        current.quadCount++;
      }
    }
    for (const patch of patches.filter((x) => x.side === side)) {
      let x = 0,
        y = 0,
        z = 0,
        count = 0;
      for (let k = 0; k <= patch.quadCount; k++) {
        const a = verts[patch.firstVertex + k],
          b = verts[patch.firstVertex + k + columns];
        x = add(b[0], add(x, a[0]));
        y = add(b[1], add(y, a[1]));
        z = add(add(z, a[2]), b[2]);
        count = add(count, 2);
      }
      const inv = div(1, count);
      x = mul(x, inv);
      y = mul(y, inv);
      z = mul(z, inv);
      let max = 0;
      for (let k = 0; k <= patch.quadCount; k++) {
        const a = verts[patch.firstVertex + k],
          b = verts[patch.firstVertex + k + columns];
        let dx = sub(x, a[0]),
          dy = sub(y, a[1]),
          dz = sub(z, a[2]);
        max = Math.max(max, add(mul(dz, dz), add(mul(dx, dx), mul(dy, dy))));
        dx = sub(x, b[0]);
        dy = sub(y, b[1]);
        dz = sub(z, b[2]);
        max = Math.max(max, add(add(mul(dx, dx), mul(dy, dy)), mul(dz, dz)));
      }
      patch.bounds = [x, y, z, sqrt(max)];
    }
  }
  return { sides, patches };
}
