/** Native roof sections (0x1015955fc / 0x101595444) and ShapeParameters
 * perimeter sampling (0x102004eb0 / 0x10200647c). The semantic footprint is
 * authoritative; binary padding and captured scene queries are not runtime data.
 */
import {
  f32 as f,
  add,
  sub,
  mul,
  div,
  sqrt,
  lerp,
  roofHeight,
  expandedDimensions,
  RoofCurve,
  quaternionAxes,
  type RoofSurface,
  type RoofFootprint
} from "./RecoveredRoofMath";
import { gothicRoofNoise } from "./GothicHostSurface";
import type { CottageRoofSampler, CottageRoofSection } from "./RecoveredCottageDormerRoof";

const tau = f(2 * Math.PI);
const clamp = (x: number) => Math.min(1, Math.max(0, x));
function wrap(x: number) {
  x = f(x % 1);
  return x < 0 ? add(x, 1) : x;
}
function phase(x: number) {
  x = f(x % tau);
  return x < 0 ? add(x, tau) : x;
}
const dot = (a: number[], b: number[]) => add(mul(a[0], b[0]), mul(a[1], b[1]));
const delta = (a: number[], b: number[]) => a.map((v, i) => sub(v, b[i]));

export class RecoveredCottageRoofSection implements CottageRoofSection {
  constructor(readonly shape: RoofFootprint) {}

  perimeter(): number {
    const s = this.shape;
    return "radius" in s ? mul(s.radius, tau) : mul(add(s.width, s.depth), 2);
  }

  expand(amount: number): RecoveredCottageRoofSection {
    const s = this.shape;
    return new RecoveredCottageRoofSection(
      "radius" in s
        ? { ...s, radius: add(s.radius, amount) }
        : { ...s, width: add(s.width, add(amount, amount)), depth: add(s.depth, add(amount, amount)) }
    );
  }

  /** Native attachment transforms sample this polygonal curve, while roof
   * strips sample the analytic section. Keep these consumers distinct. */
  asCurve3(height: number): RoofCurve {
    const count = "radius" in this.shape ? Math.max(3, Math.ceil(div(this.perimeter(), 0.2))) : 5;
    const points = Array.from({ length: count }, (_, i) => {
      const p = "radius" in this.shape ? this.point(div(i, count - 1)) : this.corner(i);
      return [p[0], f(height), p[1]];
    });
    return new RoofCurve(points);
  }

  /** Original ShapeParameters::as_curve2 (0x10166f268), used for the board
   * chart length. Circle point count is ceil(perimeter/.2), including the
   * closing point; its chord length differs from the analytic circumference. */
  asCurve2(): RoofCurve {
    const count = "radius" in this.shape ? Math.max(3, Math.ceil(div(this.perimeter(), 0.2))) : 5;
    return new RoofCurve(
      Array.from({ length: count }, (_, i) => ("radius" in this.shape ? this.point(div(i, count - 1)) : this.corner(i)))
    );
  }

  /** Native rectangle corner arc parameters (including closing corner 1). */
  cornerParameters(): number[] {
    const s = this.shape;
    if ("radius" in s) throw Error("Rectangle perimeter required");
    const sum = add(s.width, s.depth),
      p = add(sum, sum);
    return [0, div(s.depth, p), div(sum, p), div(add(add(s.depth, s.depth), s.width), p), 1];
  }

