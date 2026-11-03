import type { FarmItemType } from "./FarmItems";

/** Produce base height before the basket contents presentation scale. */
export const FARM_BASKET_CONTENT_BASE_Y = 0.19;

/** Centre of one visible produce mesh, before the basket contents presentation scale. */
export function farmBasketProduceSlot(index: number): readonly [number, number, number] {
  return [
    ((index % 5) - 2) * 0.055,
    FARM_BASKET_CONTENT_BASE_Y + (index % 3) * 0.006,
    (Math.floor(index / 5) - 1.5) * 0.055
  ];
}

/** Physical metres, shared by world and held instances. Never a camera-dependent scale. */
export const FARM_ITEM_DIMENSIONS = {
  hoe: { node: "HoeTool_LOD0", axis: "z", metres: 1.55, groundWidth: 0.242, groundRadius: 0.82 },
  rake: { node: "RakeTool_LOD0", axis: "z", metres: 1.65, groundWidth: 0.43, groundRadius: 0.88 },
  "watering-can": { node: "WateringCan_LOD0", axis: "y", metres: 0.35, groundRadius: 0.36 },
  "harvest-basket": { node: "Basket_LOD0", axis: "x", metres: 0.32, groundRadius: 0.22 },
  "seed-bag": { node: "SeedSack", axis: "x", metres: 0.45, groundRadius: 0.28 }
} as const satisfies Record<
  FarmItemType | "rake",
  { node: string; axis: "x" | "y" | "z"; metres: number; groundWidth?: number; groundRadius: number }
>;

/** Keep produce aligned with the calibrated portable basket without changing its authored layout. */
export const FARM_BASKET_CONTENT_SCALE = FARM_ITEM_DIMENSIONS["harvest-basket"].metres / 0.48;
