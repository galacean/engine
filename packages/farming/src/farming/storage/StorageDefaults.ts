import type { FarmingStorageDefinitions } from "./StorageTypes";
import type { PlotDefinition } from "../domain/FarmDefinitions";
import { DEFAULT_PLOT_GRID, plotIdForTarget, type PlotGrid } from "../domain/FarmingGround";

export const CART_DISPLAY_LIMIT = 60;

export const DEFAULT_STORAGE_DEFINITIONS: FarmingStorageDefinitions = Object.freeze({
  containers: Object.freeze([
    Object.freeze({ id: "cart", name: "推车", appearance: "cart" as const, width: 1.43, depth: 2.282 }),
    Object.freeze({ id: "basket", name: "篮子", appearance: "basket" as const, width: 0.567, depth: 0.567 })
  ]),
  crops: Object.freeze(
    Object.fromEntries(
      [
        ["wheat", "cart", CART_DISPLAY_LIMIT, "束"],
        ["rice", "cart", CART_DISPLAY_LIMIT, "束"],
        ["tomato", "basket", 20, "个"],
        ["potato", "basket", 20, "个"],
        ["carrot", "basket", 16, "根"],
        ["radish", "basket", 16, "根"],
        ["beetroot", "basket", 16, "个"],
        ["grapevine", "basket", 12, "串"],
        ["cabbage", "basket", 4, "颗"],
        ["melon", "basket", 2, "个"],
        ["pumpkin", "basket", 2, "个"],
        ["watermelon", "basket", 2, "个"],
        ["canola", "basket", 20, "份"],
        ["sunflower", "basket", 20, "份"]
      ].map(([cropId, containerTypeId, capacity, unit]) => [
        cropId,
        Object.freeze({
          containerTypeId: String(containerTypeId),
          capacity: Number(capacity),
          unit: String(unit)
        })
      ])
    )
  )
});

/** A reusable starter layout. Hosts own the ground identity and world-space anchor. */
export function createDefaultFarmingLayout(
  groundId: string,
  centerX = 0,
  centerZ = 0,
  plotCount = 9
): {
  readonly grid: PlotGrid;
  readonly plots: readonly PlotDefinition[];
} {
  if (!Number.isSafeInteger(plotCount) || plotCount < 1) throw new Error("Invalid starter plot count");
  const columns = Math.ceil(Math.sqrt(plotCount)),
    rows = Math.ceil(plotCount / columns);
  const grid = Object.freeze({
    ...DEFAULT_PLOT_GRID,
    originX: centerX - (columns * DEFAULT_PLOT_GRID.cellSize) / 2,
    originZ: centerZ - (rows * DEFAULT_PLOT_GRID.cellSize) / 2
  });
  const plots = Array.from({ length: plotCount }, (_, index) => {
    const target = { groundId, cellX: index % columns, cellZ: rows - 1 - Math.floor(index / columns) };
    return Object.freeze({
      id: plotIdForTarget(target),
      label: `${String.fromCharCode(65 + Math.floor(index / columns))}${(index % columns) + 1}`,
      target: Object.freeze(target)
    });
  });
  return { grid, plots: Object.freeze(plots) };
}
