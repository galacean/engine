import { add, sub, f32 } from "./RecoveredRoofMath";
import { subdivideWoodRegion, type PlankBounds } from "./RecoveredWoodPlank";
import type { HorizontalWoodBoard } from "./RecoveredGablePlank";

/** Native planning region: byte32 is the gable/top marker. After subdivision
 * byte32 becomes board orientation and the top marker moves to byte33. */
export interface WoodWallRegion {
  side: number | null;
  bounds: PlankBounds;
  isTop: boolean;
}

function copyRegion(region: WoodWallRegion): WoodWallRegion {
  const { side, isTop } = region;
  const bounds = region.bounds.map(f32) as [number, number, number, number];
  if (bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[0] > bounds[2] || bounds[1] > bounds[3])
    throw Error("Finite ordered wood region bounds required");
  if (side !== null && (!Number.isInteger(side) || side < 0 || side > 3))
    throw Error("Rectangle side 0..3 or no side required");
  return { side, bounds, isTop };
}

function compareFloat(a: number, b: number) {
  if (a === b) return Object.is(a, -0) === Object.is(b, -0) ? 0 : Object.is(a, -0) ? -1 : 1;
  return a < b ? -1 : 1;
}
function sortRegions<T extends WoodWallRegion>(regions: T[]): T[] {
  // Original stable comparator: minU, then minY, using f32 total_cmp.
  return regions.sort((a, b) => compareFloat(a.bounds[0], b.bounds[0]) || compareFloat(a.bounds[1], b.bounds[1]));
}

/** Horizontal branch of subtract_wall_cutouts 0x1010f01e8. These are structural
 * holes/arch openings already remapped to board space, not SDF window search
 * boxes. Preserve positive slivers here; narrow merging happens after division. */
export function subtractHorizontalWoodCutouts(
  regions: readonly WoodWallRegion[],
  cutouts: readonly PlankBounds[]
): WoodWallRegion[] {
  let result = regions.map(copyRegion);
  const cuts = cutouts.map((bounds) => copyRegion({ side: null, bounds, isTop: false }).bounds);
  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (const cut of cuts) {
      const next: WoodWallRegion[] = [];
      for (const region of result) {
        const [x0, y0, x1, y1] = region.bounds,
          [a, b, c, d] = cut;
        if (!(x0 < c && a < x1 && y0 < d && b < y1)) {
          next.push(region);
          continue;
        }
        changed = true;
        const push = (bounds: PlankBounds) => {
          if (sub(bounds[2], bounds[0]) > 0 && sub(bounds[3], bounds[1]) > 0) next.push({ ...region, bounds });
        };
        if (y0 < b) push([x0, y0, x1, Math.min(b, y1)]);
        if (d < y1) push([x0, Math.max(d, y0), x1, y1]);
        const low = Math.max(y0, b),
          high = Math.min(y1, d);
        if (low < high) {
          if (x0 < a) push([x0, low, Math.min(a, x1), high]);
          if (c < x1) push([Math.max(c, x0), low, x1, high]);
        }
      }
      result = next;
    }
    if (!changed) break;
  }
  return result;
}

/** Native plan_horizontal_wall_boards coalesces compatible vertical regions
 * repeatedly, preserving the first region's horizontal bounds and top marker. */
export function mergeHorizontalWoodRegions(regions: readonly WoodWallRegion[]): WoodWallRegion[] {
  const source = regions.map(copyRegion),
    visited = new Uint8Array(source.length),
    result: WoodWallRegion[] = [];
  for (let i = 0; i < source.length; i++) {
    if (visited[i]) continue;
    visited[i] = 1;
    const region = source[i];
    let [x0, y0, x1, y1] = region.bounds;
    let changed: boolean;
    do {
      changed = false;
      for (let j = 0; j < source.length; j++) {
        if (visited[j]) continue;
        const other = source[j],
          [a, b, c, d] = other.bounds;
        if (
          other.side === region.side &&
          other.isTop === region.isTop &&
          Math.abs(sub(x0, a)) <= f32(0.01) &&
          Math.abs(sub(x1, c)) <= f32(0.01) &&
          y0 <= add(d, 0.001) &&
          b <= add(y1, 0.001)
        ) {
          y0 = Math.min(y0, b);
          y1 = Math.max(y1, d);
          visited[j] = 1;
          changed = true;
        }
      }
    } while (changed);
    result.push({ ...region, bounds: [x0, y0, x1, y1] });
  }
  return sortRegions(result);
}

/** Original merge_narrow_planks_horizontal 0x1010f2d1c. A strip shorter than
 * .1 chooses the greatest horizontal overlap among touching same-side boards;
 * ties choose the last candidate. Keep the native 1024-merge budget observable. */
export function mergeNarrowHorizontalWoodBoards(input: readonly HorizontalWoodBoard[]): {
  boards: HorizontalWoodBoard[];
  mergeLimitReached: boolean;
} {
  const boards = input.map(copyRegion);
  let merges = 0,
    index = 0;
  while (index < boards.length) {
    const current = boards[index],
      [x0, y0, x1, y1] = current.bounds;
    let best = -1,
      lo = 0,
      hi = 0,
      overlap = 0;
    if (sub(y1, y0) < f32(0.1)) {
      for (let j = 0; j < boards.length; j++) {
        if (j === index || boards[j].side !== current.side) continue;
        const [a, b, c, d] = boards[j].bounds,
          from = Math.max(x0, a),
          to = Math.min(x1, c),
          span = sub(to, from);
        if (y0 <= add(d, 0.01) && b <= add(y1, 0.01) && to > from && (best < 0 || span >= overlap)) {
          best = j;
          lo = from;
          hi = to;
          overlap = span;
        }
      }
    }
    if (best < 0) {
      index++;
      continue;
    }
    const other = boards[best],
      [a, b, c, d] = other.bounds;
    boards.splice(Math.max(index, best), 1);
    boards.splice(Math.min(index, best), 1);
    if (a < lo) boards.push({ ...other, bounds: [a, b, lo, d] });
    if (hi < c) boards.push({ ...other, bounds: [hi, b, c, d] });
    if (x0 < lo) boards.push({ ...current, bounds: [x0, y0, lo, y1] });
    if (hi < x1) boards.push({ ...current, bounds: [hi, y0, x1, y1] });
    boards.push({ ...current, bounds: [lo, Math.min(y0, b), hi, Math.max(y1, d)] });
    if (++merges === 1024) break;
    index = Math.max(0, index - 2);
  }
  return { boards: sortRegions(boards), mergeLimitReached: merges === 1024 };
}

/** Original horizontal planner after wall-region construction and cutout
 * collection. GPU SDF cut records are intentionally not accepted here. */
export function planHorizontalWoodRegions(
  regions: readonly WoodWallRegion[],
  cutouts: readonly PlankBounds[],
  pitch: number
) {
  const merged = mergeHorizontalWoodRegions(subtractHorizontalWoodCutouts(regions, cutouts));
  const boards: HorizontalWoodBoard[] = [];
  for (const region of merged)
    for (const bounds of subdivideWoodRegion(region.bounds, pitch, true))
      boards.push({ side: region.side, isTop: region.isTop, bounds });
  return mergeNarrowHorizontalWoodBoards(boards);
}
