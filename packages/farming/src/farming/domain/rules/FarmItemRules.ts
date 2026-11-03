import { FARM_ITEM_DIMENSIONS } from "../FarmItemDimensions";
import type { FarmCommand, FarmChange } from "../FarmCommands";
import type { FarmingDefinitionSet } from "../FarmDefinitions";
import type { FarmingGroundView } from "../FarmingGround";
import type { FarmSnapshot } from "../FarmState";
import {
  FARM_ITEM_SOFT_LIMIT,
  FARM_ITEM_TYPES,
  HARVEST_BASKET_CAPACITY,
  basketUsed,
  carriedItem,
  type FarmItem,
  type FarmItemType,
  type FarmItemInput,
  type FarmItemsState
} from "../FarmItems";
import { boundsTooClose, containerBounds, inspectContainerGround } from "../../storage/StoragePlacement";
import { inventoryFromStorage, storageDefinitions, storeHarvest } from "../../storage/StorageRules";
import { containerQuantity } from "../../storage/StorageContents";
import { rejectRule, updateRule, type FarmRuleResult } from "./FarmRule";
import { requireStableId } from "../validationUtils";
import { FarmSnapshotCompatibilityError } from "../FarmSnapshotCompatibilityError";

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

/** Tools may rest on cultivated soil without changing plots or crops. */
export function itemPlacement(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  view: FarmingGroundView,
  groundId: string,
  position: readonly [number, number, number],
  ignoredItemId?: string,
  itemType: FarmItemType = "seed-bag",
  yaw = 0
): FarmItem["position"] | null {
  const [x, , z] = position;
  const type = snapshot.items.instances.find((item) => item.id === ignoredItemId)?.type ?? itemType;
  const bounds = farmItemGroundBounds(type, position, yaw);
  const support = inspectContainerGround(view, groundId, bounds, snapshot.grid.maximumSlopeDegrees);
  if (!support.valid) return null;
  const rules = storageDefinitions(definitions);
  if (
    snapshot.storage.containers.some(
      (c) =>
        c.groundId === groundId &&
        boundsTooClose(bounds, containerBounds(c, rules.containers.find((t) => t.id === c.typeId)!), 0.1)
    )
  )
    return null;
  const held = carriedItem(snapshot.items)?.id;
  if (
    snapshot.items.instances.some(
      (item) =>
        item.id !== ignoredItemId &&
        item.id !== held &&
        item.groundId === groundId &&
        boundsTooClose(bounds, farmItemGroundBounds(item.type, item.position, item.yaw), 0.04)
    )
  )
    return null;
  return [x, support.supportHeight!, z];
}

/** Deterministic nearest-first finite search; no geometry or randomness is persisted. */
export function findItemPlacement(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  view: FarmingGroundView,
  groundId: string,
  origin: readonly [number, number, number],
  ignoredItemId?: string,
  radius = 4,
  itemType: FarmItemType = "seed-bag",
  yaw = 0
): FarmItem["position"] | null {
  const atOrigin = itemPlacement(snapshot, definitions, view, groundId, origin, ignoredItemId, itemType, yaw);
  if (atOrigin) return atOrigin;
  const candidates: { x: number; z: number; d: number }[] = [];
  const steps = Math.floor(radius / 0.5);
  for (let z = -steps; z <= steps; z++)
    for (let x = -steps; x <= steps; x++)
      if (x * x + z * z <= steps * steps) candidates.push({ x, z, d: x * x + z * z });
  candidates.sort((a, b) => a.d - b.d || a.z - b.z || a.x - b.x);
  for (const c of candidates) {
    const position = itemPlacement(
      snapshot,
      definitions,
      view,
      groundId,
      [origin[0] + c.x * 0.5, origin[1], origin[2] + c.z * 0.5],
      ignoredItemId,
      itemType,
      yaw
    );
    if (position) return position;
  }
  return null;
}

