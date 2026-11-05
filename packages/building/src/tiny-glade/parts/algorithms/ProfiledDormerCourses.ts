import { buildingPlacementAlgorithms, buildingSupportAlgorithms } from "../BuildingAlgorithms";
import {
  placeProfiledDormerCourses,
  type ProfiledDormerRoofSupport,
  type ProfiledDormerRoofPlacement
} from "../../runtime/ProfiledDormerSupport";
import { roofBytes } from "../../runtime/ConstructionRoof";
import type { SettledRoofUnit } from "../../runtime/ConstructionSettledRoof";
import { dormerRoofRecordFormat } from "./CottageDormerCourses";

export const profiledDormerRoof = buildingSupportAlgorithms.register(
  "profiledDormerRoof",
  (params: ProfiledDormerRoofSupport) => ({ type: "surface" as const, profiledRoof: params })
);
export const profiledDormerCourses = buildingPlacementAlgorithms.register(
  "profiledDormerCourses",
  (support, params: ProfiledDormerRoofPlacement) => {
    if (support.type !== "surface" || !("profiledRoof" in support))
      throw Error("profiledDormerCourses requires resolved arch sections and their host surface");
    const records: SettledRoofUnit[] = placeProfiledDormerCourses(support.profiledRoof, params).map((tile) => ({
      id: tile.id,
      ...(params.variationKey !== undefined
        ? { variationKey: `${params.variationKey}/${tile.role}/${tile.side}/${tile.row}/${tile.column}` }
        : {}),
      position: tile.position,
      rotation: tile.rotation,
      scale: tile.scale,
      initial64: roofBytes(tile.initial64_hex)
    }));
    return { kind: "records" as const, format: dormerRoofRecordFormat, records };
  }
);
