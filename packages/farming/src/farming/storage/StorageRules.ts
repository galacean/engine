import type { FarmingDefinitionSet } from "../domain/FarmDefinitions";
import type { FarmSnapshot } from "../domain/FarmState";
import { FarmSnapshotCompatibilityError } from "../domain/FarmSnapshotCompatibilityError";
import type { FarmChange, FarmingErrorCode } from "../domain/FarmCommands";
import type { FarmingGroundView, GroundTarget, PlotGrid } from "../domain/FarmingGround";
import { requireNonNegativeInteger, requirePositiveInteger, requireStableId } from "../domain/validationUtils";
import { DEFAULT_STORAGE_DEFINITIONS } from "./StorageDefaults";
import {
  containerContents,
  containerQuantity,
  isCartStorage,
  storageDisplayCapacity,
  withContainerContents
} from "./StorageContents";
import {
  boundsTooClose,
  cellBounds,
  containerBounds,
  findContainerPlacement,
  ContainerPlacementError,
  type ContainerPlacementDiagnostics
} from "./StoragePlacement";
import type {
  FarmStorageState,
  FarmingStorageDefinitions,
  StorageContainerState,
  StorageLayout,
  StorageWriteInput
} from "./StorageTypes";

type MutableContainer = { -readonly [K in keyof StorageContainerState]: StorageContainerState[K] };
export type StorageResult =
  | { readonly ok: true; readonly storage: FarmStorageState; readonly changes: readonly FarmChange[] }
  | { readonly ok: false; readonly code: FarmingErrorCode; readonly message: string };
