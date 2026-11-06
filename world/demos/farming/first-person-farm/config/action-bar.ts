import type { GroundTarget } from "@galacean/engine-farming/farming/domain/FarmingGround";
import type { FarmActionId, FarmActionInput } from "@galacean/engine-farming/farming/api/index";

interface ActionTarget {
  readonly plotId: string;
  readonly ground?: GroundTarget;
  readonly seedId: string | null;
  readonly cropInstanceId: string | null;
}

/** Demo presentation and parameter collection; operation rules live in the shared API. */
export const FARM_ACTION_PRESENTATION = {
  plant: {
    slot: 1,
    iconUrl: new URL("../assets/ui/sow.png", import.meta.url).href,
    input: ({ plotId, seedId }) => (seedId ? { type: "plant", plotId, seedId } : null)
  },
  irrigate: {
    slot: 2,
    iconUrl: new URL("../assets/ui/water.png", import.meta.url).href,
    input: ({ plotId }) => ({ type: "irrigate", plotId })
  },
  hoe: {
    slot: 4,
    iconUrl: new URL("../assets/ui/hoe.png", import.meta.url).href,
    input: ({ ground, cropInstanceId }) =>
      ground
        ? {
            type: "hoe",
            target: { groundId: ground.groundId, cellX: ground.cellX, cellZ: ground.cellZ },
            expectedCropInstanceId: cropInstanceId
          }
        : null
  },
  "delete-plot": {
    slot: 6,
    iconUrl: new URL("../assets/ui/restore.png", import.meta.url).href,
    input: ({ plotId }) => ({ type: "delete-plot", plotId, cascadeCrop: true })
  },
  harvest: {
    slot: 3,
    iconUrl: new URL("../assets/ui/harvest.png", import.meta.url).href,
    input: ({ plotId, cropInstanceId }) => (cropInstanceId ? { type: "harvest", plotId, cropInstanceId } : null)
  }
} satisfies {
  readonly [Id in FarmActionId]: {
    readonly slot: number;
    readonly iconUrl: string;
    readonly input: (target: ActionTarget) => Extract<FarmActionInput, { readonly type: Id }> | null;
  };
};

/** Placing a carried item persists its world position and preserves basket contents. */
export const FARM_BASKET_STOW_PRESENTATION = {
  id: "hide-basket",
  slot: 7,
  name: "放下",
  description: "放下当前道具；收获篮内容保留，手动卸货后才进入仓库。"
} as const;
export type FarmHotbarActionId = FarmActionId | typeof FARM_BASKET_STOW_PRESENTATION.id;
export const FARM_HOTBAR_PRESENTATION = {
  ...FARM_ACTION_PRESENTATION,
  "hide-basket": FARM_BASKET_STOW_PRESENTATION
};
