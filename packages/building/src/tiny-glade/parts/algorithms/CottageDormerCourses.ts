import { buildingPlacementAlgorithms, buildingSupportAlgorithms } from "../BuildingAlgorithms";
import {
  placeCottageDormerCourses,
  type CottageDormerRoofPlacement,
  type CottageDormerRoofSupport
} from "../../runtime/CottageDormerSupport";
import type { SettledRoofUnit } from "../../runtime/ConstructionSettledRoof";
export const cottageDormerRoof = buildingSupportAlgorithms.register(
  "cottageDormerRoof",
  (params: CottageDormerRoofSupport) => ({ type: "surface" as const, cottageRoof: params })
);
export const dormerRoofRecordFormat = "dormer-roof/v1";
export const cottageDormerCourses = buildingPlacementAlgorithms.register(
  "cottageDormerCourses",
  (support, params: CottageDormerRoofPlacement) => {
    if (support.type !== "surface" || !("cottageRoof" in support))
      throw Error("cottageDormerCourses requires a resolved Cottage roof surface");
    const records: SettledRoofUnit[] = placeCottageDormerCourses(support.cottageRoof, params).map((strip) => ({
      id: strip.id,
      ...(params.variationKey !== undefined
        ? { variationKey: `${params.variationKey}/${strip.role}/${strip.row}/${strip.column}` }
        : {}),
      position: strip.position,
      rotation: strip.rotation,
      scale: strip.scale,
      initial64: strip.initial64
    }));
    return { kind: "records" as const, format: dormerRoofRecordFormat, records };
  }
);