const fail = (code: FarmingErrorCode, message: string): StorageResult => ({ ok: false, code, message });
export function storageDefinitions(definitions: Pick<FarmingDefinitionSet, "storage">): FarmingStorageDefinitions {
  return definitions.storage ?? DEFAULT_STORAGE_DEFINITIONS;
}
export function validateStorageDefinitions(definitions: FarmingDefinitionSet): void {
  const rules = storageDefinitions(definitions),
    ids = new Set<string>();
  if (!Array.isArray(rules.containers) || !rules.containers.length || !rules.crops)
    throw new Error("Missing storage definitions");
  for (const type of rules.containers) {
    requireStableId(type.id, "container type");
    if (
      ids.has(type.id) ||
      !type.name?.trim() ||
      !["cart", "basket"].includes(type.appearance) ||
      !Number.isFinite(type.width) ||
      type.width <= 0 ||
      !Number.isFinite(type.depth) ||
      type.depth <= 0
    )
      throw new Error("Invalid container definition");
    ids.add(type.id);
    const footprint = DEFAULT_STORAGE_DEFINITIONS.containers.find((t) => t.appearance === type.appearance)!;
    if (type.width < footprint.width || type.depth < footprint.depth)
      throw new Error("Container footprint cannot be smaller than its rendered prop");
  }
  for (const crop of definitions.catalog.crops) {
    const rule = rules.crops[crop.id];
    if (!rule || !ids.has(rule.containerTypeId) || !rule.unit?.trim())
      throw new Error(`Missing crop storage definition: ${crop.id}`);
    requirePositiveInteger(rule.capacity, "Container capacity");
  }
}
export function validateStorageLayout(layout: StorageLayout): void {
  requireStableId(layout.groundId, "storage ground");
  if (
    ![
      layout.anchorX,
      layout.anchorZ,
      layout.searchRadius,
      layout.searchStep,
      layout.plotClearance,
      layout.containerClearance,
      layout.maximumSlopeDegrees
    ].every(Number.isFinite) ||
    layout.searchRadius < 0 ||
    layout.searchStep <= 0 ||
    layout.searchRadius / layout.searchStep > 256 ||
    layout.plotClearance < 0 ||
    layout.containerClearance < 0 ||
    layout.maximumSlopeDegrees < 0 ||
    layout.maximumSlopeDegrees >= 90 ||
    !Array.isArray(layout.protectedAreas)
  )
    throw new Error("Invalid storage layout");
  for (const area of layout.protectedAreas) {
    requireStableId(area.groundId, "protected ground");
    if (
      ![area.minimumX, area.maximumX, area.minimumZ, area.maximumZ].every(Number.isFinite) ||
      area.minimumX > area.maximumX ||
      area.minimumZ > area.maximumZ
    )
      throw new Error("Invalid protected farmland");
  }
}
export function inventoryFromStorage(storage: FarmStorageState): Readonly<Record<string, number>> {
  const inventory: Record<string, number> = {};
  for (const c of storage.containers)
    for (const entry of containerContents(c)) inventory[entry.itemId] = (inventory[entry.itemId] ?? 0) + entry.quantity;
  return Object.freeze(inventory);
}
export function freezeStorage(storage: FarmStorageState): FarmStorageState {
  if (Object.isFrozen(storage)) return storage;
  return Object.freeze({
    ...storage,
    layout: Object.freeze({
      ...storage.layout,
      protectedAreas: Object.freeze(storage.layout.protectedAreas.map((a) => Object.freeze({ ...a })))
    }),
    retainedCounts: Object.freeze({ ...storage.retainedCounts }),
    containers: Object.freeze(
      storage.containers.map((c) =>
        Object.freeze({
          ...c,
          ...(c.additionalContents
            ? { additionalContents: Object.freeze(c.additionalContents.map((entry) => Object.freeze({ ...entry }))) }
            : {}),
          position: Object.freeze([...c.position]) as unknown as StorageContainerState["position"]
        })
      )
    )
  });
}
export function createInitialStorage(
  farmId: string,
  grid: PlotGrid,
  plots: readonly GroundTarget[],
  definitions: Pick<FarmingDefinitionSet, "storage">,
  view: FarmingGroundView,
  overrides: Partial<StorageLayout> = {},
  initialCounts?: Readonly<Record<string, number>>,
  maximumPlacementAttempts?: number
): FarmStorageState {
  const groundId = overrides.groundId ?? plots[0]?.groundId ?? "default-ground";
  const fields = plots.filter((p) => p.groundId === groundId).map((p) => cellBounds(grid, p));
  const layout: StorageLayout = {
    groundId,
    anchorX: fields.length ? Math.min(...fields.map((b) => b.minimumX)) - 3 : grid.originX - 3,
    anchorZ: fields.length
      ? (Math.min(...fields.map((b) => b.minimumZ)) + Math.max(...fields.map((b) => b.maximumZ))) / 2
      : grid.originZ,
    searchRadius: 12,
    searchStep: 0.5,
    plotClearance: 2,
    containerClearance: 0.5,
    maximumSlopeDegrees: grid.maximumSlopeDegrees,
    protectedAreas: [],
    ...overrides
  };
  validateStorageLayout(layout);
  if (layout.maximumSlopeDegrees !== grid.maximumSlopeDegrees)
    throw new Error("Container and farmland must use the same slope limit");
  const rules = storageDefinitions(definitions);
  if (initialCounts && Object.keys(initialCounts).some((id) => !rules.containers.some((t) => t.id === id)))
    throw new Error("Unknown initial container type");
  let storage: FarmStorageState = {
    definitionsSignature: JSON.stringify(rules),
    layout,
    retainedCounts: {},
    sequence: 0,
    containers: []
  };
  for (const type of rules.containers) {
    const count = initialCounts?.[type.id] ?? 1;
    requireNonNegativeInteger(count, "Initial container count");
    const containers = [...storage.containers];
    for (let i = 0; i < count; i++) {
      const diagnostics: ContainerPlacementDiagnostics = { attempted: 0, reasons: {} };
      const container = createContainer(
        farmId,
        grid,
        plots,
        storage,
        rules,
        type.id,
        containers,
        view,
        diagnostics,
        maximumPlacementAttempts
      );
      if (!container) throw new ContainerPlacementError(type, diagnostics);
      containers.push(container);
      storage = { ...storage, sequence: container.order };
    }
    storage = { ...storage, retainedCounts: { ...storage.retainedCounts, [type.id]: count }, containers };
  }
  return freezeStorage(storage);
}
function createContainer(
  farmId: string,
  grid: PlotGrid,
  plots: readonly GroundTarget[],
  storage: FarmStorageState,
  rules: FarmingStorageDefinitions,
  typeId: string,
  containers: readonly StorageContainerState[],
  view?: FarmingGroundView,
  diagnostics?: ContainerPlacementDiagnostics,
  maximumPlacementAttempts?: number
): StorageContainerState | null {
  if (!view || storage.sequence >= Number.MAX_SAFE_INTEGER) return null;
  const type = rules.containers.find((t) => t.id === typeId)!;
  const placement = findContainerPlacement(
    view,
    grid,
    plots,
    storage.layout,
    type,
    rules.containers,
    containers,
    diagnostics,
    maximumPlacementAttempts
  );
  if (!placement) return null;
  const order = storage.sequence + 1;
  return { id: `${farmId}/container-${order}`, typeId, order, ...placement, cropId: null, itemId: null, quantity: 0 };
}
export function storeHarvest(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  cropId: string,
  itemId: string,
  quantity: number,
  view?: FarmingGroundView
): StorageResult {
  const rules = storageDefinitions(definitions),
    rule = rules.crops[cropId];
  if (!rule) return fail("INVALID_DEFINITION", "缺少作物仓储配置");
  if (!Number.isSafeInteger((snapshot.inventory[itemId] ?? 0) + quantity))
    return fail("INVALID_COMMAND", "库存数量超出安全整数范围");
  let storage = snapshot.storage,
    remaining = quantity;
  const containers: MutableContainer[] = storage.containers.map((c) => ({ ...c }));
  if (isCartStorage(rules, rule.containerTypeId)) {
    const carts = containers.filter((c) => c.typeId === rule.containerTypeId);
    if (!carts.length) return fail("NO_STORAGE_SPACE", "请先手动添加马车，再卸货");
    const add = (cart: MutableContainer, amount: number): boolean => {
      if (!Number.isSafeInteger(containerQuantity(cart) + amount)) return false;
      const contents = containerContents(cart).map((entry) => ({ ...entry }));
      const entry = contents.find((entry) => entry.cropId === cropId);
      if (entry) entry.quantity += amount;
      else contents.push({ cropId, itemId, quantity: amount });
      const next = withContainerContents(cart, contents);
      delete cart.additionalContents;
      Object.assign(cart, next);
      return true;
    };
    for (const cart of carts) {
      const amount = Math.min(remaining, Math.max(0, storageDisplayCapacity(cart, rules) - containerQuantity(cart)));
      if (amount && !add(cart, amount)) return fail("INVALID_COMMAND", "马车库存数量超出安全整数范围");
      remaining -= amount;
    }
    if (remaining && !add(carts[0], remaining)) return fail("INVALID_COMMAND", "马车库存数量超出安全整数范围");
    return changed(snapshot.storage, { ...storage, containers });
  }
  for (const sameCrop of [true, false])
    for (const c of containers) {
      if (!remaining) break;
      if (c.typeId !== rule.containerTypeId || (sameCrop ? c.cropId !== cropId : c.cropId !== null)) continue;
      const amount = Math.min(remaining, rule.capacity - c.quantity);
      if (!amount) continue;
      c.cropId = cropId;
      c.itemId = itemId;
      c.quantity += amount;
      remaining -= amount;
    }
  while (remaining > 0) {
    const c = createContainer(
      snapshot.farmId,
      snapshot.grid,
      snapshot.plots,
      storage,
      rules,
      rule.containerTypeId,
      containers,
      view
    );
    if (!c) return fail("NO_STORAGE_SPACE", "仓储空间不足，作物仍留在农田");
    const amount = Math.min(remaining, rule.capacity);
    containers.push({ ...c, cropId, itemId, quantity: amount });
    storage = { ...storage, sequence: c.order };
    remaining -= amount;
  }
  return changed(snapshot.storage, { ...storage, containers });
}
export function applyStorageWrite(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  input: StorageWriteInput,
  view?: FarmingGroundView
): StorageResult {
  const rules = storageDefinitions(definitions);
  let storage = snapshot.storage;
  let containers: MutableContainer[] = storage.containers.map((c) => ({ ...c }));
  if (input.type === "withdraw-inventory") {
    if (input.containerId !== undefined) {
      const selected = containers.find((c) => c.id === input.containerId);
      if (!selected || !containerContents(selected).some((entry) => entry.itemId === input.itemId))
        return fail("ITEM_CHANGED", "指定容器或作物已改变");
      if (containerQuantity(selected, input.itemId) < input.quantity)
        return fail("INSUFFICIENT_INVENTORY", "指定容器内作物数量不足");
    }
    if ((snapshot.inventory[input.itemId] ?? 0) < input.quantity)
      return fail("INSUFFICIENT_INVENTORY", "仓库内作物数量不足");
    let remaining = input.quantity;
    for (let i = containers.length - 1; i >= 0 && remaining; i--) {
      const c = containers[i];
      if (input.containerId !== undefined && c.id !== input.containerId) continue;
      const contents = containerContents(c).map((entry) => ({ ...entry }));
      for (const entry of contents) {
        if (entry.itemId !== input.itemId) continue;
        const amount = Math.min(remaining, entry.quantity);
        entry.quantity -= amount;
        remaining -= amount;
      }
      containers[i] = withContainerContents(c, contents);
    }
    for (const type of rules.containers) {
      let excess = containers.filter((c) => c.typeId === type.id).length - storage.retainedCounts[type.id];
      const removed = new Set<string>();
      for (let i = containers.length - 1; i >= 0 && excess > 0; i--)
        if (containers[i].typeId === type.id && !containers[i].quantity) {
          removed.add(containers[i].id);
          excess--;
        }
      containers = containers.filter((c) => !removed.has(c.id));
    }
  } else {
    if (!rules.containers.some((t) => t.id === input.typeId)) return fail("INVALID_COMMAND", "未知容器类型");
    const selected = containers.filter((c) => c.typeId === input.typeId);
    if (input.count < selected.length) {
      const groups = new Map<string, { itemId: string; quantity: number }>();
      for (const c of selected)
        for (const entry of containerContents(c)) {
          const group = groups.get(entry.cropId) ?? { itemId: entry.itemId, quantity: 0 };
          group.quantity += entry.quantity;
          groups.set(entry.cropId, group);
        }
      const cart = isCartStorage(rules, input.typeId);
      const required = cart
        ? groups.size
          ? 1
          : 0
        : [...groups].reduce((n, [id, group]) => n + Math.ceil(group.quantity / rules.crops[id].capacity), 0);
      if (required > input.count)
        return fail("CONTAINER_CAPACITY_INSUFFICIENT", `当前库存至少需要 ${required} 个该类型容器`);
      const kept = selected.slice(0, input.count).map((c) => withContainerContents(c, []));
      if (cart && groups.size) {
        const contents = [...groups].map(([cropId, entry]) => ({ cropId, ...entry }));
        if (!Number.isSafeInteger(contents.reduce((sum, entry) => sum + entry.quantity, 0)))
          return fail("INVALID_COMMAND", "马车库存数量超出安全整数范围");
        kept[0] = withContainerContents(kept[0], contents);
      }
      let index = 0;
      if (!cart)
        for (const [cropId, group] of groups)
          for (let remaining = group.quantity; remaining > 0; index++) {
            const quantity = Math.min(remaining, rules.crops[cropId].capacity);
            Object.assign(kept[index], { cropId, itemId: group.itemId, quantity });
            remaining -= quantity;
          }
      containers = [...containers.filter((c) => c.typeId !== input.typeId), ...kept].sort((a, b) => a.order - b.order);
    } else {
      for (let i = selected.length; i < input.count; i++) {
        const c = createContainer(
          snapshot.farmId,
          snapshot.grid,
          snapshot.plots,
          storage,
          rules,
          input.typeId,
          containers,
          view
        );
        if (!c) return fail("NO_STORAGE_SPACE", "附近没有足够的合法位置放置容器");
        containers.push({ ...c });
        storage = { ...storage, sequence: c.order };
      }
    }
    storage = { ...storage, retainedCounts: { ...storage.retainedCounts, [input.typeId]: input.count } };
  }
  return changed(snapshot.storage, { ...storage, containers });
}
function changed(previous: FarmStorageState, next: FarmStorageState): StorageResult {
  const storage = freezeStorage(next),
    changes: FarmChange[] = [];
  const before = new Map(previous.containers.map((c) => [c.id, c]));
  for (const c of storage.containers) {
    const old = before.get(c.id);
    if (!old) changes.push({ kind: "container-created", containerId: c.id });
    if (!old || JSON.stringify(containerContents(old)) !== JSON.stringify(containerContents(c)))
      changes.push({ kind: "container-content-changed", containerId: c.id });
    before.delete(c.id);
  }
  for (const id of before.keys()) changes.push({ kind: "container-removed", containerId: id });
  if (Object.keys(storage.retainedCounts).some((id) => storage.retainedCounts[id] !== previous.retainedCounts[id]))
    changes.push({ kind: "container-retention-changed" });
  const a = inventoryFromStorage(previous),
    b = inventoryFromStorage(storage);
  for (const itemId of new Set([...Object.keys(a), ...Object.keys(b)]))
    if ((a[itemId] ?? 0) !== (b[itemId] ?? 0))
      changes.push({ kind: "inventory-changed", itemId, previousQuantity: a[itemId] ?? 0, quantity: b[itemId] ?? 0 });
  return { ok: true, storage, changes };
}
export function storageBlocksCultivation(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  target: GroundTarget
): boolean {
  const rules = storageDefinitions(definitions),
    bounds = cellBounds(snapshot.grid, target);
  return snapshot.storage.containers.some(
    (c) =>
      c.groundId === target.groundId &&
      boundsTooClose(
        bounds,
        containerBounds(c, rules.containers.find((t) => t.id === c.typeId)!),
        snapshot.storage.layout.plotClearance
      )
  );
}
export function validateStorage(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  validatePlacement = true
): void {
  const s = snapshot.storage,
    rules = storageDefinitions(definitions);
  if (typeof s?.definitionsSignature === "string" && s.definitionsSignature !== JSON.stringify(rules))
    throw new FarmSnapshotCompatibilityError("Storage definitions do not match snapshot");
  if (!s || typeof s.definitionsSignature !== "string" || !Array.isArray(s.containers))
    throw new Error("Storage definitions do not match snapshot");
  validateStorageLayout(s.layout);
  if (s.layout.maximumSlopeDegrees !== snapshot.grid.maximumSlopeDegrees)
    throw new Error("Container and farmland must use the same slope limit");
  requireNonNegativeInteger(s.sequence, "Container sequence");
  if (!s.retainedCounts || Object.keys(s.retainedCounts).length !== rules.containers.length)
    throw new Error("Invalid retained container counts");
  const ids = new Set<string>();
  let previousOrder = 0;
  for (const c of s.containers) {
    requireStableId(c.id, "container");
    requireStableId(c.groundId, "container ground");
    requirePositiveInteger(c.order, "Container order");
    requireNonNegativeInteger(c.quantity, "Container quantity");
    const type = rules.containers.find((t) => t.id === c.typeId);
    if (
      !type ||
      ids.has(c.id) ||
      c.order <= previousOrder ||
      c.order > s.sequence ||
      !Array.isArray(c.position) ||
      c.position.length !== 3 ||
      !c.position.every(Number.isFinite) ||
      (c.yaw !== 0 && c.yaw !== 90)
    )
      throw new Error("Invalid container identity or position");
    ids.add(c.id);
    previousOrder = c.order;
    if (!c.quantity) {
      if (c.cropId !== null || c.itemId !== null || c.additionalContents !== undefined)
        throw new Error("Empty container must be unbound");
    } else {
      const cart = type.appearance === "cart";
      if (
        c.additionalContents !== undefined &&
        (!cart || !Array.isArray(c.additionalContents) || !c.additionalContents.length)
      )
        throw new Error("Only carts can contain additional crops");
      const crops = new Set<string>();
      for (const entry of containerContents(c)) {
        requirePositiveInteger(entry.quantity, "Container cargo quantity");
        requireStableId(entry.cropId, "container crop");
        requireStableId(entry.itemId, "container harvest item");
        const crop = definitions.catalog.crops.find((crop) => crop.id === entry.cropId),
          rule = crop && rules.crops[crop.id];
        if (!crop || !rule || crop.harvest.itemId !== entry.itemId || rule.containerTypeId !== c.typeId)
          throw new FarmSnapshotCompatibilityError("Invalid container cargo");
        if (crops.has(entry.cropId) || (!cart && entry.quantity > rule.capacity))
          throw new Error("Invalid container cargo");
        crops.add(entry.cropId);
      }
      if (!Number.isSafeInteger(containerQuantity(c))) throw new Error("Container total exceeds safe integer range");
    }
    const bounds = containerBounds(c, type);
    if (
      validatePlacement &&
      (snapshot.plots.some(
        (p) => p.groundId === c.groundId && boundsTooClose(bounds, cellBounds(snapshot.grid, p), s.layout.plotClearance)
      ) ||
        s.layout.protectedAreas.some(
          (p) => p.groundId === c.groundId && boundsTooClose(bounds, p, s.layout.plotClearance)
        ) ||
        s.containers.some(
          (other) =>
            other.order < c.order &&
            other.groundId === c.groundId &&
            boundsTooClose(
              bounds,
              containerBounds(other, rules.containers.find((t) => t.id === other.typeId)!),
              s.layout.containerClearance
            )
        ))
    )
      throw new Error("Container overlaps protected land or another container");
  }
  for (const type of rules.containers) {
    requireNonNegativeInteger(s.retainedCounts[type.id], "Retained container count");
    if (s.containers.filter((c) => c.typeId === type.id).length < s.retainedCounts[type.id])
      throw new Error("Missing retained containers");
  }
  const inventory = inventoryFromStorage(s);
  if (
    Object.keys(snapshot.inventory).length !== Object.keys(inventory).length ||
    Object.keys(inventory).some(
      (id) => !Number.isSafeInteger(inventory[id]) || snapshot.inventory[id] !== inventory[id]
    )
  )
    throw new Error("Inventory must equal container totals");
}
