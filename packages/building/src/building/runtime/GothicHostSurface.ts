/** Original roof trigger mesh used by semantic dormer UV placement.
 * CPU equations recovered from 0x10055f670..0x100561168; renderer mesh is separate.
 * Browser transcendentals have the roof migration's declared numerical tolerance.
 */
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
  sincos,
  normalizedProfile,
  expandedDimensions,
  worldProfile,
  roofHeight,
  rotation,
  flare
} from "./RecoveredRoofMath";
import type { RoofSurface, RoofFootprint, CircularFootprint, RectangularFootprint } from "./RecoveredRoofMath";
export interface GothicSupportMesh {
  triangles: number[][][];
  normals: number[][][];
  uvs: number[][][];
}
export function gothicRoofNoise(x: number, z: number): number {
  let ix = Math.floor(x),
    iz = Math.floor(z);
  x = sub(x, ix);
  z = sub(z, iz);
  ix = Math.min(0x7fffffff, Math.max(-0x80000000, ix));
  iz = Math.min(0x7fffffff, Math.max(-0x80000000, iz));
  const sx = mul(mul(x, x), sub(3, add(x, x))),
    sz = mul(mul(z, z), sub(3, add(z, z)));
  const bit = new DataView(new ArrayBuffer(4));
  const value = (i: number, j: number) => {
    let h = Math.imul(j, 1025) >>> 0;
    h = Math.imul(h ^ (h >>> 6), 9) >>> 0;
    h = Math.imul(h ^ (h >>> 11), 32769) >>> 0;
    h = (Math.imul((h + Math.imul(i, 1664525)) >>> 0, 1664525) + 0x0ae135d3) >>> 0;
    h ^= h >>> 11;
    h ^= (h << 7) & 0x9d2c5680;
    h ^= (h << 15) & 0xefc60000;
    h = (h & 0x7fffff) ^ (h >>> 18);
    bit.setUint32(0, (h | 0x3f800000) >>> 0, true);
    return sub(bit.getFloat32(0, true), 1);
  };
  const a = value(ix, iz),
    b = value(ix + 1, iz),
    c = value(ix, iz + 1),
    d = value(ix + 1, iz + 1);
  const p = add(a, mul(sub(b, a), sx)),
    q = add(c, mul(sub(d, c), sx));
  return add(p, mul(sz, sub(q, p)));
}
function normal(a: number[], b: number[], c: number[]): number[] {
  const n = cross(
    a.map((x, i) => sub(b[i], x)),
    b.map((x, i) => sub(c[i], x))
  );
  const r = div(1, sqrt(dot(n, n)));
  return n.map((x) => mul(x, r));
}
function phase(x: number): number {
  let p = f32(f32(x) % f32(Math.PI * 2));
  if (p < 0) p = add(p, f32(Math.PI * 2));
  return p;
}
function circle(f: CircularFootprint, r: number, u: number, center = f.center): number[] {
  const [s, c] = sincos(add(mul(sub(1, u), f32(Math.PI * 2)), phase(f.phase)));
  return [add(center[0], mul(r, c)), add(center[1], mul(r, s))];
}
export function gothicHostSurface(s: RoofSurface, f: RoofFootprint): GothicSupportMesh {
  return sampleSurface(s, f, true);
}
/** Material support sampled from the original tile-placement dimensions.
 * The original interaction mesh deliberately expands circles by .13 and
 * rectangles by .4; those picking margins must not become visible roof faces.
 * This sampled surface serves generic arrangements and our coarse LOD skin;
 * it is not a recovered Tiny Glade LOD. */
