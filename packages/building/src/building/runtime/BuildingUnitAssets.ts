import type { RoofSpireAsset } from "./RoofSpireAsset";
import type { GothicCollisionBounds } from "./GothicBlueprint";
import type { GothicGeometryAssets, ConstructionPositionMesh } from "./ConstructionGeometryAssets";
/** Numerical geometry inputs shared by building algorithms, independent of author models. */
export interface BuildingUnitAssets {
  decorations?: import("./ConstructionDecorationMeshes").ConstructionDecorationMeshes;
  /** Building prefabs by type and rank, such as "window-cottage/2". */
  prefabs?: Record<string, import("../resources/BuildingAssembly").CompiledBuildingPrefab>;
  decorationCollisions?: import("./ConstructionDecorationCollisions").ConstructionDecorationCollisions;
  stoneGeometry?: import("./ConstructionGeometryAssets").ConstructionStoneGeometry;
  woodPillar?: ConstructionPositionMesh;
  roofSpire?: RoofSpireAsset;
  gothic: Record<1 | 2 | 3, { collisionBounds: GothicCollisionBounds; geometry?: GothicGeometryAssets }>;
}
