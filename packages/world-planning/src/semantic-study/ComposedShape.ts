import type { PlanPoint } from "./IslandPlanModel";

/** Editable rectangle in world metres; yaw is in degrees. */
export interface ShapeBlock {
  id: string;
  x: number;
  z: number;
  width: number;
  length: number;
  yaw: number;
}
/** Persisted shape source. Curves and sampled boundaries are derived from these blocks. */
export interface ShapeRecipe {
  id: string;
  label: string;
  rounding: number;
  blocks: ShapeBlock[];
  contourDetail?: number;
  boundaryBounds?: { x: number; z: number; halfX: number; halfZ: number };
  resolvedContourBase?: { outline: PlanPoint[]; outlines?: PlanPoint[][] };
}
/** Local component edits, additions and removals, keyed by shape identity. */
export type ShapeEdits = Record<
  string,
  {
    source?: ShapeRecipe;
    semantic?: ShapeIntent;
    patches?: Record<string, Partial<ShapeBlock>>;
    added?: ShapeBlock[];
    removed?: string[];
  }
>;
/** Applies local edits without mutating the recipe or unrelated components.
 * @param recipe Source component group.
 * @param edits Optional local overrides.
 * @returns A serializable edited recipe.
 */
export function editShape(recipe: ShapeRecipe, edits: ShapeEdits = {}): ShapeRecipe {
  const e = edits[recipe.id];
  const source = e?.source ?? recipe;
  const edited = {
    ...source,
    blocks: [...source.blocks, ...(e?.added ?? [])]
      .filter((b) => !e?.removed?.includes(b.id))
      .map((b) => ({ ...b, ...e?.patches?.[b.id], id: b.id }))
  };
  return reshapeShape(edited, e?.semantic);
}
const EPS = 1e-6;
const add = (a: PlanPoint, b: PlanPoint) => ({ x: a.x + b.x, z: a.z + b.z });
const sub = (a: PlanPoint, b: PlanPoint) => ({ x: a.x - b.x, z: a.z - b.z });
const mul = (a: PlanPoint, n: number) => ({ x: a.x * n, z: a.z * n });
const cross = (a: PlanPoint, b: PlanPoint) => a.x * b.z - a.z * b.x;
const length = (a: PlanPoint) => Math.hypot(a.x, a.z);
const lerp = (a: PlanPoint, b: PlanPoint, t: number) => add(a, mul(sub(b, a), t));
const key = (p: PlanPoint) => `${Math.round(p.x / EPS)},${Math.round(p.z / EPS)}`;
function corners(b: ShapeBlock): PlanPoint[] {
  const a = (b.yaw * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ].map(([u, v]) => ({
    x: b.x + ((u * b.width) / 2) * c - ((v * b.length) / 2) * s,
    z: b.z + ((u * b.width) / 2) * s + ((v * b.length) / 2) * c
  }));
}
function inside(p: PlanPoint, ring: PlanPoint[]): boolean {
  return ring.every((a, i) => cross(sub(ring[(i + 1) % ring.length], a), sub(p, a)) >= -EPS);
}
/** Extract exposed rectangle edges, including intersection vertices.
 * @param blocks Connected or disjoint rectangle components in world metres.
 * @param precision Arrangement tolerance; smaller values preserve thin differences between adjacent widths.
 * @returns Closed boundary rings without curve expansion.
 * @throws When numerical edge arrangement cannot close a boundary.
 */