export function roofMaterialSurface(s: RoofSurface, f: RoofFootprint): GothicSupportMesh {
  return sampleSurface(s, f, false);
}
function sampleSurface(s: RoofSurface, f: RoofFootprint, interaction: boolean): GothicSupportMesh {
  const m: GothicSupportMesh = { triangles: [], normals: [], uvs: [] };
  if ("radius" in f) circular(s, f, m, interaction);
  else rectangular(s, f, m, interaction);
  m.triangles = m.triangles.map((tri) =>
    tri.map((p) => {
      const t = Math.min(1, Math.max(0, sub(p[1], s.base_height))),
        fac = mul(mul(t, t), sub(3, add(t, t)));
      return [p[0], add(p[1], mul(fac, mul(gothicRoofNoise(mul(p[0], 0.5), mul(p[2], 0.5)), 0.3))), p[2]];
    })
  );
  return m;
}
function circular(s: RoofSurface, f: CircularFootprint, m: GothicSupportMesh, interaction: boolean) {
  let [bottom, top] = expandedDimensions(s, f);
  const flat = s.height_parameter <= f32(0.1);
  if (!flat && interaction) {
    bottom = add(bottom, 0.13);
    top = add(top, 0.13);
  }
  const curve = worldProfile(s, f, bottom, top),
    n = flat ? 4 : 9;
  const tip = s.tip_offset.map((t) => mul(mul(t, mul(f.radius, 2)), 0.5));
  for (let row = 0; row < n; row++) {
    const band = (v: number) => {
      const [r, h] = curve.sample(v),
        t = curve.tangent(v);
      return { r, h: flat ? f32(-0.74) : h, c: f.center.map((x, i) => add(x, mul(tip[i], v))), t: [t[1], -t[0], -0] };
    };
    const v0 = div(row, n),
      v1 = div(row + 1, n),
      a = band(v0),
      b = band(v1);
    for (let col = 0; col < 15; col++) {
      const u0 = div(col, 15),
        u1 = div(col + 1, 15);
      const point = (v: typeof a, u: number) => {
        const p = circle(f, v.r, u, [0, 0]);
        return [add(v.c[0], p[0]), add(v.h, 0), add(v.c[1], p[1])];
      };
      const p00 = point(a, u0),
        p10 = point(a, u1),
        p01 = point(b, u0),
        p11 = point(b, u1);
      const norm = (v: typeof a, u: number) => rotation(v.t, [0, 1, 0], sub(mul(u, f32(Math.PI * 2)), phase(f.phase)));
      m.triangles.push([p00, p10, p01], [p10, p11, p01]);
      m.normals.push([norm(a, u0), norm(a, u1), norm(b, u0)], [norm(a, u1), norm(b, u1), norm(b, u0)]);
      m.uvs.push(
        [
          [u0, v0],
          [u1, v0],
          [u0, v1]
        ],
        [
          [u1, v0],
          [u1, v1],
          [u0, v1]
        ]
      );
    }
  }
  const h = flat ? f32(-0.74) : roofHeight(s, f);
  for (let col = 0; col < 15; col++) {
    const a = div(col, 15),
      b = div(col + 1, 15),
      p = circle(f, top, a),
      q = circle(f, top, b);
    m.triangles.push([
      [p[0], h, p[1]],
      [q[0], h, q[1]],
      [f.center[0], h, f.center[1]]
    ]);
    m.normals.push([
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0]
    ]);
    m.uvs.push([
      circle(f, f32(0.05), a, [f32(0.05), f32(2.05)]),
      circle(f, f32(0.05), b, [f32(0.05), f32(2.05)]),
      [f32(0.05), f32(2.05)]
    ]);
  }
}
function rectangular(s: RoofSurface, f: RectangularFootprint, m: GothicSupportMesh, interaction: boolean) {
  let [bottom, top] = expandedDimensions(s, f);
  const flat = s.height_parameter <= f32(0.1),
    gable = !flat && s.ridge_parameter === 1;
  if (!flat && interaction) {
    bottom = bottom.map((x) => add(x, 0.4));
    top = top.map((x) => add(x, 0.4));
  }
  if (gable && !interaction && s.wall_outset === undefined) {
    // Same dimensions as generateRectangularRoof, before unit thickness/overlap.
    bottom[s.axis] = sub(bottom[s.axis], add(0.81, flare(s)));
    top[s.axis] = bottom[s.axis];
  }
  if (gable && interaction && s.wall_outset === undefined) {
    const e = s.eave_parameter,
      q = s.profile,
      fl = mul(add(mul(e, 1.5), mul(sub(1, e), 0)), add(sqrt(q), mul(sub(1, sqrt(q)), 0.5)));
    bottom[s.axis] = sub(bottom[s.axis], add(fl, 0.56));
    top[s.axis] = add(top[s.axis], f32(-0.56));
  }
  const corners = (size: number[]) => {
    const w = mul(size[0], 0.5),
      d = mul(size[1], 0.5);
    return [
      [-w, -d],
      [-w, d],
      [w, d],
      [w, -d]
    ];
  };
  const lower = corners(bottom),
    upper = corners(top),
    [c, sn] = f.orientation,
    [cx, cz] = f.center;
  const world = (p: number[], h: number) => [
    add(cx, add(mul(c, p[0]), mul(-sn, p[1]))),
    h,
    add(cz, add(mul(sn, p[0]), mul(c, p[1])))
  ];
  const profile = normalizedProfile(s.profile),
    height = roofHeight(s, f),
    n = flat ? 4 : 9;
  const emit = (a: number[], b: number[], c1: number[], d: number[], uv: number[][][]) => {
    const no = normal(a, b, c1);
    m.triangles.push([a, b, c1], [b, d, c1]);
    m.normals.push([no, no, no], [no, no, no]);
    m.uvs.push(...uv);
  };
  for (let side = 0; side < 4; side++) {
    if (gable && (side === s.axis || side === s.axis + 2)) continue;
    for (let row = 0; row < n; row++) {
      const v0 = div(row, n),
        v1 = div(row + 1, n),
        [x0, y0] = profile.sample(v0),
        [x1, y1] = profile.sample(v1),
        h0 = flat ? f32(-0.74) : mul(y0, height),
        h1 = flat ? f32(-0.74) : mul(y1, height);
      const endpoint = (corner: number, x: number) => lower[corner % 4].map((a, i) => lerp(a, upper[corner % 4][i], x));
      const a = endpoint(side, x0),
        b = endpoint(side + 1, x0),
        c1 = endpoint(side, x1),
        d = endpoint(side + 1, x1);
      for (let col = 0; col < 4; col++) {
        const t0 = div(col, 4),
          t1 = mul(col + 1, 0.25);
        const along = (p: number[], q: number[], t: number, h: number) =>
          world(
            p.map((x, i) => lerp(x, q[i], t)),
            h
          );
        const u0 = lerp(div(side, 4), mul(side + 1, 0.25), t0),
          u1 = lerp(div(side, 4), mul(side + 1, 0.25), t1);
        emit(along(a, b, t0, h0), along(a, b, t1, h0), along(c1, d, t0, h1), along(c1, d, t1, h1), [
          [
            [u0, v0],
            [u1, v0],
            [u0, v1]
          ],
          [
            [u1, v0],
            [u1, v1],
            [u0, v1]
          ]
        ]);
      }
    }
    const cw = upper.map((p) => world(p, flat ? f32(-0.74) : height));
    const order = s.axis === 1 ? [3, 2, 0, 1] : [0, 3, 1, 2];
    const [a, b, c1, d] = order.map((i) => cw[i]);
    for (let col = 0; col < 4; col++) {
      const t0 = mul(add(col, -0), 0.25),
        t1 = mul(col + 1, 0.25);
      const ip = (p: number[], q: number[], t: number) => p.map((x, i) => lerp(x, q[i], t));
      m.triangles.push([ip(a, b, t0), ip(a, b, t1), ip(c1, d, t0)], [ip(a, b, t1), ip(c1, d, t1), ip(c1, d, t0)]);
      m.normals.push(
        [
          [0, 1, 0],
          [0, 1, 0],
          [0, 1, 0]
        ],
        [
          [0, 1, 0],
          [0, 1, 0],
          [0, 1, 0]
        ]
      );
      m.uvs.push(
        [
          [t0, 2],
          [t1, 2],
          [t0, f32(2.1)]
        ],
        [
          [t1, 2],
          [t1, f32(2.1)],
          [t0, f32(2.1)]
        ]
      );
    }
  }
}
