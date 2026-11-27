import {
  boundsIntersect,
  inspectGround,
  type CultivationInspection,
  type FarmingGroundChange,
  type FarmingGroundView,
  type GroundTarget,
  type PlotGrid
} from "./FarmingGround";

/** Service-local, host-derived facts only. Never reuse persisted ground revisions as evidence. */
export class FarmingGroundInspectionCache {
  private view: FarmingGroundView | null = null;
  private revision = -1;
  private grid: PlotGrid | null = null;
  private readonly inspections = new Map<string, CultivationInspection>();

  observe(view: FarmingGroundView, grid: PlotGrid, change?: FarmingGroundChange): void {
    const sameGrid =
      this.grid !== null &&
      this.grid.originX === grid.originX &&
      this.grid.originZ === grid.originZ &&
      this.grid.cellSize === grid.cellSize &&
      this.grid.maximumSlopeDegrees === grid.maximumSlopeDegrees;
    if (sameGrid && this.view === view && this.revision === view.revision) return;
    // A bounded notification is sufficient evidence only for the immediately following version.
    // Missed, reordered or unbounded changes require fresh inspection of every plot.
    if (
      sameGrid &&
      this.view &&
      view.revision === this.revision + 1 &&
      change?.revision === view.revision &&
      (change.groundId || change.bounds)
    ) {
      for (const [id, inspection] of this.inspections) {
        const affected =
          (!change.groundId || change.groundId === inspection.groundId) &&
          (!change.bounds || boundsIntersect(inspection.bounds, change.bounds));
        if (affected) this.inspections.delete(id);
        else this.inspections.set(id, Object.freeze({ ...inspection, groundRevision: view.revision }));
      }
    } else this.inspections.clear();
    this.view = view;
    this.revision = view.revision;
    this.grid = { ...grid };
  }

  retainPlots(plots: readonly (GroundTarget & { readonly plotId: string })[]): void {
    const ids = new Set(plots.map((plot) => plot.plotId));
    for (const id of this.inspections.keys()) if (!ids.has(id)) this.inspections.delete(id);
  }

  inspect(view: FarmingGroundView, grid: PlotGrid, target: GroundTarget, plotId: string): CultivationInspection {
    this.observe(view, grid);
    const cached = this.inspections.get(plotId);
    if (cached && cached.groundId === target.groundId && cached.cellX === target.cellX && cached.cellZ === target.cellZ)
      return cached;
    const inspection = inspectGround(
      view,
      grid,
      { groundId: target.groundId, cellX: target.cellX, cellZ: target.cellZ },
      plotId
    );
    this.inspections.set(plotId, inspection);
    return inspection;
  }

  clear(): void {
    this.inspections.clear();
    this.view = null;
    this.revision = -1;
    this.grid = null;
  }
}