  /** Original Rectangle2d::get_point; closing corner 4 wraps to corner 0. */
  corner(i: number): [number, number] {
    const s = this.shape;
    if ("radius" in s) throw Error("Rectangle perimeter required");
    const [c, sn] = s.orientation,
      [x, z] = s.center;
    const signs = [
      [-0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
      [0.5, -0.5]
    ][i % 4];
    const lx = mul(s.width, signs[0]),
      lz = mul(s.depth, signs[1]);
    return [add(x, add(mul(c, lx), mul(-sn, lz))), add(z, add(mul(sn, lx), mul(c, lz)))];
  }

  /** Original Rectangle2d::get_edge_normal, 0x1020058e8. */
  edgeNormal(side: number): [number, number] {
    if ("radius" in this.shape || !Number.isInteger(side) || side < 0 || side > 3)
      throw Error("Rectangle edge 0..3 required");
    // Preserve the signed-zero coefficients in the native constant table.
    const [c, s] = this.shape.orientation,
      [x, z] = [
        [-1, -0],
        [0, 1],
        [1, 0],
        [-0, -1]
      ][side];
    return [add(mul(x, c), mul(z, -s)), add(mul(x, s), mul(z, c))];
  }

  point(u: number): [number, number] {
    u = f(u);
    const s = this.shape;
    if ("radius" in s) {
      const a = add(mul(sub(1, u), tau), phase(s.phase));
      return [add(s.center[0], mul(s.radius, f(Math.cos(a)))), add(s.center[1], mul(s.radius, f(Math.sin(a))))];
    }
    const k = this.cornerParameters();
    for (let i = 0; i < 5; i++) if (u === k[i]) return this.corner(i);
    const i = u >= 0 && u < k[1] ? 0 : u >= k[1] && u < k[2] ? 1 : u >= k[2] && u < k[3] ? 2 : 3;
    const t = div(sub(u, k[i]), sub(k[i + 1], k[i])),
      a = this.corner(i),
      b = this.corner(i + 1);
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  }

  /** Native rectangle perimeter point, preserving edge selection and lerp order. */
  closestRectanglePoint(x: number, z: number): [number, number] {
    const { edge, t } = this.closestRectangleEdge(x, z),
      a = this.corner(edge),
      b = this.corner(edge + 1);
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  }

  closestU(x: number, z: number): number {
    const s = this.shape;
    if ("radius" in s) {
      const dx = sub(x, s.center[0]),
        dz = sub(z, s.center[1]);
      const inv = div(1, sqrt(add(mul(dx, dx), mul(dz, dz))));
      if (!Number.isFinite(inv) || inv === 0) return 0;
      const a = f(Math.atan2(mul(dz, inv), mul(dx, inv)));
      return wrap(sub(1, div(sub(a, phase(s.phase)), tau)));
    }
    const closest = this.closestRectangleEdge(x, z),
      k = this.cornerParameters();
    return lerp(k[closest.edge], k[closest.edge + 1], closest.t);
  }

  /** Original finite-edge selection; a corner tie retains the earlier edge.
   * Shared by attachment coordinates and half-dormer gable exclusion. */
  closestRectangleEdge(x: number, z: number): { edge: number; t: number } {
    if ("radius" in this.shape) throw Error("Rectangle edge required");
    const corners = [0, 1, 2, 3, 4].map((i) => this.corner(i)),
      point = [f(x), f(z)];
    const project = (a: number[], b: number[]) => {
      const ab = delta(b, a);
      return clamp(div(dot(delta(point, a), ab), Math.max(dot(ab, ab), f(1e-20))));
    };
    // Preserve native strict comparison/tie order, including its initial bound.
    let best = 1000,
      edge = 0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[i + 1],
        t = project(a, b);
      const v = a.map((q, j) => lerp(q, b[j], t)),
        d = delta(point, v),
        distance = sqrt(dot(d, d));
      if (distance < best) {
        best = distance;
        edge = i;
      }
    }
    return { edge, t: project(corners[edge], corners[edge + 1]) };
  }
}

/** Native 0x101ffd3e8: project onto XZ, normalize with +X fallback, then
 * normalize the perpendicular axis separately before constructing quaternion. */
export function cottageXzProjectiveRotation(v: number[]): number[] {
  const inv = div(1, sqrt(add(mul(v[0], v[0]), mul(v[2], v[2]))));
  const valid = Number.isFinite(inv) && inv !== 0;
  const x = valid ? mul(v[0], inv) : 1,
    z = valid ? mul(v[2], inv) : 0;
  // Preserve the SIMD zero products, including their signed-zero lanes.
  const cross = [add(z, -0), add(mul(x, 0), mul(z, -0)), add(0, -x)];
  const r = div(1, sqrt(add(mul(cross[2], cross[2]), add(mul(cross[0], cross[0]), mul(cross[1], cross[1])))));
  return quaternionAxes(
    cross.map((q) => mul(q, r)),
    [0, 1, 0],
    [x, 0, z]
  );
}

/** Actual section service, independent of renderer tessellation and LOD. */
export class RecoveredCottageRoofSampler implements CottageRoofSampler {
  readonly height: number;
  constructor(
    readonly surface: RoofSurface,
    readonly footprint: RoofFootprint
  ) {
    this.height = roofHeight(surface, footprint);
    if (!(this.height > 0) || !Number.isFinite(this.height)) throw Error("Cottage dormer requires a pitched roof");
  }

  sectionAt(p: number[]): RecoveredCottageRoofSection {
    const s = this.surface,
      foot = this.footprint;
    const n = gothicRoofNoise(mul(p[0], 0.5), mul(p[2], 0.5)),
      y = add(p[1], mul(n, -0.3));
    const v = clamp(div(sub(y, s.base_height), sub(add(s.base_height, this.height), s.base_height)));
    const q = f(s.profile),
      t = f(Math.pow(v, div(1, add(mul(q, 1.5), mul(sub(1, q), 0.5)))));
    if ("radius" in foot) {
      const [bottom, top] = expandedDimensions(s, foot);
      return new RecoveredCottageRoofSection({ ...foot, radius: lerp(bottom, top, t) });
    }
    const [bottom, top] = expandedDimensions(s, foot);
    return new RecoveredCottageRoofSection({
      ...foot,
      width: lerp(bottom[0], top[0], t),
      depth: lerp(bottom[1], top[1], t)
    });
  }
}
