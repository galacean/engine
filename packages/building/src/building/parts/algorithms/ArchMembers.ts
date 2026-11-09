import {
  buildingPlacementAlgorithms,
  type BuildingPlacementRecords,
  type BuildingSupport
} from "../BuildingAlgorithms";
import { placeConstructionStoneArch, type StoneArchPlacementParameters } from "../../runtime/ConstructionStoneArch";
import { placeConstructionWoodArch, type WoodArchPlacementParameters } from "../../runtime/ConstructionWoodArch";

export const stoneArchRecordFormat = "stone-arch/v1";
export const woodArchRecordFormat = "wood-arch/v1";
export type StoneArchMembers = ReturnType<typeof placeConstructionStoneArch>;
export type WoodArchMembers = ReturnType<typeof placeConstructionWoodArch>;
function basePath(support: BuildingSupport, heights: readonly number[]) {
  if (support.type !== "path" || support.path.closed) throw Error("Arch members require an open base Path");
  const points = support.path.controlPoints;
  if (heights.length !== points.length || heights.some((height) => !Number.isFinite(height) || height < 0))
    throw Error("Arch rises must match the base Path samples");
  return points;
}
export const stoneArchCourses = buildingPlacementAlgorithms.register(
  "stoneArchCourses",
  (support: BuildingSupport, params: StoneArchPlacementParameters): BuildingPlacementRecords<StoneArchMembers> => ({
    kind: "records",
    format: stoneArchRecordFormat,
    records: [placeConstructionStoneArch(basePath(support, params.heights), params)]
  })
);
export const woodArchMembers = buildingPlacementAlgorithms.register(
  "woodArchMembers",
  (support: BuildingSupport, params: WoodArchPlacementParameters): BuildingPlacementRecords<WoodArchMembers> => ({
    kind: "records",
    format: woodArchRecordFormat,
    records: [placeConstructionWoodArch(basePath(support, params.heights), params)]
  })
);
