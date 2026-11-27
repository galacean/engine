import {
  compileShape,
  unionRectangles,
  hasShapeBoundaryCrossing,
  type ShapeRecipe,
  type ShapeBlock
} from "./ComposedShape";
import { envelope } from "./IslandPlanAtoms";
import type { PlanPoint } from "./IslandPlanModel";

/** Intent for a connected region; component count controls structural complexity. */
export interface RegionGrowth {
  id: string;
  center: PlanPoint;
  width: number;
  length: number;
  angle: number;
  count: number;
  random: (key: string) => number;
  curvature?: number;
  centered?: boolean;
  contourDetail?: number;
}
/** Grow overlapping components from a branching skeleton, then fit the requested envelope.
 * @param intent Size, orientation, complexity and stable random stream.
 * @returns Editable rectangles; contours remain derived rather than authored control points.
 */
export function growRegion(intent: RegionGrowth): ShapeRecipe {
  const { id, random } = intent,
    count = Math.max(5, Math.round(intent.count));
  const turnScale = 1 / Math.sqrt(Math.max(intent.width / intent.length, intent.length / intent.width));
  const local: ShapeBlock[] = [
    {
      id: `${id}-block-0`,
      x: 0,
      z: 0,
      width: intent.width * (0.58 + 0.2 * random(`${id}-core-width`)),
      length: intent.length * (0.58 + 0.2 * random(`${id}-core-length`)),
      yaw: (random(`${id}-core-turn`) - 0.5) * 36 * turnScale
    }
  ];
  // Each addition chooses its own parent and attachment direction. There is no
  // fixed ring, paired lobes or mandatory central inlet shared between seeds.
  for (let i = 1; i < count; i++) {
    const parent = local[Math.floor(random(`${id}-parent-${i}`) * local.length)];
    const direction = random(`${id}-attachment-${i}`) * Math.PI * 2;
    const dx = Math.cos(direction),
      dz = Math.sin(direction);
    const reach = Math.min(
      parent.width / (2 * Math.max(1e-9, Math.abs(dx))),
      parent.length / (2 * Math.max(1e-9, Math.abs(dz)))
    );
    const distance = reach * (0.6 + 0.35 * random(`${id}-reach-${i}`));
    const a = (parent.yaw * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a);
    const child: ShapeBlock = {
      id: `${id}-block-${i}`,
      x: parent.x + (dx * c - dz * s) * distance,
      z: parent.z + (dx * s + dz * c) * distance,
      width: intent.width * (0.28 + 0.3 * random(`${id}-width-${i}`)),
      length: intent.length * (0.28 + 0.3 * random(`${id}-length-${i}`)),
      yaw: (random(`${id}-turn-${i}`) - 0.5) * 150 * (0.4 + 0.6 * (intent.curvature ?? 0.8)) * turnScale
    };
    // A branch may meet another branch, but cannot create a hole. Moving its
    // attachment inward preserves every component without painting over a bay.
    for (const inset of [1, 0.65, 0.3, 0]) {
      const candidate = {
        ...child,
        x: parent.x + (child.x - parent.x) * inset,
        z: parent.z + (child.z - parent.z) * inset
      };
      if (exactRegionRing([...local, candidate])) {
        local.push(candidate);
        break;
      }
    }
  }
  const corners = local.flatMap((b) => envelope(b, b.width, b.length, (b.yaw * Math.PI) / 180));
  const cx = intent.centered ? (Math.min(...corners.map((p) => p.x)) + Math.max(...corners.map((p) => p.x))) / 2 : 0,
    cz = intent.centered ? (Math.min(...corners.map((p) => p.z)) + Math.max(...corners.map((p) => p.z))) / 2 : 0;
  const extentX = Math.max(...corners.map((p) => Math.abs(p.x - cx))),
    extentZ = Math.max(...corners.map((p) => Math.abs(p.z - cz))),
    scale = Math.min(intent.width / (2 * extentX), intent.length / (2 * extentZ));
  const cos = Math.cos(intent.angle),
    sin = Math.sin(intent.angle);
  const recipe = {
    id,
    label: id,
    rounding: Math.min(intent.width, intent.length) * 0.12,
    blocks: local.map((b) => ({
      ...b,
      x: intent.center.x + ((b.x - cx) * cos - (b.z - cz) * sin) * scale,
      z: intent.center.z + ((b.x - cx) * sin + (b.z - cz) * cos) * scale,
      width: b.width * scale,
      length: b.length * scale,
      yaw: b.yaw + (intent.angle * 180) / Math.PI
    }))
  };
  return intent.contourDetail ? enrichRegion(recipe, intent.contourDetail, random) : recipe;
}
/** Compile a connected region with a bounded reduction of curved joins when needed.
 * @param recipe Connected rectangle source.
 * @returns One outer contour, preserving all source components.
 * @throws If the source has no single connected outer boundary.
 */
