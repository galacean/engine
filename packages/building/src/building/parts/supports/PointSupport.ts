import { buildingPose, type BuildingPoint } from "../BuildingLayout";
import { buildingSupportAlgorithms, type BuildingSupport } from "../BuildingAlgorithms";
export const pointSupport = buildingSupportAlgorithms.register(
  "point",
  (params: { position?: BuildingPoint; tangent?: BuildingPoint; normal?: BuildingPoint }): BuildingSupport => ({
    type: "point",
    pose: buildingPose(params.position ?? [0, 0, 0], params.tangent ?? [1, 0, 0], params.normal ?? [0, 1, 0])
  })
);