export function applyFarmItem(
  snapshot: FarmSnapshot,
  command: FarmItemInput,
  definitions: FarmingDefinitionSet,
  view?: FarmingGroundView
): FarmRuleResult {
  let state = snapshot.items;
  const changes: FarmChange[] = [];
  const replace = (item: FarmItem) => {
    state = {
      ...state,
      instances: state.instances.map((old) => (old.id === item.id ? item : old))
    };
  };
  const carried = carriedItem(state);
  if (command.type === "unload-basket") {
    if (carried?.id !== command.basketId || carried.type !== "harvest-basket")
      return rejectRule("ITEM_CHANGED", "请先携带指定收获篮子");
    if (command.containerId && !snapshot.storage.containers.some((c) => c.id === command.containerId))
      return rejectRule("ITEM_NOT_FOUND", "卸货设施不存在");
    if (!basketUsed(carried)) return rejectRule("ACTION_UNAVAILABLE", "篮子为空，无需卸货");
    let working = snapshot;
    const allocations: Extract<FarmChange, { kind: "basket-unloaded" }>["allocations"][number][] = [];
    for (const entry of carried.contents) {
      const stored = storeHarvest(working, definitions, entry.cropId, entry.itemId, entry.quantity, view);
      if (!stored.ok) return rejectRule(stored.code, `整篮卸货失败：${stored.message}`);
      for (const c of stored.storage.containers) {
        const old = working.storage.containers.find((old) => old.id === c.id);
        const quantity = containerQuantity(c, entry.itemId) - (old ? containerQuantity(old, entry.itemId) : 0);
        if (quantity > 0)
          allocations.push({
            ...entry,
            quantity,
            containerId: c.id,
            created: !old
          });
      }
      changes.push(...stored.changes);
      working = {
        ...working,
        storage: stored.storage,
        inventory: inventoryFromStorage(stored.storage)
      };
    }
    replace({ ...carried, contents: [] });
    changes.push(
      { kind: "basket-content-changed", itemId: carried.id },
      { kind: "basket-unloaded", basketId: carried.id, allocations }
    );
    return updateRule(snapshot, changes, {
      items: state,
      storage: working.storage
    });
  }
  if (!view) return rejectRule("GROUND_MISSING", "地形尚未加载，无法放置道具");
  if (command.type === "spawn-item") {
    if (command.itemType === "seed-bag" && !definitions.seeds.some((seed) => seed.id === command.seedId))
      return rejectRule("INVALID_COMMAND", "种子袋需要有效种子类型");
    if (command.itemType !== "seed-bag" && command.seedId !== undefined)
      return rejectRule("INVALID_COMMAND", "只有种子袋可以绑定种子");
    for (let i = 0; i < command.count; i++) {
      const instances = state.instances.filter((item) => item.type === command.itemType);
      if (instances.length >= FARM_ITEM_SOFT_LIMIT) {
        const nearest = instances
          .filter((item) => item.id !== carried?.id)
          .sort(
            (a, b) =>
              Math.hypot(a.position[0] - command.position[0], a.position[2] - command.position[2]) -
                Math.hypot(b.position[0] - command.position[0], b.position[2] - command.position[2]) ||
              a.id.localeCompare(b.id)
          )[0];
        if (!nearest) return rejectRule("ACTION_UNAVAILABLE", "同类物品已达上限，暂无兼容的空闲实例");
        if (command.itemType === "seed-bag" && nearest.seedId !== command.seedId)
          replace({ ...nearest, seedId: command.seedId });
        changes.push({ kind: "item-reused", itemId: nearest.id });
        continue;
      }
      const position = findItemPlacement(
        { ...snapshot, items: state },
        definitions,
        view,
        command.groundId,
        command.position,
        undefined,
        4,
        command.itemType
      );
      if (!position) return rejectRule("NO_ITEM_POSITION", "附近没有可放置道具的有效地面");
      if (state.sequence >= Number.MAX_SAFE_INTEGER) return rejectRule("INVALID_COMMAND", "道具序号已超出安全范围");
      const sequence = state.sequence + 1;
      const item: FarmItem = {
        id: `${snapshot.farmId}/item-${sequence}`,
        type: command.itemType,
        groundId: command.groundId,
        position,
        contents: [],
        ...(command.seedId ? { seedId: command.seedId } : {})
      };
      state = { ...state, sequence, instances: [...state.instances, item] };
      changes.push({ kind: "item-created", itemId: item.id });
    }
  } else if (command.type === "pickup-item") {
    const item = state.instances.find((item) => item.id === command.itemId);
    if (!item) return rejectRule("ITEM_NOT_FOUND", "道具或种子袋不存在");
    if (carried?.id === item.id) return rejectRule("ACTION_UNAVAILABLE", "已经携带该道具");
    // Validate the replacement before releasing the old object.
    if (carried) {
      const position = findItemPlacement(
        snapshot,
        definitions,
        view,
        carried.groundId,
        command.dropPosition,
        carried.id,
        4,
        carried.type,
        command.dropYaw ?? 0
      );
      if (!position) return rejectRule("NO_ITEM_POSITION", "没有有效落点，保持原携带物");
      replace({ ...carried, position, yaw: command.dropYaw ?? 0 });
      changes.push({ kind: "item-moved", itemId: carried.id });
    }
    state = {
      ...state,
      carried: { itemId: item.id }
    };
    changes.push({ kind: "carry-changed" });
  } else {
    const carry = state.carried;
    const id = carry && carry.itemId;
    if (id !== command.expectedItemId) return rejectRule("ITEM_CHANGED", "携带物已经变化，请重新点击");
    if (carried) {
      const position = itemPlacement(
        snapshot,
        definitions,
        view,
        command.groundId,
        command.position,
        carried.id,
        carried.type,
        command.yaw ?? 0
      );
      if (!position) return rejectRule("NO_ITEM_POSITION", "指定位置不能放置道具，仍保持携带");
      replace({ ...carried, groundId: command.groundId, position, yaw: command.yaw ?? 0 });
      changes.push({ kind: "item-moved", itemId: carried.id });
    }
    state = { ...state, carried: null };
    changes.push({ kind: "carry-changed" });
  }
  return updateRule(snapshot, changes, { items: state });
}

