import type { FarmCommand, FarmCommandBinding } from "./FarmCommands";
export const MAX_COMMAND_SIGNATURE_LENGTH = 2048;
export const MAX_REQUEST_SIGNATURE_LENGTH = 4096;

export function freezeCommandBinding(binding: FarmCommandBinding): FarmCommandBinding {
  // Simulation snapshots reuse immutable receipts; do not clone every historical command on each tick.
  if (
    Object.isFrozen(binding) &&
    Object.isFrozen(binding.command) &&
    (!("target" in binding.command) || Object.isFrozen(binding.command.target)) &&
    (!("patch" in binding.command) || Object.isFrozen(binding.command.patch)) &&
    (!("position" in binding.command) || Object.isFrozen(binding.command.position)) &&
    (!("dropPosition" in binding.command) || Object.isFrozen(binding.command.dropPosition))
  )
    return binding;
  const command = structuredClone(binding.command);
  if ("target" in command) Object.freeze(command.target);
  if ("patch" in command) Object.freeze(command.patch);
  if ("position" in command) Object.freeze(command.position);
  if ("dropPosition" in command) Object.freeze(command.dropPosition);
  return Object.freeze({ requestSignature: binding.requestSignature, command: Object.freeze(command) });
}
/** Fixed property order; includes the full optimistic version and mutation payload. */
export function commandSignature(command: FarmCommand): string {
  const base = [command.type, command.farmId, command.expectedRevision, command.expectedGroundRevision ?? null];
  if (command.expectedCarriedItemId !== undefined) base.push(command.expectedCarriedItemId);
  switch (command.type) {
    case "spawn-item":
      return JSON.stringify([
        ...base,
        command.itemType,
        command.count,
        command.groundId,
        command.position,
        command.seedId ?? null
      ]);
    case "pickup-item":
      return JSON.stringify([
        ...base,
        command.itemId,
        command.dropPosition,
        ...(command.dropYaw === undefined ? [] : [command.dropYaw])
      ]);
    case "place-item":
      return JSON.stringify([
        ...base,
        command.expectedItemId,
        command.groundId,
        command.position,
        ...(command.yaw === undefined ? [] : [command.yaw])
      ]);
    case "unload-basket":
      return JSON.stringify([...base, command.basketId, command.containerId ?? null]);
    case "set-container-count":
      return JSON.stringify([...base, command.typeId, command.count]);
    case "withdraw-inventory":
      return JSON.stringify([
        ...base,
        command.itemId,
        command.quantity,
        ...(command.containerId === undefined ? [] : [command.containerId])
      ]);
    case "consume-basket":
      return JSON.stringify([...base, command.basketId, command.cropId, command.itemId, command.quantity]);
    case "plant":
      return JSON.stringify([...base, command.plotId, command.seedId]);
    case "irrigate":
      return JSON.stringify([...base, command.plotId]);
    case "harvest":
      return JSON.stringify([...base, command.plotId, command.cropInstanceId]);
    case "damage-crop":
      return JSON.stringify([
        ...base,
        command.plotId,
        command.cropInstanceId,
        command.source,
        command.damagePermille,
        command.pestPressureDeltaUnits ?? 0
      ]);
    case "advance-time":
      return JSON.stringify([...base, command.targetSystemTimeMs]);
    case "hoe":
      // Preserve historical unguarded signatures, but distinguish explicit empty
      // occupancy from omission. A retry may never change the intended crop.
      return JSON.stringify([
        ...base,
        command.target.groundId,
        command.target.cellX,
        command.target.cellZ,
        null,
        ...(command.expectedCropInstanceId === undefined ? [] : [command.expectedCropInstanceId])
      ]);
    case "create-plot":
      return JSON.stringify([
        ...base,
        command.target.groundId,
        command.target.cellX,
        command.target.cellZ,
        "label" in command.target ? (command.target.label ?? null) : null
      ]);
    case "update-plot":
      return JSON.stringify([...base, command.plotId, command.patch.label ?? null, command.patch.preparation ?? null]);
    case "delete-plot":
      return JSON.stringify([...base, command.plotId, command.cascadeCrop ?? false]);
  }
}
