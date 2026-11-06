import { FARM_ITEM_TYPES } from "./FarmItems";
import { commandSignature, MAX_COMMAND_SIGNATURE_LENGTH } from "./CommandReceipts";
import type { FarmCommand } from "./FarmCommands";
import { isGroundTarget } from "./FarmingGround";
const id = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9/_-]*$/i.test(value);
const label = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 80;
export function isFarmCommand(value: unknown): value is FarmCommand {
  return hasCommandShape(value) && commandSignature(value).length <= MAX_COMMAND_SIGNATURE_LENGTH;
}

function hasCommandShape(value: unknown): value is FarmCommand {
  if (!value || typeof value !== "object") return false;
  const c = value as FarmCommand;
  if (
    (c.expectedCarriedItemId !== undefined && !id(c.expectedCarriedItemId)) ||
    !id(c.commandId) ||
    !id(c.farmId) ||
    !Number.isSafeInteger(c.expectedRevision) ||
    c.expectedRevision < 0 ||
    (c.expectedGroundRevision !== undefined &&
      (!Number.isSafeInteger(c.expectedGroundRevision) || c.expectedGroundRevision < 0))
  )
    return false;
  const position = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  switch (c.type) {
    case "spawn-item":
      return (
        FARM_ITEM_TYPES.includes(c.itemType) &&
        Number.isSafeInteger(c.count) &&
        c.count > 0 &&
        c.count <= 20 &&
        id(c.groundId) &&
        position(c.position) &&
        (c.seedId === undefined || id(c.seedId))
      );
    case "pickup-item":
      return id(c.itemId) && position(c.dropPosition) && (c.dropYaw === undefined || Number.isFinite(c.dropYaw));
    case "place-item":
      return (
        id(c.expectedItemId) &&
        id(c.groundId) &&
        position(c.position) &&
        (c.yaw === undefined || Number.isFinite(c.yaw))
      );
    case "unload-basket":
      return id(c.basketId) && (c.containerId === undefined || id(c.containerId));
    case "set-container-count":
      return id(c.typeId) && Number.isSafeInteger(c.count) && c.count >= 0;
    case "withdraw-inventory":
      return (
        id(c.itemId) &&
        Number.isSafeInteger(c.quantity) &&
        c.quantity > 0 &&
        (c.containerId === undefined || id(c.containerId))
      );
    case "consume-basket":
      return id(c.basketId) && id(c.cropId) && id(c.itemId) && Number.isSafeInteger(c.quantity) && c.quantity > 0;
    case "create-plot":
      return (
        isGroundTarget(c.target) &&
        Object.keys(c.target).every((k) => ["groundId", "cellX", "cellZ", "label"].includes(k)) &&
        (c.target.label === undefined || label(c.target.label))
      );
    case "hoe":
      return (
        isGroundTarget(c.target) &&
        Object.keys(c.target).every((k) => ["groundId", "cellX", "cellZ"].includes(k)) &&
        (c.expectedCropInstanceId === undefined || c.expectedCropInstanceId === null || id(c.expectedCropInstanceId))
      );
    case "update-plot":
      return (
        id(c.plotId) &&
        Boolean(
          c.patch &&
            typeof c.patch === "object" &&
            Object.keys(c.patch).length &&
            Object.keys(c.patch).every((k) => ["label", "preparation"].includes(k)) &&
            (c.patch.label === undefined || label(c.patch.label)) &&
            (c.patch.preparation === undefined || ["leveled"].includes(c.patch.preparation))
        )
      );
    case "delete-plot":
      return id(c.plotId) && (c.cascadeCrop === undefined || typeof c.cascadeCrop === "boolean");
    case "plant":
      return id(c.plotId) && id(c.seedId);
    case "irrigate":
      return id(c.plotId);
    case "harvest":
      return id(c.plotId) && id(c.cropInstanceId);
    case "damage-crop":
      return (
        id(c.plotId) &&
        id(c.cropInstanceId) &&
        ["pest", "animal", "storm", "wind", "other"].includes(c.source) &&
        Number.isInteger(c.damagePermille) &&
        c.damagePermille > 0 &&
        (c.pestPressureDeltaUnits === undefined || Number.isInteger(c.pestPressureDeltaUnits))
      );
    case "advance-time":
      return Number.isFinite(c.targetSystemTimeMs) && c.targetSystemTimeMs >= 0;
    default:
      return false;
  }
}