export function isItemCommand(command: FarmCommand): command is FarmCommand & FarmItemInput {
  return ["spawn-item", "pickup-item", "place-item", "unload-basket"].includes(command.type);
}

export function validateFarmItems(snapshot: FarmSnapshot, definitions: FarmingDefinitionSet): void {
  const state = snapshot.items;
  if (!state || !Number.isSafeInteger(state.sequence) || state.sequence < 0 || !Array.isArray(state.instances))
    throw new Error("Invalid farm item state");
  const ids = new Set<string>();
  for (const item of state.instances) {
    requireStableId(item.id, "item");
    requireStableId(item.groundId, "item ground");
    if (
      ids.has(item.id) ||
      !FARM_ITEM_TYPES.includes(item.type) ||
      !Array.isArray(item.position) ||
      item.position.length !== 3 ||
      !item.position.every(Number.isFinite) ||
      (item.yaw !== undefined && !Number.isFinite(item.yaw)) ||
      !Array.isArray(item.contents)
    )
      throw new Error("Invalid farm item identity or position");
    const sequence = Number(item.id.slice(`${snapshot.farmId}/item-`.length));
    if (
      !item.id.startsWith(`${snapshot.farmId}/item-`) ||
      !Number.isSafeInteger(sequence) ||
      sequence <= 0 ||
      sequence > state.sequence
    )
      throw new Error("Invalid farm item sequence");
    ids.add(item.id);
    if (item.type === "seed-bag") requireStableId(item.seedId!, "seed");
    if (item.type === "seed-bag" && !definitions.seeds.some((seed) => seed.id === item.seedId))
      throw new FarmSnapshotCompatibilityError("Invalid seed bag");
    if (item.type !== "seed-bag" && item.seedId !== undefined) throw new Error("Invalid seed bag");
    const crops = new Set<string>();
    for (const entry of item.contents) {
      requireStableId(entry.cropId, "basket crop");
      requireStableId(entry.itemId, "basket harvest item");
      if (!definitions.catalog.crops.some((crop) => crop.id === entry.cropId && crop.harvest.itemId === entry.itemId))
        throw new FarmSnapshotCompatibilityError("Invalid basket contents");
      if (
        item.type !== "harvest-basket" ||
        crops.has(entry.cropId) ||
        !Number.isSafeInteger(entry.quantity) ||
        entry.quantity <= 0
      )
        throw new Error("Invalid basket contents");
      crops.add(entry.cropId);
    }
    if (basketUsed(item) > HARVEST_BASKET_CAPACITY) throw new Error("Basket exceeds capacity");
  }
  if (state.carried) {
    const carry = state.carried;
    if (!state.instances.some((item) => item.id === carry.itemId)) throw new Error("Invalid carried item");
  }
}

/** Ground publications preserve identities and cargo. An unavailable search leaves a diagnostic to the host. */
export function regroundFarmItems(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  view: FarmingGroundView
): {
  items: FarmItemsState;
  changes: FarmChange[];
  blocked: readonly string[];
} {
  const held = carriedItem(snapshot.items)?.id;
  let items = snapshot.items;
  const changes: FarmChange[] = [],
    blocked: string[] = [];
  for (const item of items.instances) {
    if (item.id === held) continue;
    const position = findItemPlacement(
      { ...snapshot, items },
      definitions,
      view,
      item.groundId,
      item.position,
      item.id,
      20,
      item.type,
      item.yaw ?? 0
    );
    if (!position) {
      blocked.push(item.id);
      continue;
    }
    if (position.every((value, index) => value === item.position[index])) continue;
    items = {
      ...items,
      instances: items.instances.map((old) => (old.id === item.id ? { ...old, position } : old))
    };
    changes.push({ kind: "item-moved", itemId: item.id });
  }
  return { items, changes, blocked };
}
