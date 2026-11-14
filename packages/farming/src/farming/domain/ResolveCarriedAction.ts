import type { FarmActionInput, FarmActionOptions } from "./FarmActions";
import type { FarmSnapshot } from "./FarmState";
import type { GroundTarget } from "./FarmingGround";
import { carriedItem } from "./FarmItems";

export interface CarriedActionIntent {
  readonly input: FarmActionInput;
  readonly options: FarmActionOptions;
  readonly itemId: string;
  readonly intent: "cultivate" | "remove-crop" | "restore" | "plant" | "irrigate" | "harvest";
}

/** Capture once at click time. A failed guard must never re-resolve to a different destructive action. */
export function resolveCarriedAction(snapshot: FarmSnapshot, target: GroundTarget): CarriedActionIntent | null {
  target = {
    groundId: target.groundId,
    cellX: target.cellX,
    cellZ: target.cellZ
  };
  const carry = snapshot.items.carried;
  if (!carry) return null;
  const item = carriedItem(snapshot.items);
  const plot = snapshot.plots.find(
    (plot) => plot.groundId === target.groundId && plot.cellX === target.cellX && plot.cellZ === target.cellZ
  );
  const options = {
    expectedRevision: snapshot.revision,
    expectedCarriedItemId: carry.itemId
  };
  const resolved = (input: FarmActionInput, intent: CarriedActionIntent["intent"]): CarriedActionIntent => ({
    input,
    intent,
    options,
    itemId: carry.itemId
  });
  if (item?.type === "hoe") {
    const hoe = resolveHoeIntent(snapshot, target);
    return resolved(hoe.input, hoe.intent);
  }
  if (!plot) return null;
  if (item?.type === "seed-bag" && item.seedId)
    return resolved({ type: "plant", plotId: plot.plotId, seedId: item.seedId }, "plant");
  if (item?.type === "watering-can") return resolved({ type: "irrigate", plotId: plot.plotId }, "irrigate");
  if (item?.type === "harvest-basket" && plot.occupantId)
    return resolved({ type: "harvest", plotId: plot.plotId, cropInstanceId: plot.occupantId }, "harvest");
  return null;
}

export function resolveHoeIntent(
  snapshot: FarmSnapshot,
  target: GroundTarget
): Pick<CarriedActionIntent, "input" | "intent"> {
  target = { groundId: target.groundId, cellX: target.cellX, cellZ: target.cellZ };
  const plot = snapshot.plots.find(
    (plot) => plot.groundId === target.groundId && plot.cellX === target.cellX && plot.cellZ === target.cellZ
  );
  if (!plot) return { input: { type: "hoe", target, expectedCropInstanceId: null }, intent: "cultivate" };
  if (plot.occupantId)
    return { input: { type: "hoe", target, expectedCropInstanceId: plot.occupantId }, intent: "remove-crop" };
  return { input: { type: "delete-plot", plotId: plot.plotId }, intent: "restore" };
}
