import { SurfaceProjector } from "../../runtime/SurfaceProjector.js";
import {
  buildingPlacementAlgorithms,
  type BuildingSupport,
  type BuildingPlacementRecords,
  type BuildingPlacementContext
} from "../BuildingAlgorithms";
import { placeDecorationAssembly, type DecorationAssemblyPlacement } from "../../runtime/DecorationAssemblyPlacement";
export const attachmentRecordFormat = "native-attachment/v1";
export type MountedAttachment = ReturnType<typeof placeDecorationAssembly>;
export const mountAttachment = buildingPlacementAlgorithms.register(
  "mountAttachment",
  (
    support: BuildingSupport,
    params: { placement: DecorationAssemblyPlacement },
    context: BuildingPlacementContext
  ): BuildingPlacementRecords<MountedAttachment> => {
    if (support.type !== "point" || !("attachment" in support))
      throw Error("mountAttachment requires resolved attachment mounts");
    let projector: SurfaceProjector | undefined;
    if (support.attachment.chart.kind === "mesh" && context.cache) {
      const key = "building:attachment:mesh-projectors";
      let charts = context.cache.get(key) as WeakMap<object, SurfaceProjector> | undefined;
      if (!charts) {
        charts = new WeakMap();
        context.cache.set(key, charts);
      }
      const geometry = support.attachment.chart.geometry;
      projector = charts.get(geometry);
      if (!projector) {
        projector = new SurfaceProjector(geometry);
        charts.set(geometry, projector);
      }
    }
    return {
      kind: "records",
      format: attachmentRecordFormat,
      records: [placeDecorationAssembly(support.attachment, params.placement, projector)]
    };
  }
);
