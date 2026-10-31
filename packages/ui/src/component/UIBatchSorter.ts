import { BoundingBox, Matrix, RenderElement, Utils } from "@galacean/engine";

/**
 * @internal
 * Visual-layering driven UI batching: solve visual correctness first, batching falls out for free.
 *
 * Think of it as stacking elements onto numbered shelves (depths):
 *   - Non-overlapping elements share shelf 0  — free to cluster regardless of material.
 *   - Overlapping + batch-compatible          — share the same shelf, still cluster.
 *   - Overlapping + batch-incompatible        — bumped one shelf higher (drawn on top).
 *
 * `depth` is a global tag, not a spatial group: distant elements at the same visual layer
 * share the same depth and get clustered together. Once depth is assigned, sort by
 * (depth, material, texture, hierarchyIndex) — visual order is locked, batching is the
 * by-product of materials clustering within each depth band.
 *
 * Overlap detection is accelerated by a 10×10 spatial grid. Grid origin and cell size
 * are derived from the union AABB of input elements (the bounds transform itself is the
 * work the loop must do anyway, so the union accumulation just piggybacks). This stays
 * correct across SS/WS canvases, any pivot, and any element distribution — no dependency
 * on canvas configuration.
 */
export class UIBatchSorter {
  // Spatial-hash is fastest when cell size ≈ typical element size (one element per cell).
  // UI elements typically span ~10% of the canvas → 10×10 grid.
  private static readonly _gridDim = 10;

  private static readonly _entries = new Array<SortEntry>();
  private static readonly _grid: GridCell[][] = [];
  // Interleaved (x, y) cell coords touched in the previous frame
  private static readonly _dirtyCells = new Array<number>();
  private static readonly _localBoundsPool = new Array<BoundingBox>();
  private static readonly _worldToLocal = new Matrix();

  /**
   * Reorders `elements` in place for optimal batching.
   * @param elements - in hierarchy order (depth-first traversal); mutated in place
   * @param canvasWorldMatrix - reduces world bounds to canvas-local for precise overlap
   */
  static sort(elements: RenderElement[], canvasWorldMatrix: Matrix): void {
    const count = elements.length;
    if (count <= 1) return;

    const gridDim = this._gridDim;
    const entries = this._entries;
    const grid = this._grid;
    const dirtyCells = this._dirtyCells;
    const localBoundsPool = this._localBoundsPool;
    const worldToLocal = this._worldToLocal;
    Matrix.invert(canvasWorldMatrix, worldToLocal);
    while (entries.length < count) entries.push(new SortEntry());

    // Allocate grid once, reuse forever (each cell must be a real [], not a sparse hole)
    if (grid.length < gridDim) {
      while (grid.length < gridDim) grid.push([]);
      for (let i = 0; i < gridDim; i++) {
        const row = grid[i];
        while (row.length < gridDim) row.push([]);
      }
    }

    // Clear only previously-used cells (no full sweep)
    for (let k = 0, n = dirtyCells.length; k < n; k += 2) {
      grid[dirtyCells[k]][dirtyCells[k + 1]].length = 0;
    }
    dirtyCells.length = 0;

    // Pass 1: transform world bounds to canvas-local + accumulate the union AABB.
    // Transform is already required to do precise overlap, so the union accumulation
    // is essentially free — just a few minmax compares riding on the existing pass
    let unionMinX = Infinity;
    let unionMinY = Infinity;
    let unionMaxX = -Infinity;
    let unionMaxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const localBounds = (localBoundsPool[i] ||= new BoundingBox());
      BoundingBox.transform(elements[i].component.bounds, worldToLocal, localBounds);
      const { min, max } = localBounds;
      if (min.x < unionMinX) unionMinX = min.x;
      if (min.y < unionMinY) unionMinY = min.y;
      if (max.x > unionMaxX) unionMaxX = max.x;
      if (max.y > unionMaxY) unionMaxY = max.y;
    }
    // Guard against a degenerate union (all elements collapsed onto a single point /
    // axis); the grid then collapses to cell 0 which is semantically correct
    const cellSizeX = Math.max(1e-6, unionMaxX - unionMinX) / gridDim;
    const cellSizeY = Math.max(1e-6, unionMaxY - unionMinY) / gridDim;
    const maxCell = gridDim - 1;

    // Pass 2: register each element into grid cells and compute its depth
    for (let i = 0; i < count; i++) {
      const element = elements[i];
      const localBounds = localBoundsPool[i];
      const materialId = element.material.instanceId;
      const textureId = element.texture ? element.texture.instanceId : 0;

      // Floor + clamp guards floating-point edge cases (a `max` exactly on the union
      // boundary would otherwise produce `gridDim`)
      const minCellX = Math.min(maxCell, Math.max(0, Math.floor((localBounds.min.x - unionMinX) / cellSizeX)));
      const maxCellX = Math.min(maxCell, Math.max(0, Math.floor((localBounds.max.x - unionMinX) / cellSizeX)));
      const minCellY = Math.min(maxCell, Math.max(0, Math.floor((localBounds.min.y - unionMinY) / cellSizeY)));
      const maxCellY = Math.min(maxCell, Math.max(0, Math.floor((localBounds.max.y - unionMinY) / cellSizeY)));

      // Find the deepest overlapping prior, and whether that shelf has any incompatible occupant
      let maxDepth = -1;
      let maxDepthIncompatible = false;
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
          const cell = grid[cellX][cellY];
          for (let j = 0, m = cell.length; j < m; j++) {
            const other = cell[j];
            if (!UIBatchSorter._rectOverlap(localBounds, other.bounds)) continue;
            const otherDepth = other.depth;
            const otherIncompatible = other.materialId !== materialId || other.textureId !== textureId;
            if (otherDepth > maxDepth) {
              maxDepth = otherDepth;
              maxDepthIncompatible = otherIncompatible;
            } else if (otherDepth === maxDepth && otherIncompatible) {
              maxDepthIncompatible = true;
            }
          }
        }
      }

      const entry = entries[i];
      entry.element = element;
      entry.hierarchyIndex = i;
      // Share the deepest shelf if compatible; bump up one if blocked by an incompatible occupant
      entry.depth = maxDepth < 0 ? 0 : maxDepth + (maxDepthIncompatible ? 1 : 0);
      entry.materialId = materialId;
      entry.textureId = textureId;
      entry.bounds = localBounds;

      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
          const cell = grid[cellX][cellY];
          if (cell.length === 0) dirtyCells.push(cellX, cellY);
          cell.push(entry);
        }
      }
    }

    Utils._quickSort(entries, 0, count, UIBatchSorter._compareEntries);
    for (let i = 0; i < count; i++) elements[i] = entries[i].element;
  }

  private static _rectOverlap(a: BoundingBox, b: BoundingBox): boolean {
    return a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y;
  }

  private static _compareEntries(a: SortEntry, b: SortEntry): number {
    return (
      a.depth - b.depth ||
      a.materialId - b.materialId ||
      a.textureId - b.textureId ||
      a.hierarchyIndex - b.hierarchyIndex
    );
  }
}

type GridCell = SortEntry[];

// materialId/textureId/bounds are flattened from RenderElement to avoid
// multi-hop property access in the hot inner loop and the sort comparator.
class SortEntry {
  element: RenderElement;
  hierarchyIndex = 0;
  depth = 0;
  materialId = 0;
  textureId = 0;
  bounds: BoundingBox;
}