export function unionRectangles(blocks: ShapeBlock[], precision = EPS, exposedOwners?: Set<string>): PlanPoint[][] {
  const EPS = precision;
  const inside = (p: PlanPoint, ring: PlanPoint[]) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      if ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) < -EPS) return false;
    }
    return true;
  };
  const polygons = blocks.map(corners),
    edges = polygons.flatMap((r, owner) => r.map((a, i) => ({ a, b: r[(i + 1) % 4], owner })));
  const boxes = polygons.map((r) => ({
    x0: Math.min(...r.map((p) => p.x)),
    x1: Math.max(...r.map((p) => p.x)),
    z0: Math.min(...r.map((p) => p.z)),
    z1: Math.max(...r.map((p) => p.z))
  }));
  const edgeBounds = edges.map((e) => ({
    x0: Math.min(e.a.x, e.b.x),
    x1: Math.max(e.a.x, e.b.x),
    z0: Math.min(e.a.z, e.b.z),
    z1: Math.max(e.a.z, e.b.z)
  }));
  const maxLength = Math.max(
      1,
      ...blocks.flatMap((b) => [b.width, b.length, 1 / Math.max(1e-12, b.width), 1 / Math.max(1e-12, b.length)])
    ),
    padding = precision * maxLength * 2;
  const pieces: { a: PlanPoint; b: PlanPoint; owner: number }[] = [];
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
    const edge = edges[edgeIndex],
      eb = edgeBounds[edgeIndex];
    const direction = sub(edge.b, edge.a),
      cuts = [0, 1];
    for (let otherIndex = 0; otherIndex < edges.length; otherIndex++) {
      const other = edges[otherIndex],
        ob = edgeBounds[otherIndex];
      if (
        other.owner === edge.owner ||
        eb.x1 + padding < ob.x0 ||
        ob.x1 + padding < eb.x0 ||
        eb.z1 + padding < ob.z0 ||
        ob.z1 + padding < eb.z0
      )
        continue;
      const dx = other.b.x - other.a.x,
        dz = other.b.z - other.a.z,
        ox = other.a.x - edge.a.x,
        oz = other.a.z - edge.a.z,
        den = direction.x * dz - direction.z * dx;
      if (Math.abs(den) > EPS) {
        const t = (ox * dz - oz * dx) / den,
          u = (ox * direction.z - oz * direction.x) / den;
        if (t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS) cuts.push(t);
      } else if (Math.abs(ox * direction.z - oz * direction.x) < EPS) {
        const norm = direction.x ** 2 + direction.z ** 2;
        for (const p of [other.a, other.b]) {
          const v = sub(p, edge.a),
            t = (v.x * direction.x + v.z * direction.z) / norm;
          if (t > EPS && t < 1 - EPS) cuts.push(t);
        }
      }
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < EPS) continue;
      const a = lerp(edge.a, edge.b, cuts[i - 1]),
        b = lerp(edge.a, edge.b, cuts[i]),
        mid = lerp(a, b, 0.5),
        outward = mul({ x: direction.z, z: -direction.x }, (precision * 100) / length(direction));
      const probe = add(mid, outward);
      if (
        !polygons.some(
          (r, j) =>
            j !== edge.owner &&
            probe.x >= boxes[j].x0 - padding &&
            probe.x <= boxes[j].x1 + padding &&
            probe.z >= boxes[j].z0 - padding &&
            probe.z <= boxes[j].z1 + padding &&
            inside(probe, r)
        )
      )
        pieces.push({ a, b, owner: edge.owner });
    }
  }
  const unique = new Map(pieces.map((e) => [`${key(e.a)}:${key(e.b)}`, e]));
  if (exposedOwners) {
    exposedOwners.clear();
    for (const piece of unique.values()) exposedOwners.add(blocks[piece.owner].id);
  }
  const pending = [...unique.values()],
    loops: PlanPoint[][] = [];
  while (pending.length) {
    const first = pending.shift()!,
      ring = [first.a];
    let end = first.b;
    while (length(sub(end, first.a)) > 1e-4) {
      ring.push(end);
      const index = pending.findIndex((e) => length(sub(e.a, end)) < 1e-4);
      if (index < 0) throw new Error("组件边界未形成闭合区域");
      end = pending.splice(index, 1)[0].b;
    }
    // Remove arrangement-only vertices on straight sides before tangent construction.
    const clean = ring.filter((v, i) => {
      const a = sub(v, ring[(i + ring.length - 1) % ring.length]),
        b = sub(ring[(i + 1) % ring.length], v);
      return Math.abs(cross(a, b)) > EPS * length(a) * length(b);
    });
    if (clean.length >= 3) loops.push(clean);
  }
  return loops;
}
function cubic(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint, t: number): PlanPoint {
  const u = 1 - t;
  return add(add(mul(a, u * u * u), mul(b, 3 * u * u * t)), add(mul(c, 3 * u * t * t), mul(d, t * t * t)));
}
function smoothBoundary(ring: PlanPoint[], rounding: number): PlanPoint[] {
  const n = ring.length;
  // Transition sites are derived afresh from both incident sides, not persisted control points.
  const sites = ring.map((v, i) => {
    const before = ring[(i + n - 1) % n],
      after = ring[(i + 1) % n];
    const reach = Math.min(0.3, rounding / Math.max(1, Math.min(length(sub(v, before)), length(sub(after, v)))));
    return add(mul(v, 1 - reach), mul(add(before, after), reach / 2));
  });
  const tangents = sites.map((v, i) => {
    const a = sub(v, sites[(i + n - 1) % n]),
      b = sub(sites[(i + 1) % n], v),
      la = length(a),
      lb = length(b);
    const direction = add(mul(a, 1 / (la || 1)), mul(b, 1 / (lb || 1))),
      m = length(direction);
    return mul(direction, m ? (Math.min(la, lb) * 0.3) / m : 0);
  });
  const out: PlanPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = sites[i],
      d = sites[(i + 1) % n],
      b = add(a, tangents[i]),
      c = sub(d, tangents[(i + 1) % n]);
    const steps = Math.max(4, Math.ceil((length(sub(a, b)) + length(sub(b, c)) + length(sub(c, d))) / 4));
    for (let j = 0; j < steps; j++) out.push(cubic(a, b, c, d, j / steps));
  }
  return out;
}
/** Detect proper crossings of a sampled shape boundary, preserving the shape compiler's tolerance.
 * @param ring Closed boundary represented without a repeated final vertex.
 * @returns Whether non-adjacent edges cross according to the compiler's original cross-product threshold.
 */
