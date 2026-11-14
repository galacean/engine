import { clipSurfaceTriangles, type SurfacePoint } from "@galacean/engine-terrain/geometry/SurfaceTriangles";
import { Entity } from "@galacean/engine";
import { plotBounds, type PlotGrid, type FarmingGroundProvider } from "../../domain/FarmingGround";
import type { PlotState } from "../../domain/FarmState";
import { SoilBoundary } from "./SoilBoundary";
import { SoilVisualProvider, type SoilVisualTarget } from "./SoilVisualProvider";
import { SoilWorkPresenter } from "./SoilWorkPresenter";
import { DEFAULT_SOIL_VISUAL_CONFIG } from "./SoilVisualConfig";

/** Plot identity stays local; its exact host-clipped surface joins a spatial render chunk. */
export function createFarmingPlotSurface(
  parent: Entity,
  grid: PlotGrid,
  ground: FarmingGroundProvider,
  plot: PlotState,
  visuals: SoilVisualProvider,
  moisture: number
) {
  if (!ground.capture().surfaceTriangles) throw new Error("Farming soil rendering requires host surface triangles");
  const root = parent.createChild(plot.plotId),
    soil = root.createChild("soil");
  const bounds = plotBounds(grid, plot),
    x = (bounds.minimumX + bounds.maximumX) / 2,
    z = (bounds.minimumZ + bounds.maximumZ) / 2;
  const sample = ground.capture().sample(plot.groundId, x, z);
  root.transform.setWorldPosition(x, sample?.position[1] ?? 0, z);
  let renderer: SoilVisualTarget | undefined;
  try {
    renderer = visuals.createPlot(parent, soil, grid, plot, moisture);
    const boundary = new SoilBoundary(grid.cellSize, x, z),
      cropAnchor = root.createChild("crop-anchor");
    cropAnchor.transform.setPosition(0, DEFAULT_SOIL_VISUAL_CONFIG.soil.edge.surfaceOffset, 0);
    const work = new SoilWorkPresenter(renderer, visuals, moisture, {
      footprint: { size: grid.cellSize, square: true },
      triangles: () => {
        const view = ground.capture();
        const local = (p: SurfacePoint): SurfacePoint => [
          p[0] - x,
          p[1] - root.transform.worldPosition.y + DEFAULT_SOIL_VISUAL_CONFIG.soil.edge.surfaceOffset,
          p[2] - z
        ];
        return clipSurfaceTriangles(view.surfaceTriangles!(plot.groundId, bounds), bounds).map(
          ([a, b, c]) => [local(a), local(b), local(c)] as const
        );
      },
      coverage: (x, z) => boundary.coverage(x, z),
      previewCoverage: (x, z) => boundary.previewCoverage(x, z),
      projectHeight: (lx, lz) =>
        (ground.capture().sample(plot.groundId, x + lx, z + lz)?.position[1] ?? root.transform.worldPosition.y) -
        root.transform.worldPosition.y +
        DEFAULT_SOIL_VISUAL_CONFIG.soil.edge.surfaceOffset
    });
    work.setPreparation(plot.soil.preparation);
    return { root, renderer, cropAnchor, work, boundary };
  } catch (error) {
    if (renderer) visuals.release(renderer);
    root.destroy();
    throw error;
  }
}
