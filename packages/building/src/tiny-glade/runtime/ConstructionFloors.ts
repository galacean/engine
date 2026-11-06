import { add, div, f32, mul, randomSplits, RoofRandom, sub } from "./RecoveredRoofMath.ts";
import { constructionWallLowerBoundary } from "./ConstructionWallLowerBoundary.ts";
import { finalizeWallConnectionHoles } from "./RecoveredWallConnectionHoles.ts";
import { resolveWallHole, wallIntersects } from "./RecoveredWallHoles.ts";
import { unitFootprintScale } from "./MaterialFootprint.ts";
import { resolvedArrangement, type UnitPlacementBinding as MasonryBinding } from "./UnitPlacement";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import type { WallConnectionShape, WallConnectionWipHole } from "./WallConnectionTypes";
import type { WallPiece, WallRect } from "./WallTypes";
import { constructionSupport, type SupportCell, type SupportFace } from "./PlacementSupport";

export interface ConstructionFloorSettings {
  enabled: boolean;
  /** Standard storey height in metres. */
  interval: number;
}
export const DEFAULT_CONSTRUCTION_FLOORS: Readonly<ConstructionFloorSettings> = Object.freeze({
  enabled: true,
  interval: 3.5
});

/** Seed World authoring policy: round the body height to whole storeys.
 * Half a storey rounds up. Existing belts stay at multiples of the standard
 * height while the top storey absorbs the remainder. This replaces the native
 * split_height_into_skirts thresholds; it is not a native parity claim. */
export function constructionFloorLevels(
  height: number,
  settings: ConstructionFloorSettings = DEFAULT_CONSTRUCTION_FLOORS
): number[] {
  const { enabled, interval } = settings;
  if (![height, interval].every((v) => Number.isFinite(f32(v))) || height < 0 || !(f32(interval) > 0))
    throw Error("Finite nonnegative body height and positive floor interval required");
  if (!enabled) return [];
  const floors = Math.max(1, Math.round(height / interval));
  if (!Number.isSafeInteger(floors)) throw Error("Floor count exceeds integer resolution");
  const result: number[] = [];
  for (let i = 1; i < floors; i++) {
    const y = f32(i * interval);
    if (i > 1 && !(y > result[result.length - 1]))
      throw Error("Floor interval is below the Float32 resolution at this height");
    result.push(y);
  }
  return result;
}

/** Native random-split and finalized-hole kernels place the generated belts.
 * Count and height policy belongs to Seed World. Body height excludes roof,
 * terrain fill and open supports; originY locates its base in the wall frame.
 * Belts retain wall material and UVs so local edits apply to them as well. */