export function hasShapeBoundaryCrossing(ring: PlanPoint[]): boolean {
  if (ring.length < 4) return false;
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const alongX = maxX - minX >= maxZ - minZ;
  const edges = ring
    .map((a, index) => {
      const b = ring[(index + 1) % ring.length],
        x0 = Math.min(a.x, b.x),
        x1 = Math.max(a.x, b.x),
        z0 = Math.min(a.z, b.z),
        z1 = Math.max(a.z, b.z);
      return {
        index,
        a,
        b,
        dx: b.x - a.x,
        dz: b.z - a.z,
        low: alongX ? x0 : z0,
        high: alongX ? x1 : z1,
        otherLow: alongX ? z0 : x0,
        otherHigh: alongX ? z1 : x1
      };
    })
    .sort((a, b) => a.low - b.low);
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const b = edges[j];
      if (b.low > a.high) break;
      const difference = Math.abs(a.index - b.index);
      if (difference === 1 || difference === ring.length - 1 || a.otherHigh < b.otherLow || b.otherHigh < a.otherLow)
        continue;
      // The sweep removes disjoint bounds only; this is the unchanged narrow-phase predicate.
      if (
        (a.dx * (b.a.z - a.a.z) - a.dz * (b.a.x - a.a.x)) * (a.dx * (b.b.z - a.a.z) - a.dz * (b.b.x - a.a.x)) < -EPS &&
        (b.dx * (a.a.z - b.a.z) - b.dz * (a.a.x - b.a.x)) * (b.dx * (a.b.z - b.a.z) - b.dz * (a.b.x - b.a.x)) < -EPS
      )
        return true;
    }
  }
  return false;
}
/** Add bounded local boundary relief without changing its rectangle skeleton or topology.
 * @param ring Authoritative coarse boundary, sampled or polygonal.
 * @param detail Relative contour detail in [0,1]; zero preserves the baseline exactly.
 * @param clearance Optional distance to protected physical geometry; an eight-metre guard preserves contacts.
 * @returns A simple contour with 64-metre features and at most four metres of inward displacement.
 */
