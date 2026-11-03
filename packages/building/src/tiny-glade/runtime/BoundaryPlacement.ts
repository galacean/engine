import { boundaryCourses } from "./BoundaryCourses";
import { RoofRandom, randomSplits } from "./RecoveredRoofMath";
import type { MaterialUnit } from "./MasonryDocument";
import type { SupportCell } from "./PlacementSupport";

/** Arrangement is independent of buildings, roof kinds, mesh assets and shaders.
 * pitch/jitter are metres along the boundary. Alternating fits an even number
 * of slots, leaves even slots empty and closes without a doubled occupied slot. */
export interface BoundaryArrangement {
  type: "continuous" | "alternating";
  pitch: number;
  jitter: number;
}
/** Whole-band course rule; an explicit upper rule replaces only the top row. */
export interface BoundaryCourseArrangement {
  type: "random_courses";
  upper?: BoundaryArrangement;
}
export interface BoundaryBand {
  id: string;
  minY: number;
  maxY: number;
  publishOccupancy: boolean;
  rule: BoundaryArrangement | BoundaryCourseArrangement;
}
export interface BoundaryPlacementGeometry {
  id: string;
  length: number;
  /** Height datum of the supporting geometry; keeps row phase across clipped bands. */
  courseOriginY?: number;
  /** Normalized hard breaks. Smooth tessellation vertices are not hard breaks. */
  cuts: readonly number[];
  /** Existing metric edit/contact chart; does not change when the rule changes. */
  publishedU(u: number): number;
  holes: readonly { minU: number; maxU: number; minY: number; maxY: number }[];
  /** Surface adapter maps a clipped chart rectangle to a local placement frame. */
  frame(u0: number, u1: number, y0: number, y1: number, id: string, depth: number): SupportCell | undefined;
}
export interface BoundaryPlacementUnit {
  material: MaterialUnit;
  width?: number;
  height: number;
  depth: number;
}
export function validateBoundaryArrangement(rule: BoundaryArrangement): void {
  if (
    (rule.type !== "continuous" && rule.type !== "alternating") ||
    !Number.isFinite(rule.pitch) ||
    rule.pitch <= 0 ||
    !Number.isFinite(rule.jitter) ||
    rule.jitter < 0
  )
    throw Error(
      "Boundary arrangement requires continuous/alternating, positive metre pitch and nonnegative metre jitter"
    );
}
function subtract(r: number[], h: BoundaryPlacementGeometry["holes"][number]) {
  const [x, y, X, Y] = r,
    lo = Math.max(x, h.minU),
    hi = Math.min(X, h.maxU),
    bot = Math.max(y, h.minY),
    top = Math.min(Y, h.maxY);
  if (hi <= lo || top <= bot) return [r];
  return [
    [x, y, lo, Y],
    [hi, y, X, Y],
    [lo, y, hi, bot],
    [lo, top, hi, Y]
  ].filter((q) => q[2] - q[0] > 1e-6 && q[3] - q[1] > 1e-6);
}
/** Geometry + material specification + bound rules -> reusable placements.
 * Rendering, LOD, contact occupancy and local edits consume this one output.
 * Random courses reuse the recovered mode-1 kernel. The geometry domain,
 * mapping and explicit rule overrides remain host policy; this does not claim
 * native scene-wide placement parity. */
