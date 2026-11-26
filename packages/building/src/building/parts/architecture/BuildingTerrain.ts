import {
  buildingTerrainAxes,
  validateConstructionTerrain,
  constructionSupportHeight,
  type ConstructionTerrainGrid,
  type ConstructionGrounding
} from "../../runtime/TerrainField";
import type { TerrainHeight } from "../../runtime/PublishedWallProfile";

/** A geometric frame for a compiled group, independent of architectural style. */
export interface BuildingPlacementFrame {
  position: [number, number, number];
  rotationY: number;
  scale?: [number, number, number];
}
/** Ground-conforming buildings use world Y zero as their vertical origin. */
export function localBuildingTerrainHeight(worldHeight: TerrainHeight, frame: BuildingPlacementFrame): TerrainHeight {
  const [px, , pz] = frame.position;
  const [xx, xz, zx, zz] = buildingTerrainAxes(frame);
  const sy = frame.scale?.[1] ?? 1;
  return (x, z) => worldHeight(px + xx * x + xz * z, pz + zx * x + zz * z) / sy;
}
export function prepareBuildingTerrain(
  input: ConstructionTerrainGrid,
  frame: BuildingPlacementFrame = { position: [0, 0, 0], rotationY: 0 }
): { height: TerrainHeight; grounding: ConstructionGrounding } {
  validateConstructionTerrain(input);
  if (
    frame.position.length !== 3 ||
    ![...frame.position, frame.rotationY].every(Number.isFinite) ||
    (frame.scale && (frame.scale.length !== 3 || !frame.scale.every((s) => Number.isFinite(s) && s > 0)))
  )
    throw Error("Invalid building placement frame");
  const [px, , pz] = frame.position;
  const sy = frame.scale?.[1] ?? 1;
  return {
    height: localBuildingTerrainHeight((wx, wz) => constructionSupportHeight(input, wx, wz), frame),
    grounding: { originY: 0, renderPosition: [px, 0, pz], ...(sy === 1 ? {} : { verticalScale: sy }) }
  };
}
