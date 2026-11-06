/** Recovered ordinary / flat merlon WallConstructor::from_curve (0x101038b30).
 * Native producer is used only by offline tests. Unsupported source modes reject.
 */
import { f32, add, sub, mul, div, sqrt, lerp, RoofRandom } from "./RecoveredRoofMath";
import { recoveredSinF32 } from "./RecoveredSine";
import { IDENTITY_UNIT_SCALE } from "./MaterialFootprint";
import { encodeBrick96 } from "./UnitPacking.js";
import { wallHeightBoundaries, trimWallRows, wallSpanBoundaries, perturbWallEnds } from "./RecoveredWallRows";
import { normalizedWallHoles, resolveWallHole, wallIntersects, splitWallHorizontally } from "./RecoveredWallHoles";
import type { WallProfile, WallPiece, WallInstance, WallRect } from "./WallTypes";
function coord(q: WallProfile, u: number): [number, number] {
  const knots = q.curve.knots;
  u = f32(u);
  if (u <= 0) return [0, 0];
  if (u >= 1) return [knots.length - 2, 1];
  let i = 0;
  while (i + 1 < knots.length && knots[i + 1] <= u) i++;
  return [i, Math.min(1, Math.max(0, div(sub(u, knots[i]), sub(knots[i + 1], knots[i]))))];
}
/** Original normalized CurveSlice cursor, 0x1010b8ff8. Moving by two half
 * spans is intentionally distinct from querying an absolute midpoint. */
