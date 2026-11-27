/** Bounded, allocation-free query index for large collections of Water bodies. */
import type { WaterBoundsXZ } from "./WaterBodyRuntime";

export interface WaterWorldSpatialIndexEntry {
  readonly bounds: WaterBoundsXZ;
}

export interface WaterWorldSpatialIndexOptions {
  readonly cellSize: number;
  readonly maximumCellsPerBody: number;
}

interface OrderedEntry<TEntry> {
  readonly entry: TEntry;
  readonly order: number;
}

function isFiniteBounds(bounds: WaterBoundsXZ): boolean {
  return (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minZ) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxZ) &&
    bounds.maxX >= bounds.minX &&
    bounds.maxZ >= bounds.minZ
  );
}

/**
 * Bodies spanning too many cells (for example an infinite Ocean) stay in one
 * ordered global list. A point query merges that list with one indexed cell,
 * preserving the WaterWorld priority/id order without allocating or sorting.
 */
export class WaterWorldSpatialIndex<TEntry extends WaterWorldSpatialIndexEntry> {
  private readonly _columns = new Map<number, Map<number, OrderedEntry<TEntry>[]>>();
  private readonly _globalEntries: OrderedEntry<TEntry>[] = [];
  private _cellCount = 0;
  private _indexedBodyCount = 0;

  constructor(private readonly _options: WaterWorldSpatialIndexOptions) {
    if (!Number.isFinite(_options.cellSize) || _options.cellSize <= 0) {
      throw new RangeError("WaterWorld spatial-index cell size must be positive and finite.");
    }
    if (!Number.isInteger(_options.maximumCellsPerBody) || _options.maximumCellsPerBody <= 0) {
      throw new RangeError("WaterWorld spatial-index maximum cells per body must be a positive integer.");
    }
  }

  rebuild(entries: readonly TEntry[]): void {
    this._columns.clear();
    this._globalEntries.length = 0;
    this._cellCount = 0;
    this._indexedBodyCount = 0;

    for (let order = 0; order < entries.length; order++) {
      const entry = entries[order];
      const bounds = entry.bounds;
      if (!isFiniteBounds(bounds)) {
        this._globalEntries.push({ entry, order });
        continue;
      }
      const minimumCellX = Math.floor(bounds.minX / this._options.cellSize);
      const maximumCellX = Math.floor(bounds.maxX / this._options.cellSize);
      const minimumCellZ = Math.floor(bounds.minZ / this._options.cellSize);
      const maximumCellZ = Math.floor(bounds.maxZ / this._options.cellSize);
      const columnCount = maximumCellX - minimumCellX + 1;
      const rowCount = maximumCellZ - minimumCellZ + 1;
      const coveredCellCount = columnCount * rowCount;
      if (!Number.isSafeInteger(coveredCellCount) || coveredCellCount > this._options.maximumCellsPerBody) {
        this._globalEntries.push({ entry, order });
        continue;
      }

      const indexedEntry = { entry, order };
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX++) {
        let column = this._columns.get(cellX);
        if (!column) {
          column = new Map();
          this._columns.set(cellX, column);
        }
        for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ++) {
          let cell = column.get(cellZ);
          if (!cell) {
            cell = [];
            column.set(cellZ, cell);
            this._cellCount++;
          }
          cell.push(indexedEntry);
        }
      }
      this._indexedBodyCount++;
    }
  }

  visitPoint(worldX: number, worldZ: number, visitor: (entry: TEntry) => boolean): number {
    const cellX = Math.floor(worldX / this._options.cellSize);
    const cellZ = Math.floor(worldZ / this._options.cellSize);
    const cellEntries = this._columns.get(cellX)?.get(cellZ) ?? EMPTY_ORDERED_ENTRIES;
    let cellIndex = 0;
    let globalIndex = 0;
    let visitedCount = 0;

    while (cellIndex < cellEntries.length || globalIndex < this._globalEntries.length) {
      const cellEntry = cellEntries[cellIndex];
      const globalEntry = this._globalEntries[globalIndex];
      let selected: OrderedEntry<TEntry>;
      if (globalEntry === undefined || (cellEntry !== undefined && cellEntry.order < globalEntry.order)) {
        selected = cellEntry;
        cellIndex++;
      } else {
        selected = globalEntry;
        globalIndex++;
      }
      visitedCount++;
      if (!visitor(selected.entry)) break;
    }
    return visitedCount;
  }
}

const EMPTY_ORDERED_ENTRIES: readonly OrderedEntry<never>[] = Object.freeze([]);