export function buildConstructionFloors(input: {
  id: string;
  binding: MasonryBinding;
  shape: WallConnectionShape;
  profile: PublishedWallProfile;
  baseY: number;
  wallHeight: number;
  originY?: number;
  settings?: ConstructionFloorSettings;
  holes?: readonly WallConnectionWipHole[];
}) {
  const { id, binding, shape, profile, baseY } = input;
  const origin = input.originY ?? profile.maxGround;
  if (!id || !Number.isFinite(baseY) || !Number.isFinite(origin))
    throw Error("Stable wall identity and finite floor origin required");
  const levels = constructionFloorLevels(input.wallHeight, input.settings).map((y) => add(y, origin));
  const curve = profile.control,
    length = curve.length;
  const scale = unitFootprintScale(binding.footprint),
    rule = resolvedArrangement(binding);
  const nativeRows = rule === "staggered_rows";
  const thickness = mul(0.76, scale.depth),
    beltHeight = mul(0.2, scale.height);
  const pitch = nativeRows ? mul(0.69, scale.width) : binding.footprint.width;
  const holes: WallRect[] = finalizeWallConnectionHoles([...(input.holes ?? [])], length, true).map((h) => [
    h.minU,
    h.minY,
    h.maxU,
    h.maxY
  ]);
  const cells: SupportCell[] = [],
    faces: SupportFace[] = [];
  // Rectangle corners are hard boundaries. Curved walls are sampled at each
  // cell's endpoints, rather than emitting tiny bricks per tessellation edge.
  const segments = shape.type === "rectangle" ? curve.knots : [0, 1];
  const terrainAt = (u: number) => {
    const [edge, t] = profile.projected.coord(u);
    return profile.points[edge][1] * (1 - t) + profile.points[edge + 1][1] * t;
  };
  const lower = profile.third.some((v) => v > 0) ? constructionWallLowerBoundary(profile) : undefined;
  const splitAtOpening = (queue: WallPiece[]): WallPiece[] => {
    if (!lower) return queue;
    const result: WallPiece[] = [];
    for (const piece of queue) {
      const [start, bottom, end, top] = piece.bounds;
      let previous = start;
      for (const knot of lower.knots) {
        const u = knot * length;
        if (u <= previous || u >= end) continue;
        result.push({ ...piece, bounds: [previous, bottom, u, top] });
        previous = u;
      }
      result.push({ ...piece, bounds: [previous, bottom, end, top] });
    }
    return result;
  };
  const appendSupport = (cell: SupportCell) => {
    const corners = [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) =>
        [-1, 1].map((z) =>
          cell.center.map(
            (v, k) =>
              v +
              (x * cell.size[0] * cell.tangent[k] +
                y * cell.size[1] * cell.bitangent[k] +
                z * cell.size[2] * cell.normal[k]) /
                2
          )
        )
      )
    );
    for (const indices of [
      [0, 2, 3, 1],
      [4, 5, 7, 6],
      [0, 4, 6, 2],
      [1, 3, 7, 5],
      [2, 6, 7, 3],
      [0, 1, 5, 4]
    ]) {
      const points = indices.map((i) => corners[i]);
      // Preserve metric face charts around the wall-space anchor. Projecting
      // top/side faces directly onto the wall would collapse their UV area.
      const width = Math.hypot(...points[0].map((v, k) => points[1][k] - v));
      const height = Math.hypot(...points[0].map((v, k) => points[3][k] - v));
      const uv = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height]
      ].map(([u, v]) => [cell.anchor_uv[0] - width / 2 + u, cell.anchor_uv[1] - height / 2 + v]);
      // Preserve the existing wall-space mapping while reversing the inward
      // box winding. The preview clipper retains this signed chart orientation.
      faces.push({ points: points.reverse(), uv: uv.reverse() });
    }
  };
  levels.forEach((level, row) => {
    const nativeSeed = BigInt(Math.trunc(mul(add(add(level, profile.maxY), length), 1000)));
    const rng = new RoofRandom(BigInt.asUintN(64, binding.seed === "source" ? nativeSeed : BigInt(binding.seed)));
    for (let segment = 1; segment < segments.length; segment++) {
      const lo = mul(segments[segment - 1], length),
        hi = mul(segments[segment], length),
        span = sub(hi, lo);
      const count = Math.max(2, Math.trunc(div(span, pitch)) + 1);
      let cuts: number[];
      if (nativeRows)
        cuts = randomSplits(count, div(mul(0.32, scale.width), span), rng).map((t) => add(lo, mul(t, span)));
      else {
        cuts = [lo];
        const shift = rule === "overlap_rows" ? (row % 2) * 0.5 : 0;
        for (let column = Math.floor(lo / pitch - shift) + 1; (column + shift) * pitch < hi; column++)
          cuts.push((column + shift) * pitch);
        cuts.push(hi);
      }
      for (let column = 1; column < cuts.length; column++) {
        const queue: WallPiece[] = [
          {
            bounds: [cuts[column - 1], sub(level, beltHeight / 2), cuts[column], add(level, beltHeight / 2)],
            deformation: [0, 0, 0, 0],
            id: column,
            splitX: false,
            splitY: false
          }
        ];
        for (const hole of holes) if (queue.some((p) => wallIntersects(p.bounds, hole))) resolveWallHole(hole, queue);
        const clipped = splitAtOpening(queue);
        for (let piece = 0; piece < clipped.length; piece++) {
          const [u0, bottom, u1, top] = clipped[piece].bounds;
          const ground = lower
            ? Math.max(baseY, lower.maximum(u0 / length, u1 / length))
            : Math.max(baseY, terrainAt(u0 / length), terrainAt(u1 / length), terrainAt((u0 + u1) / (2 * length)));
          const y0 = Math.max(bottom, ground),
            y1 = Math.min(top, profile.maxY),
            h = y1 - y0;
          // add_skirts discards final pieces shorter than 0.1 m (scaled unit).
          if (h < mul(0.1, scale.height) || u1 <= u0) continue;
          const a = curve.sample(u0 / length),
            b = curve.sample(u1 / length);
          const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (width <= 1e-8) continue;
          const tangent = [(b[0] - a[0]) / width, 0, (b[1] - a[1]) / width];
          const key = `${id}/belt-${row}/segment-${segment}/${column}/${piece}`;
          cells.push({
            id: key,
            logical_id: key,
            ...(binding.variationKey !== undefined
              ? {
                  seed_id: `${binding.variationKey}/belt-${row}/segment-${segment}/${column}/${piece}`,
                  lod_seed_id: `${binding.variationKey}/belt-${row}/segment-${segment}/${column}/${piece}`
                }
              : {}),
            surface_id: id,
            anchor_uv: [(u0 + u1) / 2, (y0 + y1) / 2 - profile.minGround],
            center: [(a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2],
            tangent,
            bitangent: [0, 1, 0],
            normal: [-tangent[2], 0, tangent[0]],
            size: [width, h, thickness],
            // Original add_skirts emits BrickTransform flags=4: the brick
            // shader applies its seeded belt expansion, independently of material.
            brick_flags: 4
          });
        }
      }
    }
  });
  // The support envelope is authored geometry, not a union of placed units.
  // Keep its tessellation and height independent of material, arrangement and
  // random seed. Depth follows the same wall thickness as the native belt;
  // a fixed .76 shell is buried by plaster when the wall gets thicker. Other
  // appearance edits must not change structural notifications.
  levels.forEach((level, row) => {
    for (let edge = 1; edge < curve.knots.length; edge++) {
      const queue: WallPiece[] = [
        {
          bounds: [
            mul(curve.knots[edge - 1], length),
            sub(level, 0.1),
            mul(curve.knots[edge], length),
            add(level, 0.1)
          ],
          deformation: [0, 0, 0, 0],
          id: edge,
          splitX: false,
          splitY: false
        }
      ];
      for (const hole of holes) if (queue.some((p) => wallIntersects(p.bounds, hole))) resolveWallHole(hole, queue);
      const clipped = splitAtOpening(queue);
      for (let piece = 0; piece < clipped.length; piece++) {
        const [u0, bottom, u1, top] = clipped[piece].bounds;
        const ground = lower
          ? Math.max(baseY, lower.maximum(u0 / length, u1 / length))
          : Math.max(baseY, terrainAt(u0 / length), terrainAt(u1 / length), terrainAt((u0 + u1) / (2 * length)));
        const y0 = Math.max(bottom, ground),
          y1 = Math.min(top, profile.maxY),
          h = y1 - y0;
        if (h < f32(0.1) || u1 <= u0) continue;
        const a = curve.sample(u0 / length),
          b = curve.sample(u1 / length);
        const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (width <= 1e-8) continue;
        const tangent = [(b[0] - a[0]) / width, 0, (b[1] - a[1]) / width];
        const key = `${id}/belt-support-${row}/${edge}/${piece}`;
        appendSupport({
          id: key,
          logical_id: key,
          ...(binding.variationKey !== undefined
            ? {
                seed_id: `${binding.variationKey}/belt-support-${row}/${edge}/${piece}`,
                lod_seed_id: `${binding.variationKey}/belt-support-${row}/${edge}/${piece}`
              }
            : {}),
          surface_id: id,
          anchor_uv: [(u0 + u1) / 2, (y0 + y1) / 2 - profile.minGround],
          center: [(a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2],
          tangent,
          bitangent: [0, 1, 0],
          normal: [-tangent[2], 0, tangent[0]],
          size: [width, h, thickness]
        });
      }
    }
  });
  return { levels, cells, ...constructionSupport(id, binding.unit_id, faces) };
}