export function refineShapeBoundary(
  ring: PlanPoint[],
  detail: number,
  clearance?: (p: PlanPoint) => number
): PlanPoint[] {
  const amount = Math.max(0, Math.min(1, Number.isFinite(detail) ? detail : 0));
  if (!amount || ring.length < 3) return ring;
  const points: PlanPoint[] = [],
    along: number[] = [];
  let perimeter = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      length = Math.hypot(b.x - a.x, b.z - a.z),
      count = Math.max(1, Math.ceil(length / 4));
    for (let j = 0; j < count; j++) {
      const t = j / count;
      points.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      along.push(perimeter + length * t);
    }
    perimeter += length;
  }
  const orientation =
    ring.reduce((area, p, i) => area + p.x * ring[(i + 1) % ring.length].z - p.z * ring[(i + 1) % ring.length].x, 0) >=
    0
      ? 1
      : -1;
  const layers = [256, 128, 64].map((scale, i) => ({
    cycles: Math.max(1, Math.floor(perimeter / scale)),
    weight: Math.max(0, Math.min(1, amount * 3 - i))
  }));
  if (perimeter < 32) return ring;
  for (const repair of [1, 0.5, 0.25]) {
    const candidate = points.map((p, i) => {
      const before = points[(i + points.length - 1) % points.length],
        after = points[(i + 1) % points.length],
        dx = after.x - before.x,
        dz = after.z - before.z,
        length = Math.hypot(dx, dz) || 1;
      const phase = (along[i] / perimeter) * Math.PI * 2;
      // Higher detail introduces progressively shorter waves; no macro random stream is consumed.
      const wave = layers.reduce(
        (sum, layer, j) => sum + (layer.weight * (1 - Math.cos(phase * layer.cycles + j * 1.7))) / 6,
        0
      );
      const available = clearance ? Math.max(0, clearance(p) - 8) : Infinity;
      const offset = Math.min(4 * repair, available) * wave;
      return { x: p.x - (dz / length) * offset * orientation, z: p.z + (dx / length) * offset * orientation };
    });
    if (!hasShapeBoundaryCrossing(candidate)) return candidate;
  }
  return ring;
}
/** Compiles editable rectangles into connected Bézier transitions without a graphics-library runtime.
 * @param recipe Component source and transition reach in metres.
 * @returns All closed region rings sampled at at most four metres of Bézier control-polygon travel.
 * @throws When component dimensions are invalid or boundary connectivity is ambiguous.
 */
export function compileShape(recipe: ShapeRecipe): PlanPoint[][] {
  for (const b of recipe.blocks)
    if (![b.x, b.z, b.width, b.length, b.yaw].every(Number.isFinite) || b.width <= 0 || b.length <= 0)
      throw new Error("组件尺寸必须为正数");
  const rings = unionRectangles(recipe.blocks).map((r) => smoothBoundary(r, recipe.rounding));
  if (rings.some(hasShapeBoundaryCrossing)) throw new Error("组件过渡发生交叉，请调整连接位置或宽度");
  return recipe.contourDetail && rings.length === 1
    ? rings.map((r) => refineShapeBoundary(r, recipe.contourDetail!))
    : rings;
}
/** Builds a rectangular connector; endpoints remain the editable segment's attachment locations.
 * @param id Stable component identifier.
 * @param a Start attachment.
 * @param b End attachment.
 * @param width Full cross-section width.
 * @returns Rectangle overlapping neighbouring connectors at their endpoints.
 */
