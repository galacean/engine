/** 0x10058c0d4: recovered gable/hip constructor, preserving append/RNG order. */
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
  RoofRandom,
  randomSplits,
  normalizedProfile,
  expandedDimensions,
  roofHeight,
  worldProfile,
  flare,
  quaternionAxes,
  rotation
} from "./RecoveredRoofMath";
import type { RoofSurface, RectangularFootprint, UnitMetrics } from "./RecoveredRoofMath";
import { packRoof, generateRoofClosure, validateSurface, validateMetrics } from "./RecoveredRoofPlacement";
import type { RoofEmission, RowContext } from "./RecoveredRoofPlacement";

const unit = (v: number[]) => {
  const inv = div(1, sqrt(dot(v, v)));
  return v.map((x) => mul(x, inv));
};
const vs = (a: number[], b: number[]) => a.map((x, i) => sub(x, b[i]));
const va = (a: number[], b: number[]) => a.map((x, i) => add(x, b[i]));

export function generateRectangularRoof(
  s: RoofSurface,
  f: RectangularFootprint,
  seed = 0n,
  metrics: UnitMetrics = { width: 0.5, height: 0.4375, depth: 0.1 },
  slot = 0
) {
  validateSurface(s);
  metrics = validateMetrics(metrics, slot);
  if (
    s.type !== "native_rectangular_roof_profile" ||
    !f ||
    Object.keys(f).sort().join() !== "center,depth,orientation,width"
  )
    throw Error("Rectangular descriptors required");
  for (const v of [f.center, f.orientation])
    if (!Array.isArray(v) || v.length !== 2) throw Error("Two-dimensional footprint required");
  if ([...f.center, ...f.orientation, f.width, f.depth].some((x) => typeof x !== "number" || !Number.isFinite(f32(x))))
    throw Error("Finite footprint required");
  if (Math.min(f32(f.width), f32(f.depth)) <= 0 || Math.abs(f.orientation.reduce((v, x) => v + x * x, 0) - 1) > 1e-4)
    throw Error("Positive size and normalized orientation required");
  // The original constructor consumes normalizedProfile continuously; these are
  // normalized author parameters, not two hard-coded roof presets. Offline native
  // matrix tests cover the expanded profile/ridge/eave domain.
  if (
    [s.profile, s.ridge_parameter, s.eave_parameter].some((v) => v < 0 || v > 1) ||
    !(f32(s.height_parameter) > f32(0.1) && f32(s.height_parameter) <= 1)
  )
    throw Error("Pitched roof requires normalized profile/ridge/eave and height in (.1,1]");
  if (s.tip_offset.some((x) => x !== 0) || s.axis !== 0 || s.edge_mode !== 0)
    throw Error("Only recovered zero tip/axis/edge mode supported");
  const normalized = normalizedProfile(s.profile),
    H = roofHeight(s, f),
    [bottom, top] = expandedDimensions(s, f),
    ridgeDims = [...top],
    gable = f32(s.ridge_parameter) === 1;
  if (gable && s.wall_outset === undefined) {
    bottom[0] = add(bottom[0], -add(0.81, flare(s)));
    top[0] = bottom[0];
  }
  const corners = (d: number[]) => {
    const x = mul(d[0], 0.5),
      z = mul(d[1], 0.5);
    return [
      [-x, -z],
      [-x, z],
      [x, z],
      [x, -z]
    ];
  };
  const bp = corners(bottom),
    tp = corners(top),
    [ox, oz] = f.orientation.map(f32),
    [cx, cz] = f.center.map(f32);
  const world = (p: number[]) => [
    add(cx, add(mul(ox, p[0]), mul(-oz, p[1]))),
    add(cz, add(mul(oz, p[0]), mul(ox, p[1])))
  ];
  const rng = new RoofRandom(seed),
    emits: RoofEmission[] = [];
  let ordinal = 0;
  for (let corner = 0; corner < 4; corner++) {
    const wa = world(bp[corner]),
      wb = world(tp[corner]),
      delta = vs(wb, wa),
      horizontal = sqrt(dot(delta, delta)),
      curve = worldProfile(s, f, 0, horizontal);
    const count = Math.max(2, Math.floor(add(div(curve.length, 0.625), 0.5))),
      splits = randomSplits(count, div(0.125, curve.length), rng);
    const d3 = [delta[0], 0, delta[1]],
      up = [mul(H, 0), H, mul(H, 0)],
      normal = unit(cross(up, d3));
    const along = (u: number) => {
      const [x, y] = normalized.sample(u);
      return [wa[0], 0, wa[1]].map((v, i) => add(v, add(mul(d3[i], x), add(mul(normal[i], 0), mul(up[i], y)))));
    };
    for (let i = 0; i < splits.length - 1; i++) {
      const a = splits[i],
        b = splits[i + 1],
        pa = along(a),
        pb = along(b),
        tangent = unit(vs(pb, pa)),
        width = cross(tangent, normal),
        other = cross(tangent, width),
        eps = f32(8.742278e-8);
      const ax = width.map((w, i) => add(mul(w, 0), sub(mul(tangent[i], -eps), other[i])));
      const ay = width.map((w, i) => add(mul(w, 0), sub(mul(other[i], eps), tangent[i])));
      const az = width.map((w, i) => add(add(w, mul(tangent[i], 0)), mul(other[i], 0)));
      const quat = quaternionAxes(ax, ay, az),
        d = vs(pa, pb),
        length = add(sqrt(dot(d, d)), 0.05);
      const pos = pa.map((p, i) => sub(add(p, mul(mul(length, tangent[i]), 0.3)), mul(width[i], 0.05)));
      emits.push({
        role: "ridge_or_end_strip",
        callsite: "0x10058c960",
        initial64_hex: packRoof(pos, quat, [0.25, length, 0.18], a, slot, ordinal, 2)
      });
      ordinal++;
    }
  }
  if (Math.max(...top) > f32(0.1)) {
    const a = world([-mul(ridgeDims[0], 0.5), 0]),
      b = world([mul(ridgeDims[0], 0.5), 0]);
    let pa = [a[0], H, a[1]],
      pb = [b[0], H, b[1]],
      direction = unit(vs(pb, pa));
    if (gable && s.wall_outset === undefined) {
      const expansion = direction.map((v) => mul(mul(v, -1), 0.28));
      pa = vs(pa, expansion);
      pb = va(pb, expansion);
    }
    const delta = vs(pb, pa),
      length = sqrt(dot(delta, delta));
    direction = unit(delta);
    const splits = randomSplits(Math.max(2, Math.floor(add(div(length, 0.625), 0.5))), div(0.125, length), rng);
    const hp = f32(s.height_parameter),
      product = mul(hp, s.profile),
      inverse = sub(1, product);
    let t = Math.min(1, Math.max(0, div(sub(inverse, 0.8), f32(0.19999999))));
    t = mul(mul(t, t), sub(3, add(t, t)));
    const width = add(add(mul(t, 0.15), mul(sub(1, t), 0)), 0.4);
    const drop = add(add(mul(hp, 0.08), mul(sub(1, hp), 0.02)), add(mul(product, 0.15), mul(inverse, 0.1)));
    const x = unit(cross(direction, [0, 1, 0])),
      quat = quaternionAxes(x, direction, [0, 1, 0]);
    for (let i = 0; i < splits.length - 1; i++) {
      const a = splits[i],
        b = splits[i + 1],
        span = mul(length, sub(b, a)),
        scale = [width, mul(span, 1.4), f32(0.15)];
      const pos = pa.map((x, j) =>
        sub(add(lerp(x, pb[j], a), mul(direction[j], mul(span, 0.5))), mul(drop, [0, 1, 0][j]))
      );
      emits.push({
        role: i === 0 ? "side_initial" : "side_strip",
        callsite: i === 0 ? "0x10058cf38" : "0x10058d0a4",
        initial64_hex: packRoof(
          pos,
          quat,
          scale,
          add(a, mul(sub(1, a), 0.9)),
          slot,
          ordinal,
          i === 0 || i === splits.length - 2 ? 2 : 1
        )
      });
      ordinal++;
    }
  }
  const rowEvents: RowContext[] = [],
    rowClosures: object[] = [];
  for (let side = 0; side < 4; side++) {
    if (gable && (side === 0 || side === 2)) continue;
    const next = (side + 1) % 4,
      sideIndex = rowClosures.length;
    const mid0 = bp[side].map((x, i) => mul(add(x, bp[next][i]), 0.5)),
      mid1 = tp[side].map((x, i) => mul(add(x, tp[next][i]), 0.5));
    const curve = worldProfile(s, f, sqrt(dot(mid0, mid0)), sqrt(dot(mid1, mid1))),
      n = Math.max(2, Math.ceil(div(curve.length, metrics.height)));
    rowClosures.push({
      row_count_f32: n,
      range_i32: [0, n - 1],
      endpoint_pairs: [bp[side], tp[side], bp[next], tp[next]],
      profile_points: normalized.points,
      profile_knots: normalized.knots
    });
    const planes: number[][] = [];
    for (const [corner, sign] of [
      [side, 1],
      [next, -1]
    ]) {
      const delta = sign === 1 ? vs(tp[corner], bp[corner]) : vs(bp[corner], tp[corner]);
      const dx = add(mul(ox, delta[0]), mul(-oz, delta[1])),
        dz = add(mul(oz, delta[0]), mul(ox, delta[1])),
        v = unit([-dz, dx]);
      const normal = [v[0], 0, v[1]],
        wp = world(bp[corner]);
      planes.push([...normal, sub(-0.075, dot(normal, [wp[0], 0, wp[1]]))]);
    }
    const lines: { left: number[]; right: number[]; height: number; u: number }[] = [];
    for (let ri = 0; ri < n - 1; ri++) {
      const u = div(ri, n - 1),
        [x, y] = normalized.sample(u);
      lines.push({
        left: bp[side].map((a, i) => lerp(a, tp[side][i], x)),
        right: bp[next].map((a, i) => lerp(a, tp[next][i], x)),
        height: add(mul(H, y), mul(sub(1, y), 0)),
        u
      });
    }
    for (let ri = 0; ri < lines.length; ri++) {
      const { left, right, height, u } = lines[ri],
        d = vs(left, right),
        rowWidth = sqrt(dot(d, d));
      const cols = Math.max(3, Math.ceil(div(rowWidth, metrics.width))),
        splits = randomSplits(cols + 1, 0, rng);
      const row: RowContext = { side_index: sideIndex, row_index: ri, row_u: u, split_count: cols + 1 };
      rowEvents.push(row);
      // A host unit footprint can cover the whole slope in one row. Its span
      // ends at the ridge boundary; using that same row as its own neighbor
      // collapses every tile to zero length. Multi-row native spacing is kept.
      const adjacent =
        lines.length === 1
          ? { left: tp[side], right: tp[next], height: H }
          : lines[ri < lines.length - 1 ? ri + 1 : ri - 1];
      const mid = left.map((a, i) => mul(add(a, right[i]), 0.5)),
        other = adjacent.left.map((a, i) => mul(add(a, adjacent.right[i]), 0.5));
      const delta = [sub(mid[0], other[0]), sub(height, adjacent.height), sub(mid[1], other[1])],
        rowLength = mul(sqrt(dot(delta, delta)), f32(1.4285715));
      const tan = curve.tangent(u),
        angle = f32(Math.atan(div(tan[1], tan[0])));
      for (let ci = 0; ci < splits.length - 1; ci++) {
        const a = splits[ci],
          b = splits[ci + 1],
          l = world(left.map((x, i) => lerp(x, right[i], a))),
          r = world(left.map((x, i) => lerp(x, right[i], b)));
        const dv = vs(l, r),
          width = sqrt(dot(dv, dv)),
          inv = div(1, width),
          rd = [mul(dv[0], inv), 0, mul(dv[1], inv)];
        const outward = [-rd[2], 0, rd[0]],
          slope = rotation(outward, rd, angle),
          bitangent = slope.map((v) => -v),
          quat = quaternionAxes(rd, bitangent, cross(rd, bitangent));
        const pos = [mul(add(l[0], r[0]), 0.5), height, mul(add(l[1], r[1]), 0.5)],
          rand = rng.next();
        const length = mul(rowLength, add(mul(rand, 1.2), mul(sub(1, rand), 0.8))),
          scale = [width, length, metrics.depth];
        const clip = planes[a <= 0.5 ? 0 : 1],
          tile = Math.min(1, Math.max(0, add(u, mul(rng.next(), 0.2))));
        emits.push({
          role: "ordinary_slope",
          callsite: "0x10058def8",
          initial64_hex: packRoof(pos, quat, scale, tile, slot, ordinal, ri === 0 ? 2 : 1, false, clip),
          source_full_precision: { quaternion: quat, clip_plane: clip, scale, tile_t: [tile] },
          row_context: { ...row }
        });
        const closure = generateRoofClosure({
          center: pos,
          row_direction: rd,
          slope_direction: slope,
          scale_width: width,
          scale_length: length,
          clip_plane: clip,
          seed: ordinal,
          slot,
          row_index: BigInt(ri)
        });
        if (closure.count) {
          const full = closure.source_full_precision[0];
          full.scale[2] = metrics.depth;
          const bytes = Uint8Array.from(closure.instances64_hex[0].match(/../g)!, (h) => parseInt(h, 16)),
            view = new DataView(bytes.buffer);
          const center = [0, 1, 2].map((i) => view.getFloat32(i * 4, true));
          emits.push({
            role: "slope_end_cap",
            callsite: "0x10058e104",
            initial64_hex: packRoof(center, full.quaternion, full.scale, 0, slot, ordinal, 2, false, full.clip_plane),
            source_full_precision: full,
            row_context: { ...row }
          });
        }
        ordinal++;
      }
    }
  }
  return {
    observed_native_emits: emits,
    row_events: rowEvents,
    row_closures: rowClosures,
    native_entry: "0x10058c0d4"
  };
}