function exactRegionRing(blocks: ShapeBlock[], exposed?: Set<string>): PlanPoint[] | undefined {
  for (const precision of [1e-6, 1e-9, 1e-11]) {
    try {
      const rings = unionRectangles(blocks, precision, exposed);
      if (rings.length === 1 && !hasShapeBoundaryCrossing(rings[0])) return rings[0];
    } catch {
      /* Retry numerical arrangement only; never delete geometry. */
    }
  }
  return undefined;
}
export function compileRegion(recipe: ShapeRecipe): PlanPoint[] {
  for (const rounding of [recipe.rounding, Math.min(4, recipe.rounding), 0]) {
    try {
      const rings = compileShape({ ...recipe, rounding });
      if (
        rings.length === 1 &&
        (!recipe.boundaryBounds ||
          rings[0].every(
            (p) =>
              Math.abs(p.x - recipe.boundaryBounds!.x) <= recipe.boundaryBounds!.halfX + 1e-7 &&
              Math.abs(p.z - recipe.boundaryBounds!.z) <= recipe.boundaryBounds!.halfZ + 1e-7
          ))
      )
        return rings[0];
    } catch {
      /* Retry only the local curve join. */
    }
  }
  // Keep every source rectangle when curve joins cannot represent its topology.
  const exact = exactRegionRing(recipe.blocks);
  if (exact) return exact;
  throw new Error(`${recipe.label}轮廓未连接`);
}

/** Refine the current exposed boundary, rather than spending detail on buried blocks.
 * Each accepted component must replace part of a long exposed edge and add exterior area.
 * Recompute the union after every attachment so covered edges cannot receive more detail.
 */