export function placeBoundaryUnits(input: {
  geometry: BoundaryPlacementGeometry;
  unit: BoundaryPlacementUnit;
  bands: readonly BoundaryBand[];
  seed: number;
}) {
  const { geometry: g, unit, bands, seed } = input;
  if (
    !g.id ||
    (g.courseOriginY !== undefined && !Number.isFinite(g.courseOriginY)) ||
    !Number.isFinite(g.length) ||
    g.length <= 0 ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    ![unit.width ?? 0.46, unit.height, unit.depth].every((v) => Number.isFinite(v) && v > 0) ||
    g.cuts.length < 2 ||
    g.cuts[0] !== 0 ||
    g.cuts[g.cuts.length - 1] !== 1 ||
    g.cuts.some((v, i) => !Number.isFinite(v) || (i > 0 && v <= g.cuts[i - 1]))
  )
    throw Error("Valid boundary geometry, unit dimensions and stable seed required");
  if (new Set(bands.map((band) => band.id)).size !== bands.length) throw Error("Duplicate boundary band identity");
  for (const band of bands) {
    if (band.rule.type === "random_courses") {
      if (band.rule.upper) validateBoundaryArrangement(band.rule.upper);
    } else validateBoundaryArrangement(band.rule);
    if (!band.id || !Number.isFinite(band.minY) || !Number.isFinite(band.maxY) || band.maxY <= band.minY)
      throw Error("Boundary band requires a stable identity and finite increasing heights");
  }
  const cells: SupportCell[] = [];
  const occupancy: Array<{ u0: number; u1: number; minY: number; maxY: number; occupied: boolean }> = [];
  type Shape = { depth: number; deformation: number[]; flags: number; seed: number };
  const place = (u0: number, u1: number, band: BoundaryBand, key: string, shape?: Shape) => {
    const a = g.publishedU(u0),
      b = g.publishedU(u1);
    const original = [a, band.minY, b, band.maxY];
    let pieces = [original];
    for (const h of g.holes) pieces = pieces.flatMap((r) => subtract(r, h));
    const unchanged = pieces.length === 1 && pieces[0].every((v, i) => v === original[i]);
    for (const [i, r] of pieces.entries()) {
      if (band.publishOccupancy) occupancy.push({ u0: r[0], u1: r[2], minY: r[1], maxY: r[3], occupied: true });
      const remap = (target: number) => {
        if (target === a) return u0;
        if (target === b) return u1;
        let lo = u0,
          hi = u1;
        for (let k = 0; k < 32; k++) {
          const mid = (lo + hi) / 2;
          if (g.publishedU(mid) < target) lo = mid;
          else hi = mid;
        }
        return (lo + hi) / 2;
      };
      const courses = shape ? 1 : Math.max(1, Math.ceil((r[3] - r[1] - 1e-8) / unit.height));
      if (!Number.isSafeInteger(courses) || courses > 0xffffffff - 1)
        throw Error("Boundary courses exceed array index capacity");
      const pieceKey = unchanged ? key : key + "/piece-" + i;
      for (let course = 0; course < courses; course++) {
        const cell = g.frame(
          remap(r[0]),
          remap(r[2]),
          courses === 1 ? r[1] : r[1] + ((r[3] - r[1]) * course) / courses,
          courses === 1 ? r[3] : r[1] + ((r[3] - r[1]) * (course + 1)) / courses,
          courses === 1 ? pieceKey : pieceKey + "/course-" + course,
          shape?.depth ?? unit.depth
        );
        if (cell) {
          cell.boundaryU = [r[0], r[2]];
          if (shape) {
            const at = (x: number, y: number) => {
              const u = (x - a) / (b - a),
                v = (y - band.minY) / (band.maxY - band.minY);
              const [bl, br, tl, tr] = shape.deformation;
              return ((1 - u) * bl + u * br) * (1 - v) + ((1 - u) * tl + u * tr) * v;
            };
            cell.brick_deformation = [at(r[0], r[1]), at(r[2], r[1]), at(r[0], r[3]), at(r[2], r[3])];
            cell.brick_flags = shape.flags;
            cell.brick_seed = shape.seed;
          }
          cells.push(cell);
        }
      }
    }
  };
  const regularBands: BoundaryBand[] = [];
  for (const band of bands) {
    if (band.rule.type !== "random_courses") {
      regularBands.push(band);
      continue;
    }
    const originY = g.courseOriginY ?? band.minY;
    if (originY > band.minY) throw Error("Course origin must not exceed its clipped band");
    const plan = boundaryCourses(g.length, band.maxY - originY, unit, seed, band.minY - originY);
    const topBand = { ...band, id: "merlon", minY: Math.max(band.minY, originY + plan.topMinY) };
    if (band.rule.upper) regularBands.push({ ...topBand, rule: band.rule.upper });
    for (const p of plan.courses) {
      if (p.upper && band.rule.upper) continue;
      const rowBand = {
        ...band,
        minY: Math.max(band.minY, originY + p.minY),
        maxY: originY + p.maxY,
        publishOccupancy: band.publishOccupancy && p.upper
      };
      if (rowBand.maxY <= rowBand.minY) continue;
      // Clipping at hard corners preserves the course phase and native seed.
      for (let side = 1; side < g.cuts.length; side++) {
        const lo = Math.max(p.u0, g.cuts[side - 1]),
          hi = Math.min(p.u1, g.cuts[side]);
        if (hi <= lo) continue;
        const t0 = (lo - p.u0) / (p.u1 - p.u0),
          t1 = (hi - p.u0) / (p.u1 - p.u0);
        const mix = (a: number, b: number, t: number) => a + (b - a) * t;
        const v0 = (rowBand.minY - originY - p.minY) / (p.maxY - p.minY);
        const [rawBL, rawBR, tl, tr] = p.deformation;
        const bl = mix(rawBL, tl, v0),
          br = mix(rawBR, tr, v0);
        place(lo, hi, rowBand, `${g.id}/${p.upper ? "merlon" : "parapet"}-${side}/${p.row}-${p.column}-${p.piece}`, {
          ...p,
          deformation: [mix(bl, br, t0), mix(bl, br, t1), mix(tl, tr, t0), mix(tl, tr, t1)]
        });
      }
    }
    if (band.publishOccupancy && !band.rule.upper) {
      let last = 0;
      for (const p of plan.courses.filter((p) => p.upper).sort((a, b) => a.u0 - b.u0)) {
        if (p.u0 > last)
          occupancy.push({
            u0: g.publishedU(last),
            u1: g.publishedU(p.u0),
            minY: topBand.minY,
            maxY: band.maxY,
            occupied: false
          });
        last = p.u1;
      }
      if (last < 1)
        occupancy.push({
          u0: g.publishedU(last),
          u1: g.publishedU(1),
          minY: topBand.minY,
          maxY: band.maxY,
          occupied: false
        });
    }
  }
  for (let side = 1; side < g.cuts.length; side++) {
    const start = g.cuts[side - 1],
      end = g.cuts[side],
      span = (end - start) * g.length;
    for (const band of regularBands) {
      const { rule } = band;
      if (rule.type === "random_courses") continue;
      const n = Math.ceil(span / rule.pitch);
      const count = rule.type === "alternating" ? Math.max(2, n + (n % 2)) : Math.max(1, n);
      if (!Number.isSafeInteger(count) || count > 0xffffffff - 1)
        throw Error("Boundary subdivision exceeds array index capacity");
      const splits =
        rule.jitter > 0
          ? randomSplits(count + 1, rule.jitter / span, new RoofRandom(BigInt(seed) + BigInt(side)))
          : undefined;
      for (let j = 0; j < count; j++) {
        const u0 = start + (end - start) * (splits ? splits[j] : j / count),
          u1 = start + (end - start) * (splits ? splits[j + 1] : (j + 1) / count);
        if (rule.type === "continuous" || j % 2 === 1) place(u0, u1, band, `${g.id}/${band.id}-${side}/${j}`);
        else if (band.publishOccupancy)
          occupancy.push({
            u0: g.publishedU(u0),
            u1: g.publishedU(u1),
            minY: band.minY,
            maxY: band.maxY,
            occupied: false
          });
      }
    }
  }
  return { cells, occupancy };
}

/** Strict persisted/API boundary; runtime geometry never interprets raw objects. */
export function parseBoundaryArrangement(value: unknown): BoundaryArrangement {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Expected boundary arrangement object");
  const r = value as Record<string, unknown>;
  if (
    Object.keys(r).some((k) => !["type", "pitch", "jitter"].includes(k)) ||
    typeof r.pitch !== "number" ||
    typeof r.jitter !== "number"
  )
    throw Error("Unknown boundary field or nonnumeric metre parameter");
  const result = { type: r.type as BoundaryArrangement["type"], pitch: r.pitch, jitter: r.jitter };
  validateBoundaryArrangement(result);
  return result;
}
