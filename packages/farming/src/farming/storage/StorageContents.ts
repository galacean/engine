import type { FarmingStorageDefinitions, StorageContainerState, StorageContent } from "./StorageTypes";
import { CART_DISPLAY_LIMIT } from "./StorageDefaults";

/** Each stored unit belongs to exactly one stack; query and presentation totals are derived. */
export function containerContents(container: StorageContainerState): readonly StorageContent[] {
  return container.quantity
    ? [
        { cropId: container.cropId!, itemId: container.itemId!, quantity: container.quantity },
        ...(container.additionalContents ?? [])
      ]
    : [];
}
export function containerQuantity(container: StorageContainerState, itemId?: string): number {
  return containerContents(container).reduce(
    (total, entry) => total + (itemId === undefined || entry.itemId === itemId ? entry.quantity : 0),
    0
  );
}
export function withContainerContents(
  container: StorageContainerState,
  contents: readonly StorageContent[]
): StorageContainerState {
  const { additionalContents: _, ...base } = container;
  const [first, ...rest] = contents.filter((entry) => entry.quantity > 0);
  return {
    ...base,
    cropId: first?.cropId ?? null,
    itemId: first?.itemId ?? null,
    quantity: first?.quantity ?? 0,
    ...(rest.length ? { additionalContents: rest } : {})
  };
}
export function isCartStorage(rules: FarmingStorageDefinitions, typeId: string): boolean {
  return rules.containers.find((type) => type.id === typeId)?.appearance === "cart";
}
export function storageDisplayCapacity(container: StorageContainerState, rules: FarmingStorageDefinitions): number {
  if (!isCartStorage(rules, container.typeId)) return container.cropId ? rules.crops[container.cropId].capacity : 0;
  const capacities = Object.values(rules.crops)
    .filter((rule) => rule.containerTypeId === container.typeId)
    .map((rule) => rule.capacity);
  return capacities.length ? Math.min(CART_DISPLAY_LIMIT, ...capacities) : 0;
}
export function visibleContainerContents(
  container: StorageContainerState,
  rules: FarmingStorageDefinitions
): readonly StorageContent[] {
  let remaining = storageDisplayCapacity(container, rules);
  const visible: StorageContent[] = [];
  for (const entry of containerContents(container)) {
    const quantity = Math.min(entry.quantity, remaining);
    if (quantity) visible.push({ ...entry, quantity });
    remaining -= quantity;
    if (!remaining) break;
  }
  return visible;
}
