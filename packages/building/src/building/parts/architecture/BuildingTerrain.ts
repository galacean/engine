import {
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
}
export function prepareBuildingTerrain(
  input: ConstructionTerrainGrid,
  frame: BuildingPlacementFrame = { position: [0, 0, 0], rotationY: 0 }
): { height: TerrainHeight; grounding: ConstructionGrounding } {
  validateConstructionTerrain(input);
  if (frame.position.length !== 3 || ![...frame.position, frame.rotationY].every(Number.isFinite))
    throw Error("Invalid building placement frame");
  const [px, , pz] = frame.position,
    c = Math.cos(frame.rotationY),
    s = Math.sin(frame.rotationY);
  return {
    height: (x, z) => constructionSupportHeight(input, px + c * x + s * z, pz - s * x + c * z),
    grounding: { originY: 0, renderPosition: [px, 0, pz] }
  };
}
