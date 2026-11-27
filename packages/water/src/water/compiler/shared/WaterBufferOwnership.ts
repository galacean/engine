/** Explicit ownership modes for compiler/runtime numeric-buffer boundaries. */
export enum WaterBufferOwnership {
  /** Copy caller data before retaining it. Use for authoring and other borrowed input. */
  Copy = "copy",
  /** Adopt a same-typed array whose ownership is transferred to the receiver. */
  Transfer = "transfer"
}

export const WATER_OWNED_NUMERIC_BUFFER = Symbol("water-owned-numeric-buffer");

export interface WaterOwnedNumericBuffer<TArray extends ArrayBufferView> {
  readonly [WATER_OWNED_NUMERIC_BUFFER]: true;
  readonly byteLength: number;
  /**
   * Internal borrowed view. Consumers must not mutate or retain it beyond the
   * owning compiled resource lifetime.
   */
  borrowTypedArray(): TArray;
}

export function adoptOrCopyTypedArray<TArray extends ArrayBufferView>(
  values: ArrayLike<number>,
  constructor: {
    new (values: ArrayLike<number>): TArray;
  },
  expectedConstructor: Function,
  ownership: WaterBufferOwnership
): TArray {
  if (ownership === WaterBufferOwnership.Transfer && values instanceof expectedConstructor) {
    return values as unknown as TArray;
  }
  return new constructor(values);
}

export function isWaterOwnedNumericBuffer(value: unknown): value is WaterOwnedNumericBuffer<ArrayBufferView> {
  return (
    typeof value === "object" &&
    value !== null &&
    WATER_OWNED_NUMERIC_BUFFER in value &&
    (value as WaterOwnedNumericBuffer<ArrayBufferView>)[WATER_OWNED_NUMERIC_BUFFER] === true
  );
}
