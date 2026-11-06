import { add, sub, mul, f32 } from "./RecoveredRoofMath";
import type { RecoveredBoardWallSpace } from "./RecoveredBoardWallSpace";
import type { WoodWallRegion } from "./RecoveredWoodRegions";

/** Published wall facts, not authoring lower-lift parameters. contourHeights
 * are the Y coordinates of the original foundation contour (+0x90/+0x98).
 * floorY (+0x284), wallBottom (+0x278) and the two roof limits are distinct. */
export interface WoodWallRegionHost {
  isWood: boolean;
  isRegularShape: boolean;
  foundationHeight: number;
  contourHeights: readonly number[];
  floorY: number;
  wallBottom: number;
  wallTop: number;
  gableTop: number;
  flatRoof: boolean;
}

function finite(value: number): number {
  const result = f32(value);
  if (!Number.isFinite(result)) throw Error("Finite published wood wall coordinates required");
  return result;
}

/** Original wooden_stone_foundation_surface_top_y (0x1015bdb04) and
 * stone_foundation_transition_y (0x1015bd92c). A flat roof uses the wall cap
 * minus .79 and .146; other roofs use the published gable cap. The .08 surface
 * offset is separate from the foundation transition itself. */
export function woodenStoneFoundationSurfaceTop(host: WoodWallRegionHost): number | null {
  const height = finite(host.foundationHeight);
  if (!host.isWood || !host.isRegularShape || height <= 0) return null;
  const floor = finite(host.floorY);
  let minimum = floor;
  for (let i = 0; i < host.contourHeights.length; i++) {
    const y = finite(host.contourHeights[i]);
    if (i === 0 || y < minimum || (y === 0 && minimum === 0 && Object.is(y, -0))) minimum = y;
  }
  const cap = host.flatRoof ? add(add(finite(host.wallTop), -0.79), -0.146) : finite(host.gableTop);
  const rise = Math.min(height, Math.max(0, sub(cap, minimum)));
  return add(Math.max(add(minimum, rise), floor), 0.08);
}

/** Original plan_rectangle_wallspace_regions (0x1010f3340). The board chart
 * owns horizontal spans. Gable-side identity is supplied by the roof producer,
 * never inferred from a decoration or material group. Native top fragments do
 * not use the ordinary region's .05 cutoff. */
export function initialWoodWallRegions(
  host: WoodWallRegionHost,
  chart: RecoveredBoardWallSpace,
  regionTop: number,
  splitGable: boolean,
  gableSides: readonly [number, number] | null
): WoodWallRegion[] {
  const top = finite(regionTop),
    bottom = woodenStoneFoundationSurfaceTop(host) ?? finite(host.wallBottom),
    wallTop = finite(host.wallTop),
    rectangle = chart.boardRectangle;
  if (gableSides?.some((side) => !Number.isInteger(side) || side < 0 || side > 3))
    throw Error("Gable rectangle sides 0..3 required");
  if (!rectangle)
    return top > add(bottom, 0.05) ? [{ side: null, bounds: [0, bottom, chart.boardLength, top], isTop: false }] : [];
  const knots = rectangle.cornerParameters().map((u) => mul(u, chart.boardLength));
  const result: WoodWallRegion[] = [];
  for (let side = 0; side < 4; side++) {
    const isGable = splitGable && !!gableSides?.includes(side) && top > wallTop;
    const ordinaryTop = isGable ? wallTop : top;
    if (ordinaryTop > add(bottom, 0.05))
      result.push({ side, bounds: [knots[side], bottom, knots[side + 1], ordinaryTop], isTop: false });
    if (isGable)
      result.push({ side, bounds: [knots[side], Math.max(wallTop, bottom), knots[side + 1], top], isTop: true });
  }
  return result;
}
