import type { GroundBounds } from "../domain/FarmingGround";

export interface StorageContainerDefinition {
  readonly id: string;
  readonly name: string;
  readonly appearance: "cart" | "basket";
  /** Full footprint in metres, including wheels and shafts. */
  readonly width: number;
  readonly depth: number;
}
export interface CropStorageDefinition {
  readonly containerTypeId: string;
  /** Basket inventory limit; cart display slots (also bounded by CART_DISPLAY_LIMIT). */
  readonly capacity: number;
  readonly unit: string;
}
export interface FarmingStorageDefinitions {
  readonly containers: readonly StorageContainerDefinition[];
  readonly crops: Readonly<Record<string, CropStorageDefinition>>;
}
export interface StorageProtectedArea extends GroundBounds {
  readonly groundId: string;
}
export interface StorageLayout {
  readonly groundId: string;
  readonly anchorX: number;
  readonly anchorZ: number;
  readonly searchRadius: number;
  readonly searchStep: number;
  readonly plotClearance: number;
  readonly containerClearance: number;
  readonly maximumSlopeDegrees: number;
  readonly protectedAreas: readonly StorageProtectedArea[];
}
export interface StorageContent {
  readonly cropId: string;
  readonly itemId: string;
  readonly quantity: number;
}
export interface StorageContainerState {
  readonly id: string;
  readonly typeId: string;
  readonly order: number;
  readonly groundId: string;
  readonly position: readonly [number, number, number];
  readonly yaw: 0 | 90;
  readonly cropId: string | null;
  readonly itemId: string | null;
  readonly quantity: number;
  /** Other crop stacks in a mixed cart; the primary stack remains in cropId/itemId/quantity. */
  readonly additionalContents?: readonly StorageContent[];
}
export interface FarmStorageState {
  readonly definitionsSignature: string;
  readonly layout: StorageLayout;
  readonly retainedCounts: Readonly<Record<string, number>>;
  readonly sequence: number;
  readonly containers: readonly StorageContainerState[];
}
export interface StorageContainerQuery {
  readonly typeId?: string;
  readonly cropId?: string;
}
export interface StorageContainerView extends Omit<StorageContainerState, "additionalContents"> {
  /** Complete inventory; quantity is the sum, and cropId/itemId are null for mixed cargo. */
  readonly contents: readonly StorageContent[];
  /** Maximum visible units, independent of the cart's uncapped logical inventory. */
  readonly displayCapacity: number;
  readonly name: string;
  readonly cropName: string | null;
  readonly capacity: number | null;
  readonly unit: string | null;
}
export type StorageWriteInput =
  | { readonly type: "set-container-count"; readonly typeId: string; readonly count: number }
  | {
      readonly type: "withdraw-inventory";
      readonly itemId: string;
      readonly quantity: number;
      /** Restrict removal to one observed container; omitted keeps the aggregate withdrawal order. */
      readonly containerId?: string;
    };
