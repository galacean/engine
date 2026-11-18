import type { WorldItem, ItemCapability } from "@galacean/engine-project/interaction/WorldItem";

export const HARVEST_BASKET_CAPACITY = 20;
export const FARM_ITEM_SOFT_LIMIT = 20;
export const FARM_ITEM_TYPES = ["hoe", "watering-can", "harvest-basket", "seed-bag"] as const;
export type FarmItemType = (typeof FARM_ITEM_TYPES)[number];
export const FARM_ITEM_CAPABILITIES: Readonly<Record<FarmItemType, ItemCapability>> = Object.freeze({
  hoe: { action: "cultivate", side: "right", portable: true },
  "watering-can": { action: "irrigate", side: "right", portable: true },
  "harvest-basket": { action: "harvest", side: "left", portable: true },
  "seed-bag": { action: "plant", side: "left", portable: true }
});
export interface BasketContent {
  readonly cropId: string;
  readonly itemId: string;
  readonly quantity: number;
}
export interface FarmItem extends WorldItem<FarmItemType> {
  /** Ground orientation in degrees around world Y; absent in legacy saves means zero. */
  readonly yaw?: number;
  readonly seedId?: string;
  readonly contents: readonly BasketContent[];
}
export type FarmCarry = { readonly itemId: string } | null;
export interface FarmItemsState {
  readonly sequence: number;
  readonly instances: readonly FarmItem[];
  readonly carried: FarmCarry;
}
export const emptyFarmItems = (): FarmItemsState => ({
  sequence: 0,
  instances: [],
  carried: null
});
export function basketUsed(item: Pick<FarmItem, "contents">): number {
  return item.contents.reduce((n, content) => n + content.quantity, 0);
}
export function carriedItem(state: FarmItemsState): FarmItem | undefined {
  const carry = state.carried;
  return carry ? state.instances.find((item) => item.id === carry.itemId) : undefined;
}
export function freezeFarmItems(state: FarmItemsState): FarmItemsState {
  if (Object.isFrozen(state)) return state;
  return Object.freeze({
    ...state,
    carried: state.carried ? Object.freeze({ ...state.carried }) : null,
    instances: Object.freeze(
      state.instances.map((item) =>
        Object.freeze({
          ...item,
          position: Object.freeze([...item.position]) as FarmItem["position"],
          contents: Object.freeze(item.contents.map((entry) => Object.freeze({ ...entry })))
        })
      )
    )
  });
}
export type FarmItemInput =
  | {
      readonly type: "spawn-item";
      readonly itemType: FarmItemType;
      readonly count: number;
      readonly groundId: string;
      readonly position: readonly [number, number, number];
      readonly seedId?: string;
    }
  | {
      readonly type: "pickup-item";
      readonly itemId: string;
      readonly dropPosition: readonly [number, number, number];
      readonly dropYaw?: number;
    }
  | {
      readonly type: "place-item";
      readonly expectedItemId: string;
      readonly groundId: string;
      readonly position: readonly [number, number, number];
      readonly yaw?: number;
    }
  | {
      readonly type: "unload-basket";
      readonly basketId: string;
      readonly containerId?: string;
    };
