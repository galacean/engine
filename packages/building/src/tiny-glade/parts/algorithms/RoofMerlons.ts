import {
  buildingPlacementAlgorithms,
  type BuildingPlacementRecords,
  type BuildingSupport
} from "../BuildingAlgorithms";
import { RoofCurve } from "../../runtime/RecoveredRoofMath";
import { placeInterRoofMerlonPath, type InterRoofMerlonStyle } from "../../runtime/RecoveredInterRoofMerlons";

export const roofMerlonRecordFormat = "roof-merlon-course/v1";
export type RoofMerlonCourse = ReturnType<typeof placeInterRoofMerlonPath>;

/** Course dimensions and material are layout inputs; contact geometry lives in the Path. */
export const roofMerlons = buildingPlacementAlgorithms.register(
  "roofMerlons",
  (support: BuildingSupport, params: InterRoofMerlonStyle): BuildingPlacementRecords<RoofMerlonCourse> => {
    if (support.type !== "path" || support.path.closed) throw Error("Roof merlons require an open Path");
    const points = support.path.controlPoints;
    const elevation = points[0][1];
    if (points.some((p) => p[1] !== elevation)) throw Error("Roof merlons require a horizontal Path");
    const curve = new RoofCurve(points.map((p) => [p[0], p[2]]));
    return {
      kind: "records",
      format: roofMerlonRecordFormat,
      records: [placeInterRoofMerlonPath(curve, elevation, params)]
    };
  }
);
