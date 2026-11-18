import { buildSoilBoundaryMasks, type SoilBoundary, type SoilCell } from "./SoilBoundary";
import type { SoilWorkPresenter } from "./SoilWorkPresenter";

interface Surface {
  readonly boundary: SoilBoundary;
  readonly work: SoilWorkPresenter;
}

/** Connect the preview and committed beds on one clock without changing domain occupancy. */
export class SoilBoundaryPreview {
  private readonly affected = new Set<SoilWorkPresenter>();
  private plotId?: string;
  private progress = 0;

  refresh(
    cells: readonly SoilCell[],
    surfaces: ReadonlyMap<string, Surface>,
    preview?: SoilCell,
    groundChanged = false
  ): string[] {
    const previewId = preview?.plotId;
    if (cells.some((cell) => cell.plotId === previewId)) preview = undefined;
    if (this.plotId !== preview?.plotId) this.progress = 0;
    this.plotId = preview?.plotId;
    const before = buildSoilBoundaryMasks(cells);
    const after = preview ? buildSoilBoundaryMasks([...cells, preview]) : before;
    this.affected.clear();
    const refreshed: string[] = [];
    for (const [id, mask] of after) {
      const surface = surfaces.get(id);
      if (!surface) continue;
      // The new bed reveals with its final neighbouring contour.
      // Existing beds interpolate from their old outer contour to the joined contour.
      const base = before.get(id) ?? mask;
      const changed = surface.boundary.setNeighbors(base);
      const previewChanged = surface.boundary.setPreviewNeighbors(base !== mask ? mask : undefined);
      if (base !== mask) this.affected.add(surface.work);
      if (changed || previewChanged || groundChanged) {
        surface.work.setBoundaryProgress(base !== mask ? this.progress : 0);
        surface.work.refreshSurface(groundChanged);
        refreshed.push(id);
      }
    }
    return refreshed;
  }

  seek(progress: number): void {
    if (progress === this.progress) return;
    this.progress = progress;
    for (const work of this.affected) work.setBoundaryProgress(progress);
  }
}
