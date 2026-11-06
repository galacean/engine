import { Mesh } from "@galacean/engine";
import { BuildingMeshChart } from "../BuildingLayout";
import { buildingMeshData } from "../BuildingParts";
import { buildingSupportAlgorithms, type BuildingSupport } from "../BuildingAlgorithms";
/** Explicitly references the native Mesh used as the support.
 * UV0 defines the layout domain; there is no duplicate authored surface geometry. */
export const meshSurface = buildingSupportAlgorithms.register(
  "meshSurface",
  (params: { mesh: Mesh; subMesh?: number }): BuildingSupport => {
    const mesh = params.mesh;
    if (!(mesh instanceof Mesh)) throw Error("meshSurface requires an explicit Mesh reference");
    return { type: "surface", chart: new BuildingMeshChart(buildingMeshData(mesh, params.subMesh ?? 0)) };
  }
);
