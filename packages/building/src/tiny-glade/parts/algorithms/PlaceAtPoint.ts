import { buildingPlacementAlgorithms } from "../BuildingAlgorithms";
export const placeAtPoint = buildingPlacementAlgorithms.register("placeAtPoint", (support) => {
  if (support.type !== "point" || !("pose" in support)) throw Error("placeAtPoint requires Point support");
  return [support.pose];
});
