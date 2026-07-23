const DUCK_PLACEMENT_MARGIN = 0.18;

export interface PoolFleetPlacement {
  readonly localX: number;
  readonly localZ: number;
  readonly directionLocalX: number;
  readonly directionLocalZ: number;
}

export function createPoolFleetPlacements(count: number, length: number, width: number): readonly PoolFleetPlacement[] {
  const safeCount = Math.max(0, Math.min(15, Math.floor(count)));
  if (safeCount === 0) return Object.freeze([]);
  const columnCount = Math.min(4, Math.ceil(Math.sqrt(safeCount)));
  const rowCount = Math.ceil(safeCount / columnCount);
  const usableLength = length * (1 - DUCK_PLACEMENT_MARGIN * 2);
  const usableWidth = width * (1 - DUCK_PLACEMENT_MARGIN * 2);
  const placements: PoolFleetPlacement[] = [];
  for (let index = 0; index < safeCount; index++) {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const normalizedX = columnCount === 1 ? 0.5 : column / (columnCount - 1);
    const normalizedZ = rowCount === 1 ? 0.5 : row / (rowCount - 1);
    const directionSign = (column + row) % 2 === 0 ? 1 : -1;
    placements.push(
      Object.freeze({
        localX: (normalizedX - 0.5) * usableLength,
        localZ: (normalizedZ - 0.5) * usableWidth,
        directionLocalX: directionSign,
        directionLocalZ: row % 2 === 0 ? 0.22 : -0.22
      })
    );
  }
  return Object.freeze(placements);
}
