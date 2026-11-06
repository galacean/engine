import { BuildingPath, type BuildingPoint } from "../BuildingLayout";
import { buildingSupportAlgorithms, type BuildingSupport } from "../BuildingAlgorithms";
export const pathSupport = buildingSupportAlgorithms.register(
  "path",
  (params: { points: BuildingPoint[]; closed?: boolean }): BuildingSupport => ({
    type: "path",
    path: new BuildingPath(params.points, params.closed)
  })
);
