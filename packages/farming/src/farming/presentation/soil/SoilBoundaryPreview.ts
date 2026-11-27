import { buildSoilBoundaryMasks, type SoilBoundary, type SoilCell } from "./SoilBoundary";
import type { SoilWorkPresenter } from "./SoilWorkPresenter";

interface Surface {
  readonly boundary: SoilBoundary;
  readonly work: SoilWorkPresenter;
}

interface CachedCell {
  plotId: string;
  groundId: string;
  cellX: number;
  cellZ: number;
  surface: Surface | undefined;
}

/** Connect the preview and committed beds on one clock without changing domain occupancy. */
export class SoilBoundaryPreview {
  private readonly affected = new Set<SoilWorkPresenter>();
  private readonly affectedList: SoilWorkPresenter[] = [];
  private readonly cachedCells: CachedCell[] = [];
  private cachedCellCount = 0;
  private initialized = false;
  private previewGroundId?: string;
  private previewCellX = 0;
  private previewCellZ = 0;
  private plotId?: string;
  private progress = 0;

  refresh(
    cells: readonly SoilCell[],
    surfaces: ReadonlyMap<string, Surface>,
    preview?: SoilCell,
    groundChanged = false
  ): string[] {
    const previewId = preview?.plotId;
    if (previewId !== undefined) {
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].plotId === previewId) {
          preview = undefined;
          break;
        }
      }
    }
    let unchanged =
      !groundChanged &&
      this.initialized &&
      cells.length === this.cachedCellCount &&
      (preview?.plotId ?? undefined) === this.plotId &&
      (!preview ||
        (preview.groundId === this.previewGroundId &&
          preview.cellX === this.previewCellX &&
          preview.cellZ === this.previewCellZ &&
          surfaces.get(preview.plotId) === this.previewSurface));
    if (unchanged) {
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const prev = this.cachedCells[i];
        if (
          c.plotId !== prev.plotId ||
          c.groundId !== prev.groundId ||
          c.cellX !== prev.cellX ||
          c.cellZ !== prev.cellZ ||
          surfaces.get(c.plotId) !== prev.surface
        ) {
          unchanged = false;
          break;
        }
      }
    }
    if (unchanged) return [];

    this.initialized = true;
    this.cachedCellCount = cells.length;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const surface = surfaces.get(c.plotId);
      let entry = this.cachedCells[i];
      if (!entry) {
        entry = { plotId: c.plotId, groundId: c.groundId, cellX: c.cellX, cellZ: c.cellZ, surface };
        this.cachedCells[i] = entry;
      } else {
        entry.plotId = c.plotId;
        entry.groundId = c.groundId;
        entry.cellX = c.cellX;
        entry.cellZ = c.cellZ;
        entry.surface = surface;
      }
    }
    if (this.plotId !== preview?.plotId) this.progress = 0;
    this.plotId = preview?.plotId;
    this.previewGroundId = preview?.groundId;
    this.previewCellX = preview?.cellX ?? 0;
    this.previewCellZ = preview?.cellZ ?? 0;
    this.previewSurface = preview ? surfaces.get(preview.plotId) : undefined;

    const before = buildSoilBoundaryMasks(cells);
    const after = preview ? buildSoilBoundaryMasks([...cells, preview]) : before;
    this.affected.clear();
    this.affectedList.length = 0;
    const refreshed: string[] = [];
    after.forEach((mask, id) => {
      const surface = surfaces.get(id);
      if (!surface) return;
      // The new bed reveals with its final neighbouring contour.
      // Existing beds interpolate from their old outer contour to the joined contour.
      const base = before.get(id) ?? mask;
      const changed = surface.boundary.setNeighbors(base);
      const previewChanged = surface.boundary.setPreviewNeighbors(base !== mask ? mask : undefined);
      if (base !== mask && !this.affected.has(surface.work)) {
        this.affected.add(surface.work);
        this.affectedList.push(surface.work);
      }
      if (changed || previewChanged || groundChanged) {
        surface.work.setBoundaryProgress(base !== mask ? this.progress : 0);
        surface.work.refreshSurface(groundChanged);
        refreshed.push(id);
      }
    });
    return refreshed;
  }

  private previewSurface?: Surface;

  seek(progress: number): void {
    if (progress === this.progress) return;
    this.progress = progress;
    const list = this.affectedList;
    for (let i = 0; i < list.length; i++) list[i].setBoundaryProgress(progress);
  }
}
