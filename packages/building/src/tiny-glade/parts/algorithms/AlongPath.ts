import { pathArray, type BuildingPoint } from "../BuildingLayout";
import { buildingPlacementAlgorithms } from "../BuildingAlgorithms";
export const alongPath = buildingPlacementAlgorithms.register(
  "alongPath",
  (
    support,
    params: {
      spacing: number;
      start?: number;
      up?: BuildingPoint;
      limit?: number;
    }
  ) => {
    if (support.type !== "path") throw Error("alongPath requires Path support");
    return pathArray(support.path, params.spacing, params);
  }
);