export function enrichRegion(recipe: ShapeRecipe, detail: number, random: (key: string) => number): ShapeRecipe {
  const amount = Math.max(0, Math.min(1, detail)),
    blocks = recipe.blocks.map((b) => ({ ...b }));
  if (!amount || !blocks.length) return { ...recipe, blocks };
  const signedArea = (ring: PlanPoint[]) =>
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + p.x * q.z - p.z * q.x;
    }, 0) / 2;
  let boundary = exactRegionRing(blocks);
  if (!boundary) return { ...recipe, blocks };
  const originalCenter = {
    x: (Math.min(...boundary.map((p) => p.x)) + Math.max(...boundary.map((p) => p.x))) / 2,
    z: (Math.min(...boundary.map((p) => p.z)) + Math.max(...boundary.map((p) => p.z))) / 2
  };
  const span = Math.min(
    Math.max(...boundary.map((p) => p.x)) - Math.min(...boundary.map((p) => p.x)),
    Math.max(...boundary.map((p) => p.z)) - Math.min(...boundary.map((p) => p.z))
  );
  const budget = Math.ceil(amount * 40),
    target = span * (0.3 - 0.22 * amount);
  for (let step = 0; step < budget; step++) {
    const orientation = Math.sign(signedArea(boundary)),
      area = Math.abs(signedArea(boundary));
    const edges = boundary
      .map((p, i) => {
        const q = boundary![(i + 1) % boundary!.length],
          dx = q.x - p.x,
          dz = q.z - p.z,
          length = Math.hypot(dx, dz);
        return {
          i,
          x: (p.x + q.x) / 2,
          z: (p.z + q.z) / 2,
          length,
          nx: (orientation * dz) / length,
          nz: (-orientation * dx) / length,
          yaw: (Math.atan2(dz, dx) * 180) / Math.PI
        };
      })
      .filter((e) => e.length > target)
      .sort((a, b) => b.length - a.length || a.i - b.i);
    let accepted = false;
    for (const edge of edges.slice(0, 6)) {
      const width = edge.length * (0.58 + 0.08 * random(`${recipe.id}-edge-width-${step}`)),
        length = width * 0.8;
      const turn = (random(`${recipe.id}-edge-turn-${step}`) - 0.5) * 32;
      for (const insetRatio of [0.32, 0.4, 0.46]) {
        const child: ShapeBlock = {
          id: `${recipe.id}-detail-${step}`,
          x: edge.x - edge.nx * length * insetRatio,
          z: edge.z - edge.nz * length * insetRatio,
          width,
          length,
          yaw: edge.yaw + turn
        };
        const ring = exactRegionRing([...blocks, child]);
        if (!ring) continue;
        if (Math.abs(signedArea(ring)) - area < width * length * 0.04) continue;
        blocks.push(child);
        boundary = ring;
        accepted = true;
        break;
      }
      if (accepted) break;
    }
    if (!accepted) break;
  }
  // Remove redundant buried sources while preserving the exposed contour.
  const area = Math.abs(signedArea(boundary));
  let exposed = new Set<string>();
  exactRegionRing(blocks, exposed);
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (exposed.has(blocks[i].id)) continue;
    const remaining = blocks.filter((_, j) => i !== j),
      nextExposed = new Set<string>(),
      ring = exactRegionRing(remaining, nextExposed);
    if (ring && Math.abs(Math.abs(signedArea(ring)) - area) < Math.max(1e-5, area * 1e-10)) {
      blocks.splice(i, 1);
      exposed = nextExposed;
    }
  }
  const corners = blocks.flatMap((b) => envelope(b, b.width, b.length, (b.yaw * Math.PI) / 180));
  const dx = originalCenter.x - (Math.min(...corners.map((p) => p.x)) + Math.max(...corners.map((p) => p.x))) / 2;
  const dz = originalCenter.z - (Math.min(...corners.map((p) => p.z)) + Math.max(...corners.map((p) => p.z))) / 2;
  // Preserve the region's envelope anchor, so one-sided refinement does not waste
  // world capacity on an accidental translation before the area fit.
  return { ...recipe, blocks: blocks.map((b) => ({ ...b, x: b.x + dx, z: b.z + dz })) };
}

/** Solve physical area within a fixed rectangular envelope, without post-solve shrinking.
 * @param recipe Connected source rectangles.
 * @param targetArea Requested square metres.
 * @param center Fixed world anchor.
 * @param radius Available half extents in metres; a number keeps the square-envelope API.
 * @returns Connected source recipe fitted to the attainable target area.
 */
export function fitRegionArea(
  recipe: ShapeRecipe,
  targetArea: number,
  center: PlanPoint,
  radius: number | { x: number; z: number }
): ShapeRecipe {
  const rx = typeof radius === "number" ? radius : radius.x,
    rz = typeof radius === "number" ? radius : radius.z;
  const plain = { ...recipe, boundaryBounds: undefined },
    ring = compileRegion(plain);
  const area =
    Math.abs(
      ring.reduce((sum, p, i) => sum + p.x * ring[(i + 1) % ring.length].z - p.z * ring[(i + 1) % ring.length].x, 0)
    ) / 2;
  // Include both rendered curves and all source corners when computing capacity.
  const points = [...ring, ...recipe.blocks.flatMap((b) => envelope(b, b.width, b.length, (b.yaw * Math.PI) / 180))];
  const ex = Math.max(...points.map((p) => Math.abs(p.x - center.x))),
    ez = Math.max(...points.map((p) => Math.abs(p.z - center.z)));
  const scale =
    Math.min(Math.sqrt(Math.max(1, targetArea) / Math.max(1, area)), rx / Math.max(1, ex), rz / Math.max(1, ez)) *
    (1 - 1e-9);
  return {
    ...recipe,
    boundaryBounds: { x: center.x, z: center.z, halfX: rx, halfZ: rz },
    rounding: recipe.rounding * scale,
    blocks: recipe.blocks.map((b) => ({
      ...b,
      x: center.x + (b.x - center.x) * scale,
      z: center.z + (b.z - center.z) * scale,
      width: b.width * scale,
      length: b.length * scale
    }))
  };
}