function sampler(q: WallProfile) {
  let i = 0,
    t = 0;
  return {
    advance(delta: number) {
      const knots = q.curve.knots;
      let width = Math.abs(sub(knots[i + 1], knots[i]));
      let remaining = sub(mul(sub(1, t), width), delta);
      while (remaining < 0 && i < knots.length - 2) {
        i++;
        width = Math.abs(sub(knots[i + 1], knots[i]));
        remaining = add(remaining, width);
      }
      t = remaining < 0 ? 1 : sub(1, div(remaining, width));
    },
    read(values: number[]) {
      return lerp(values[i], values[i + 1], t);
    }
  };
}
function point(q: WallProfile, u: number): number[] {
  const [i, t] = coord(q, u);
  return q.curve.pointsXZ[i].map((x, k) => lerp(x, q.curve.pointsXZ[i + 1][k], t));
}
export interface WallMath {
  sinF32(x: number): number;
}
function noise(x: number, sin: (x: number) => number): number {
  const v = mul(sin(mul(x, 12.9898)), 43758.547);
  return sub(v, Math.trunc(v));
}
function wave(u: number, h: number, phase: number, sin: (x: number) => number): number {
  const factor = add(mul(sin(mul(u, 0.2)), 0.5), 0.5);
  return mul(sin(add(phase, mul(u, add(mul(h, factor), 1)))), 0.06);
}
function validate(q: WallProfile) {
  const n = q.curve.pointsXZ.length;
  if (
    n < 2 ||
    q.curve.knots.length !== n ||
    q.top.length !== n ||
    q.bottom.length !== n ||
    q.third.length !== n ||
    !(q.curve.length > 0)
  )
    throw Error("Invalid wall profile arrays");
  if (![0, 2].includes(q.roof.kind) || ![0, 1].includes(q.mode) || q.extendTop)
    throw Error(
      "This producer currently requires ordinary/merlon mode, non-overhang gable or level descriptor and no top extension"
    );
  if (q.mode === 1 && (q.roof.kind !== 2 || q.top.some((h) => h !== q.top[0])))
    throw Error("Merlon mode currently requires a level closed-top descriptor");
  if (typeof q.seed !== "bigint" || q.parameters.length !== 5 || q.curve.pointsXZ.some((p) => p.length !== 2))
    throw Error("This producer requires a uint64 seed and finite top profile");
  if (q.seed < 0n || q.seed > 0xffffffffffffffffn || q.top[0] < 0) throw Error("Invalid wall seed or height");
  if (
    (q.holes.length > 0 && !(q.holeLength > 0)) ||
    !Number.isFinite(q.holeLength) ||
    q.holes.some(
      (h) =>
        h.bounds.some((x) => !Number.isFinite(x)) ||
        h.bounds[2] < h.bounds[0] ||
        h.bounds[3] < h.bounds[1] ||
        !Number.isInteger(h.flags) ||
        h.flags < 0 ||
        h.flags > 0xffffffff
    )
  )
    throw Error("Invalid wall hole");
  const numbers = [
    ...q.curve.pointsXZ.flat(),
    ...q.curve.knots,
    ...q.top,
    ...q.bottom,
    ...q.third,
    ...q.parameters,
    q.curve.length
  ];
  if (numbers.some((x) => !Number.isFinite(x))) throw Error("Finite wall profile values required");
  if (
    q.curve.knots[0] !== 0 ||
    q.curve.knots.at(-1) !== 1 ||
    q.curve.knots.some((x, i) => i > 0 && x <= q.curve.knots[i - 1])
  )
    throw Error("Increasing normalized knots required");
  if (!Number.isInteger(q.slot) || q.slot < 0 || q.slot >= 2 ** 32) throw Error("Wall slot must be uint32");
}
export function generateOrdinaryWall(q: WallProfile, math: WallMath = { sinF32: recoveredSinF32 }) {
  if (q.mode !== 0) throw Error("Ordinary wall producer requires mode 0");
  return generateWallCourses(q, math);
}
/** Mode-1 course kernel. The boundary arrangement adapter owns geometry mapping. */
export function generateMerlonWall(q: WallProfile, math: WallMath = { sinF32: recoveredSinF32 }, minimumY = -Infinity) {
  if (minimumY !== -Infinity && !Number.isFinite(minimumY)) throw Error("Finite course clipping height required");
  if (q.mode !== 1) throw Error("Merlon wall producer requires mode 1");
  return generateWallCourses(q, math, minimumY);
}
function generateWallCourses(
  q: WallProfile,
  math: WallMath,
  minimumY = -Infinity
): { instances: WallInstance[]; boundaries: number[]; rows: ReturnType<typeof trimWallRows> } {
  const sin = (x: number) => math.sinF32(f32(x));
  validate(q);
  const scale = q.unitScale ?? IDENTITY_UNIT_SCALE;
  const H = Math.max(...q.top),
    L = q.curve.length;
  // The host's flat deck may lie at/below the terrain after a height edit.
  // That is an empty wall span, not an interval to split into brick courses.
  if (H === 0 || H <= f32(q.parameters[1])) return { instances: [], boundaries: [], rows: [] };
  const boundaries = wallHeightBoundaries(
      q.roof.kind === 2 ? [q.parameters[1], H] : [q.parameters[1], q.roof.height, H],
      H,
      q.seed,
      scale.height
    ),
    T = boundaries.length;
  const rows = trimWallRows(boundaries, H, q.curve, q.top, q.roof.kind !== 2, scale.width),
    instances: WallInstance[] = [];
  const offsets: number[] = new Array(rows.length);
  const offsetRng = new RoofRandom(BigInt.asUintN(64, q.seed * 97586n + BigInt(T) * 2234n));
  for (let i = 0; i < offsets.length; i++) {
    const r = offsetRng.next();
    offsets[i] = mul(sub(add(r, r), 1), q.parameters[0]);
  }
  const holes = q.holes.length ? normalizedWallHoles(q.holes, q.holeLength, H, q.holesClosed) : [];
  const nominalU = div(mul(0.46, scale.width), L),
    nominalV = div(mul(0.46, scale.height), H);
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i],
      merlon = q.mode === 1 && i === rows.length - 1,
      span = mul(L, sub(row.u1, row.u0));
    // Preserve original row count/index and RNG phase while omitting rows that
    // cannot intersect the requested band, including their maximum deformation.
    if (span === 0 || mul(H, row.y1) + 0.106 * scale.height < minimumY) continue;
    const cuts = wallSpanBoundaries(
      q.seed,
      T,
      i,
      span,
      merlon,
      q.roof.kind === 2
        ? [0, 1]
        : [
            0,
            ...q.roof.ranges
              .filter((t) => t !== 0 && t !== 1 && t >= row.u0 && t < row.u1)
              .map((t) => div(sub(t, row.u0), sub(row.u1, row.u0))),
            1
          ],
      scale.width
    ).map((t) => lerp(row.u0, row.u1, t));
    const decision = new RoofRandom(BigInt.asUintN(64, q.seed * 2334n + BigInt(T) * 223n + BigInt(i) * 37373n));
    const secondary = new RoofRandom(BigInt.asUintN(64, q.seed * 5555n + BigInt(T * T) + 678n + BigInt(i)));
    const hashBottom = noise(add(mul(mul(H, row.y0), 10), f32(Number(q.seed))), sin),
      hashTop = noise(add(mul(mul(H, row.y1), 10), f32(Number(q.seed))), sin);
    const phaseBottom = mul(noise(add(hashBottom, hashBottom), sin), 1000),
      phaseTop = mul(noise(add(hashTop, hashTop), sin), 1000);
    const cursor = sampler(q);
    cursor.advance(row.u0);
    let previousBottom = cursor.read(q.bottom),
      previousThird = cursor.read(q.third);
    let cachedRight: number | undefined,
      cachedTop = 0;
    for (let j = 0; j + 1 < cuts.length; j++) {
      const left = cuts[j],
        right = cuts[j + 1],
        r = decision.next(),
        r2 = secondary.next();
      cursor.advance(mul(sub(right, left), 0.5));
      const middleBottom = cursor.read(q.bottom),
        middleThird = cursor.read(q.third);
      cursor.advance(mul(sub(right, left), 0.5));
      const rightBottom = cursor.read(q.bottom),
        rightThird = cursor.read(q.third);
      const bottom = [previousBottom, middleBottom, rightBottom],
        third = [previousThird, middleThird, rightThird];
      previousBottom = rightBottom;
      previousThird = rightThird;
      // Native mode 1 consumes cursor and RNG state for empty slots too.
      if (merlon && j % 2 === 0) continue;
      const rowTop = mul(H, row.y1);
      if (rowTop < Math.min(bottom[0], bottom[2])) continue;
      if (add(add(third[0], third[1]), third[2]) <= 0) third.fill(-100);
      const lower = bottom.map((x, k) => add(x, third[k]));
      if (lower.every((x) => rowTop < x)) continue;
      const above = rows
        .slice(row.aboveStart, row.aboveEnd)
        .some(
          (a) =>
            (left >= sub(a.u0, nominalU) && left <= add(a.u1, nominalU)) ||
            (right >= sub(a.u0, nominalU) && right <= add(a.u1, nominalU))
        );
      const deformation: [number, number, number, number] = [
        row.y0 >= f32(0.01) ? mul(wave(mul(L, left), hashBottom, phaseBottom, sin), scale.height) : 0,
        row.y0 >= f32(0.01) ? mul(wave(mul(L, right), hashBottom, phaseBottom, sin), scale.height) : 0,
        above || merlon ? mul(wave(mul(L, left), hashTop, phaseTop, sin), scale.height) : 0,
        above || merlon ? mul(wave(mul(L, right), hashTop, phaseTop, sin), scale.height) : 0
      ];
      if (cachedRight === left) deformation[2] = cachedTop;
      cachedRight = right;
      cachedTop = deformation[3];
      // Original 0x10103a1dc: only the alternating final course raises and
      // attenuates its top corners; lower courses retain ordinary wall noise.
      if (merlon) {
        deformation[2] = add(mul(deformation[2], 0.1), mul(0.1, scale.height));
        deformation[3] = add(mul(deformation[3], 0.1), mul(0.1, scale.height));
      }
      const bounds: WallRect = [left, row.y0, right, row.y1];
      if (q.parameters[0] > 0)
        perturbWallEnds(bounds, j, cuts, cuts.length - 1, offsets[i], div(mul(0.13800001, scale.width), L));
      const id = Number(BigInt.asUintN(32, q.seed + BigInt(T) * 2340n + 10n + BigInt(i) * 84n + BigInt(j) * 369n));
      const base: WallPiece = { bounds, deformation, id, splitX: false, splitY: false };
      let pieces = [base],
        hit = false;
      for (const h of holes) {
        const expanded: WallRect = [
          sub(h[0], mul(nominalU, 0.5)),
          sub(h[1], mul(nominalV, 0.5)),
          add(h[2], mul(nominalU, 0.5)),
          add(h[3], mul(nominalV, 0.5))
        ];
        if (wallIntersects(expanded, bounds)) for (const p of pieces) p.id %= 10;
        if (wallIntersects(h, bounds)) {
          resolveWallHole(h, pieces);
          hit = true;
        }
      }
      if (!hit) {
        const dh = mul(H, sub(row.y1, row.y0)),
          effective = add(dh, sub(Math.max(deformation[2], deformation[3]), Math.min(deformation[0], deformation[1]))),
          t = sub(1, div(effective, dh));
        if (effective > mul(0.46, scale.height) && r < (merlon ? 0 : add(mul(t, 0.8), mul(sub(1, t), 0.4))))
          pieces = splitWallHorizontally({ ...base, id }, div(r, 0.4));
      }
      const a = point(q, left),
        b = point(q, right),
        dx = sub(b[0], a[0]),
        dz = sub(b[1], a[1]),
        inverse = div(1, sqrt(add(mul(dx, dx), mul(dz, dz)))),
        tx = mul(dx, inverse),
        tz = mul(dz, inverse);
      const thickness = mul(
        scale.depth,
        Math.max(f32(0.05), add(q.scaleThickness ? mul(q.parameters[3], 0.56) : f32(0.56), mul(sub(r2, 0.5), 0.07)))
      );
      for (let k = 0; k < pieces.length; k++) {
        const p = pieces[k],
          w = sub(p.bounds[2], p.bounds[0]),
          h = sub(p.bounds[3], p.bounds[1]);
        if (!(w > 0 && h > 0) || mul(L, w) < mul(0.03, scale.width)) continue;
        const cx = mul(add(p.bounds[0], p.bounds[2]), 0.5),
          cy = mul(add(p.bounds[1], p.bounds[3]), 0.5),
          t = mul(div(1, sub(right, left)), sub(cx, left));
        const width = add(q.widthExtension ? mul(q.parameters[2], scale.width) : 0, mul(L, w)),
          height = mul(H, h),
          center = [lerp(a[0], b[0], t), mul(H, cy), lerp(a[1], b[1], t)];
        const bytes = new Uint8Array(96),
          v = new DataView(bytes.buffer);
        const values = [
          mul(tx, width),
          mul(0, width),
          mul(tz, width),
          mul(0, height),
          mul(1, height),
          mul(0, height),
          mul(-tz, thickness),
          mul(0, thickness),
          mul(tx, thickness),
          ...center,
          ...p.deformation,
          ...lower
        ];
        values.forEach((x, n) => v.setFloat32(n * 4, x, true));
        v.setUint32(76, p.id, true);
        v.setUint32(80, q.slot, true);
        v.setFloat32(84, mul(L, sub(cx, mul(w, 0.5))), true);
        v.setFloat32(88, mul(L, add(cx, mul(w, 0.5))), true);
        v.setUint32(92, q.roof.kind === 2 ? (Math.abs(sub(center[1], H)) < f32(0.95) ? 20 : 4) : 4, true);
        instances.push({
          id: `${q.id}/ordinary/${instances.length}`,
          ...(q.variationKey !== undefined ? { seed_id: `${q.variationKey}/ordinary/${instances.length}` } : {}),
          sourceId: p.id,
          row: i,
          column: j,
          domain96: bytes,
          packed64: encodeBrick96(bytes)
        });
      }
    }
  }
  return { instances, boundaries, rows };
}
