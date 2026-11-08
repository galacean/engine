import { buildingPlacementAlgorithms } from "../BuildingAlgorithms";
import { cross } from "../BuildingLayout";
import { placeProfileRoofSpire, type PlacedRoofSpire } from "../../runtime/ProfileRoofSpire";
import type { RoofSpireAsset } from "../../runtime/RoofSpireAsset";

export const roofSpireRecordFormat = "roof-spire/v1";
/** Deform a selected source mesh at the resolved mount. The roof has already
 * decided eligibility and collar shape; this algorithm neither discovers nor
 * samples a host. Source material/geometry stay owned by the asset library. */
export const placeRoofSpire = buildingPlacementAlgorithms.register(
  "placeRoofSpire",
  (support, params: { ownerId: string; radius: number; profile: number; mesh: RoofSpireAsset }) => {
    if (support.type !== "point" || !("pose" in support)) throw Error("placeRoofSpire requires a Point mount");
    if (!Number.isFinite(params.radius) || params.radius <= 0 || !Number.isFinite(params.profile))
      throw Error("Finite spire profile and positive radius required");
    const { position, tangent, normal } = support.pose;
    const part = placeProfileRoofSpire(
      params.ownerId,
      { origin: position, radius: params.radius, profile: params.profile },
      params.mesh
    );
    // Preserve the original vertical numerical path exactly. A non-identity
    // Point rotates the generated mesh and its normals about the same anchor.
    const identity = tangent.every((v, i) => v === [1, 0, 0][i]) && normal.every((v, i) => v === [0, 1, 0][i]);
    if (!identity) {
      const z = cross(tangent, normal);
      for (let i = 0; i < part.positions.length; i += 3) {
        const p = part.positions.slice(i, i + 3).map((v, k) => v - position[k]),
          n = part.normals.slice(i, i + 3);
        for (let k = 0; k < 3; k++) {
          part.positions[i + k] = position[k] + tangent[k] * p[0] + normal[k] * p[1] + z[k] * p[2];
          part.normals[i + k] = tangent[k] * n[0] + normal[k] * n[1] + z[k] * n[2];
        }
      }
    }
    const records: PlacedRoofSpire[] = [{ part, anchor: [...position] }];
    return { kind: "records" as const, format: roofSpireRecordFormat, records };
  }
);
