import type { FarmingDefinitionSet } from "../domain/FarmDefinitions";
import type { FarmingGroundView } from "../domain/FarmingGround";
import type { FarmSnapshot } from "../domain/FarmState";
import type { FarmItem } from "../domain/FarmItems";
import { itemPlacement } from "../domain/rules/FarmItemRules";

export const FARM_ITEM_DROP_REGION = Object.freeze({ near: 1, far: 3.2, halfWidth: 1.5, samples: 25 });

/** Resolve randomness at input time. Commands persist the chosen point, never reroll on replay. */
export function findPlayerItemDropPosition(
  snapshot: FarmSnapshot,
  definitions: FarmingDefinitionSet,
  view: FarmingGroundView,
  item: FarmItem,
  eye: readonly [number, number, number],
  forward: readonly [number, number, number],
  random: () => number = Math.random,
  yaw = 0
): FarmItem["position"] | null {
  const length = Math.hypot(forward[0], forward[2]);
  const dx = length > 0.0001 ? forward[0] / length : 0;
  const dz = length > 0.0001 ? forward[2] / length : -1;
  const region = FARM_ITEM_DROP_REGION;
  const candidates = Array.from({ length: region.samples }, (_, i) => i);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const cell of candidates) {
    const distance = region.near + ((Math.floor(cell / 5) + random()) / 5) * (region.far - region.near);
    const lateral = -region.halfWidth + (((cell % 5) + random()) / 5) * region.halfWidth * 2;
    const position = itemPlacement(
      snapshot,
      definitions,
      view,
      item.groundId,
      [eye[0] + dx * distance - dz * lateral, eye[1], eye[2] + dz * distance + dx * lateral],
      item.id,
      item.type,
      yaw
    );
    if (position) return position;
  }
  return null;
}