export function connectorBlock(id: string, a: PlanPoint, b: PlanPoint, width: number): ShapeBlock {
  return {
    id,
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    width,
    length: Math.hypot(b.x - a.x, b.z - a.z) + width * 0.65,
    yaw: (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI - 90
  };
}

/** Finds a nearby, overlapping component, preferring an exposed side of the selected rectangle.
 * @param recipe Existing component group.
 * @param parent Selected component.
 * @param id New stable component identity.
 * @param worldSize Square planning extent in metres.
 * @returns A component attached to the parent, or undefined when no candidate fits.
 */
export function attachedBlock(
  recipe: ShapeRecipe,
  parent: ShapeBlock,
  id: string,
  worldSize: number
): ShapeBlock | undefined {
  const angle = (parent.yaw * Math.PI) / 180,
    axes = [
      { x: Math.cos(angle), z: Math.sin(angle) },
      { x: -Math.sin(angle), z: Math.cos(angle) }
    ];
  const bounded = Number.isFinite(worldSize),
    searchExtent = bounded
      ? worldSize
      : Math.max(...recipe.blocks.map((b) => Math.abs(b.x) + Math.abs(b.z) + b.width + b.length));
  const polygons = recipe.blocks.map(corners),
    candidates: { block: ShapeBlock; cost: number }[] = [];
  for (let axisIndex = 0; axisIndex < 2; axisIndex++)
    for (const sign of [-1, 1])
      for (const along of [-0.6, -0.3, 0, 0.3, 0.6]) {
        const axis = mul(axes[axisIndex], sign),
          side = axes[1 - axisIndex];
        const extent = (axisIndex ? parent.length : parent.width) / 2,
          crossSize = (axisIndex ? parent.width : parent.length) * 0.2;
        const baseDepth = extent * 0.4,
          overlap = baseDepth * 0.2;
        const anchor = add(parent, mul(side, (along * (axisIndex ? parent.width : parent.length)) / 2));
        // Search outward from this parent's side. The new rectangle keeps its inner end attached.
        for (let extra = 0; extra <= searchExtent; extra += Math.max(8, baseDepth / 4)) {
          const depth = baseDepth + extra,
            center = add(anchor, mul(axis, extent - overlap + depth / 2));
          const block = {
            id,
            ...center,
            width: axisIndex ? crossSize : depth,
            length: axisIndex ? depth : crossSize,
            yaw: parent.yaw
          };
          if (bounded && corners(block).some((p) => p.x < 0 || p.z < 0 || p.x > worldSize || p.z > worldSize)) break;
          let outside = 0;
          for (let u = 0; u < 5; u++)
            for (let v = 0; v < 5; v++) {
              const sample = add(
                center,
                add(mul(axis, depth * ((u + 0.5) / 5 - 0.5)), mul(side, crossSize * ((v + 0.5) / 5 - 0.5)))
              );
              if (!polygons.some((p) => inside(sample, p))) outside++;
            }
          if (outside >= 8) {
            candidates.push({ block, cost: extra + Math.abs(along) * crossSize * 0.1 });
            break;
          }
        }
      }
  candidates.sort((a, b) => a.cost - b.cost);
  for (const { block } of candidates) {
    try {
      const rings = compileShape({ ...recipe, blocks: [...recipe.blocks, block] });
      if (
        rings.length === 1 &&
        (!bounded || rings[0].every((p) => p.x >= 0 && p.z >= 0 && p.x <= worldSize && p.z <= worldSize))
      )
        return block;
    } catch {
      /* Only the finite local attachment candidates are considered. */
    }
  }
  return undefined;
}

/** Whole-region intent. Defaults preserve the authored component source exactly. */
export interface ShapeIntent {
  size: number;
  stretch: number;
  bend: number;
  widthVariation: number;
  branches: number;
}
/** Neutral intent; scalar controls are dimensionless and branches is an integer count. */
export const SHAPE_INTENT_DEFAULTS: Readonly<ShapeIntent> = {
  size: 1,
  stretch: 1,
  bend: 0,
  widthVariation: 0,
  branches: 0
};
/** Derives coordinated component geometry from a stable source, preserving source overlap links.
 * @param recipe Reference rectangles, never mutated.
 * @param intent Whole-region proportions, smooth deformation and branch count.
 * @returns Derived rectangles including any required connecting pieces.
 * @throws If parameters are invalid or a requested branch cannot fit inside the planning world.
 */
export function reshapeShape(recipe: ShapeRecipe, intent?: ShapeIntent): ShapeRecipe {
  if (!intent || Object.entries(SHAPE_INTENT_DEFAULTS).every(([k, v]) => intent[k as keyof ShapeIntent] === v))
    return recipe;
  const q = intent;
  if (
    !Object.values(q).every(Number.isFinite) ||
    q.size <= 0 ||
    q.stretch <= 0 ||
    Math.abs(q.bend) > 1 ||
    q.widthVariation < 0 ||
    q.widthVariation > 1 ||
    !Number.isInteger(q.branches) ||
    q.branches < 0 ||
    q.branches > 3
  )
    throw new Error("形状意图参数无效");
  const points = recipe.blocks.flatMap(corners),
    center = mul(points.reduce(add, { x: 0, z: 0 }), 1 / points.length);
  let xx = 0,
    zz = 0,
    xz = 0;
  for (const p of points) {
    const d = sub(p, center);
    xx += d.x * d.x;
    zz += d.z * d.z;
    xz += d.x * d.z;
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz),
    u = { x: Math.cos(angle), z: Math.sin(angle) },
    v = { x: -u.z, z: u.x };
  const dot = (a: PlanPoint, b: PlanPoint) => a.x * b.x + a.z * b.z;
  const coords = points.map((p) => dot(sub(p, center), u)),
    lo = Math.min(...coords),
    span = Math.max(...coords) - lo;
  const warp = (p: PlanPoint): PlanPoint => {
    const d = sub(p, center),
      a = dot(d, u),
      b = dot(d, v),
      t = (a - lo) / Math.max(1, span);
    const width = 1 + q.widthVariation * 0.4 * Math.sin(t * Math.PI * 2);
    const bend = q.bend * span * 0.12 * Math.sin(t * Math.PI * 2) * Math.sin(t * Math.PI);
    return add(center, add(mul(u, a * q.size * q.stretch), mul(v, ((b * width) / q.stretch + bend) * q.size)));
  };
  const blocks = recipe.blocks.map((b) => {
    const ring = corners(b),
      samples = ring
        .flatMap((p, i) => [
          p,
          lerp(p, ring[(i + 1) % 4], 0.25),
          lerp(p, ring[(i + 1) % 4], 0.5),
          lerp(p, ring[(i + 1) % 4], 0.75)
        ])
        .map(warp);
    const a = (b.yaw * Math.PI) / 180,
      axis = sub(warp(add(b, { x: Math.cos(a), z: Math.sin(a) })), warp(b)),
      len = length(axis),
      e = mul(axis, 1 / (len || 1)),
      f = { x: -e.z, z: e.x };
    const xs = samples.map((p) => dot(p, e)),
      zs = samples.map((p) => dot(p, f)),
      x0 = Math.min(...xs),
      x1 = Math.max(...xs),
      z0 = Math.min(...zs),
      z1 = Math.max(...zs);
    return {
      id: b.id,
      ...add(mul(e, (x0 + x1) / 2), mul(f, (z0 + z1) / 2)),
      width: x1 - x0,
      length: z1 - z0,
      yaw: (Math.atan2(e.z, e.x) * 180) / Math.PI
    };
  });
  const overlaps = (a: ShapeBlock, b: ShapeBlock): boolean => {
    const pa = corners(a),
      pb = corners(b);
    return [a.yaw, b.yaw].every((deg) =>
      [0, Math.PI / 2].every((offset) => {
        const rad = (deg * Math.PI) / 180 + offset,
          axis = { x: Math.cos(rad), z: Math.sin(rad) },
          aa = pa.map((p) => dot(p, axis)),
          bb = pb.map((p) => dot(p, axis));
        return Math.max(...aa) >= Math.min(...bb) && Math.max(...bb) >= Math.min(...aa);
      })
    );
  };
  for (let i = 0; i < recipe.blocks.length; i++)
    for (let j = i + 1; j < recipe.blocks.length; j++) {
      if (overlaps(recipe.blocks[i], recipe.blocks[j]) && !overlaps(blocks[i], blocks[j]))
        blocks.push(
          connectorBlock(
            `${recipe.id}-join-${i}-${j}`,
            blocks[i],
            blocks[j],
            Math.min(blocks[i].width, blocks[i].length, blocks[j].width, blocks[j].length) * 0.5
          )
        );
    }
  let shaped = { ...recipe, rounding: recipe.rounding * q.size, blocks };
  for (let i = 0; i < q.branches; i++) {
    const parent = blocks[Math.floor(((i + 1) * recipe.blocks.length) / (q.branches + 1))],
      child = attachedBlock(shaped, parent, `${recipe.id}-branch-${i}`, Infinity);
    if (!child) throw new Error("当前范围放不下该分支；请缩小形状或减少分支");
    const direction = sub(child, parent),
      distance = length(direction),
      axis = mul(direction, 1 / (distance || 1));
    const branchLength = Math.max(24, Math.min(160, span * 0.12)),
      branchWidth = Math.max(8, Math.min(child.width, child.length));
    const mid = add(child, mul(axis, branchLength * 0.5)),
      tip = add(child, mul(axis, branchLength));
    shaped = {
      ...shaped,
      blocks: [
        ...shaped.blocks,
        child,
        connectorBlock(`${child.id}-extension-0`, child, mid, branchWidth * 0.9),
        connectorBlock(`${child.id}-extension-1`, mid, tip, branchWidth * 0.75)
      ]
    };
  }
  return shaped;
}
