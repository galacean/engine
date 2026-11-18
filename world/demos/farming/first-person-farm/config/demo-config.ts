import { FARM_GROUND_ID } from "../scene/FarmGround.ts";
import { createDefaultFarmingLayout } from "@galacean/engine-farming/farming/storage/StorageDefaults";
import type { PlotDefinition } from "@galacean/engine-farming/farming/domain/index";

// Keep layout saves separate so shrinking the field never deletes an older farm.
export const FARM_BASE_ID = "first-person-farm-storage-v1";
export const FARM_LAYOUT_ID = "farm-storage-3x3-v1";
export const FARM_LAYOUT_VERSION = 1;
const STARTER_LAYOUT = createDefaultFarmingLayout(FARM_GROUND_ID);
export const FARM_ROWS = 3;
export const FARM_COLUMNS = 3;
export const FARM_CELL_SIZE = STARTER_LAYOUT.grid.cellSize;
export const FARM_HALF_WIDTH = (FARM_COLUMNS * FARM_CELL_SIZE) / 2;
export const FARM_HALF_DEPTH = (FARM_ROWS * FARM_CELL_SIZE) / 2;
export const FARM_SOIL_SIZE = STARTER_LAYOUT.grid.cellSize;
export const FARM_GRID = STARTER_LAYOUT.grid;
export const FARM_SOIL_Y = 0.07;
export const FARM_INTERACTION_DISTANCE = 3.5;
export const FARM_EYE_HEIGHT = 1.65;
export const FARM_MOVE_SPEED = 3;

export interface FarmPlotLayout extends PlotDefinition {
  readonly row: number;
  readonly column: number;
  readonly worldX: number;
  readonly worldZ: number;
}

export const FARM_PLOTS: readonly FarmPlotLayout[] = Object.freeze(
  STARTER_LAYOUT.plots.map((plot, index) => {
    const row = Math.floor(index / FARM_COLUMNS);
    const column = index % FARM_COLUMNS;
    return Object.freeze({
      id: `farm-main/r${row}c${column}`,
      label: plot.label,
      target: plot.target!,
      row,
      column,
      worldX: (column - (FARM_COLUMNS - 1) / 2) * FARM_CELL_SIZE,
      worldZ: ((FARM_ROWS - 1) / 2 - row) * FARM_CELL_SIZE
    });
  })
);
const FARM_PLOT_BY_ID = new Map(FARM_PLOTS.map((plot) => [plot.id, plot]));

export function resolveFarmId(search: string): string {
  const slot = new URLSearchParams(search).get("slot")?.trim();
  return slot && /^[a-z0-9_-]{1,48}$/i.test(slot) ? `${FARM_BASE_ID}/${slot}` : `${FARM_BASE_ID}/default`;
}

export function resolvePlotAtWorldPoint(worldX: number, worldZ: number): FarmPlotLayout | undefined {
  const halfWidth = (FARM_COLUMNS * FARM_CELL_SIZE) / 2;
  const halfDepth = (FARM_ROWS * FARM_CELL_SIZE) / 2;
  const localX = worldX + halfWidth;
  const localZ = halfDepth - worldZ;
  if (localX < 0 || localZ < 0 || localX >= halfWidth * 2 || localZ >= halfDepth * 2) return undefined;
  const column = Math.floor(localX / FARM_CELL_SIZE);
  const row = Math.floor(localZ / FARM_CELL_SIZE);
  return FARM_PLOTS[row * FARM_COLUMNS + column];
}

export function getPlotLayout(plotId: string): FarmPlotLayout | undefined {
  return FARM_PLOT_BY_ID.get(plotId);
}

export { FARM_CROP_SCALES } from "@galacean/engine-farming/farming/presentation/DefaultCropScales";
