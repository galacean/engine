import type { FarmSnapshot } from "./FarmState";
import { requireStableId } from "./validationUtils";

/** Ambiguous ownership requires recovery, never automatic deletion or a fresh farm. */
export class FarmItemIdentityConflictError extends Error {
  constructor(id: string) {
    super(`Duplicate farm item identity: ${id}`);
    this.name = "FarmItemIdentityConflictError";
  }
}

/** Narrow compatibility for saved rakes; unrelated invalid data still reaches validation. */
export function removeRetiredFarmItems(snapshot: FarmSnapshot): FarmSnapshot {
  if (!Array.isArray(snapshot?.items?.instances) || !Array.isArray(snapshot.recentReceipts)) return snapshot;
  const identities = new Set<string>();
  const retired = new Set<FarmSnapshot["items"]["instances"][number]>();
  let carriedRetired = false;
  for (const item of snapshot.items.instances) {
    requireStableId(item?.id, "item");
    if (identities.has(item.id)) throw new FarmItemIdentityConflictError(item.id);
    identities.add(item.id);
    if ((item.type as string) === "rake") {
      retired.add(item);
      carriedRetired ||= item.id === snapshot.items.carried?.itemId;
    }
  }
  let changed = retired.size > 0;
  const recentReceipts = snapshot.recentReceipts.map((receipt) => {
    const command = receipt?.binding?.command as { type?: string; itemType?: string } | undefined;
    if (command?.type !== "rake" && !(command?.type === "spawn-item" && command.itemType === "rake")) return receipt;
    changed = true;
    // Keep the historical receipt/command identity, but discard a binding to a removed API.
    const { binding: _binding, ...history } = receipt;
    return history;
  });
  if (!changed) return snapshot;
  return {
    ...snapshot,
    items: {
      ...snapshot.items,
      instances: snapshot.items.instances.filter((item) => !retired.has(item)),
      carried: carriedRetired ? null : snapshot.items.carried
    },
    recentReceipts
  };
}
