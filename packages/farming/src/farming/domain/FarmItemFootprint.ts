import { FARM_ITEM_DIMENSIONS } from "./FarmItemDimensions";
import type { FarmItemType } from "./FarmItems";

/** Conservative ground clearance for the normalized, laid-down models. */
export function farmItemGroundRadius(type: FarmItemType): number {
  return FARM_ITEM_DIMENSIONS[type].groundRadius;
}

/** Conservative world-axis bounds for the rotated ground pose. */
export function farmItemGroundBounds(type: FarmItemType, position: readonly number[], yaw = 0) {
  const radius = farmItemGroundRadius(type);
  const length = type === "hoe" ? FARM_ITEM_DIMENSIONS[type].metres / 2 + 0.03 : radius;
  const width = type === "hoe" ? FARM_ITEM_DIMENSIONS[type].groundWidth / 2 + 0.03 : radius;
  const angle = (yaw * Math.PI) / 180;
  const halfX = type === "hoe" ? Math.abs(Math.cos(angle)) * length + Math.abs(Math.sin(angle)) * width : radius;
  const halfZ = type === "hoe" ? Math.abs(Math.sin(angle)) * length + Math.abs(Math.cos(angle)) * width : radius;
  return {
    minimumX: position[0] - halfX,
    maximumX: position[0] + halfX,
    minimumZ: position[2] - halfZ,
    maximumZ: position[2] + halfZ
  };
}
