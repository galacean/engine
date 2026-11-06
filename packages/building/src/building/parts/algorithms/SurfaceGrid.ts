import { surfaceGrid, type BuildingSurfaceGrid } from "../BuildingLayout";
import { buildingPlacementAlgorithms } from "../BuildingAlgorithms";
export const staggeredGrid = buildingPlacementAlgorithms.register(
  "staggeredGrid",
  (support, params: BuildingSurfaceGrid) => {
    if (support.type !== "surface" || !("chart" in support)) throw Error("staggeredGrid requires Surface support");
    return surfaceGrid(support.chart, params);
  }
);
