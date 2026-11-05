import {
  buildingPlacementAlgorithms,
  type BuildingPlacementRecords,
  type BuildingSupport
} from "../BuildingAlgorithms";
import { generateWallConnectionStitches } from "../../runtime/RecoveredWallConnectionStitches";
import type { WallStitchCandidate, WallStitchPlacement } from "../../runtime/WallConnectionTypes";

export const wallStitchRecordFormat = "wall-stitch/v1";
export type WallStitchParameters = Omit<WallStitchCandidate, "point" | "minY" | "maxY">;

/** The path owns the resolved seam geometry. Adjacent face directions, material
 * kinds and seeds are explicit layout inputs, not another house description. */
export const wallStitches = buildingPlacementAlgorithms.register(
  "wallStitches",
  (support: BuildingSupport, params: WallStitchParameters): BuildingPlacementRecords<WallStitchPlacement> => {
    if (support.type !== "path" || support.path.closed) throw Error("Wall stitches require one straight open Path");
    const points = support.path.controlPoints;
    if (points.length !== 2) throw Error("Wall stitches require one straight open Path");
    const [a, b] = points;
    if (a[0] !== b[0] || a[2] !== b[2] || b[1] <= a[1]) throw Error("Wall stitches require an upward vertical Path");
    return {
      kind: "records",
      format: wallStitchRecordFormat,
      records: generateWallConnectionStitches([{ ...params, point: [a[0], a[2]], minY: a[1], maxY: b[1] }])
    };
  }
);
