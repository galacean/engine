import {
  WaterReadonlyFloat32Buffer,
  WaterReadonlyInt32Buffer,
  WaterReadonlyUint32Buffer,
  WaterReadonlyUint8Buffer
} from "../shared/ReadonlyNumericBuffer";
import { RiverNetworkSchemaVersion } from "../../authoring/river/RiverAuthoringEnums";

import { WaterBufferOwnership } from "../shared/WaterBufferOwnership";
import type { RiverCompiledData } from "./types";
import type { RiverResourceMetadata } from "./RiverResourceMetadata";

type NumericArray = Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array | Float64Array;
type TransferValue =
  | undefined
  | null
  | boolean
  | number
  | string
  | NumericArray
  | readonly TransferValue[]
  | { readonly [key: string]: TransferValue };

// Version 2 removes the retired independent bank foam representation.
export const RIVER_RESOURCE_SCHEMA_VERSION = 2;

export interface RiverResourceTransfer {
  readonly schemaVersion: number;
  readonly data: TransferValue;
  readonly metadata: RiverResourceMetadata;
}

/** Same-build transport only; structural relationship checks belong to a future persisted format. */
export function assertRiverResourceTransferVersion(resource: RiverResourceTransfer): void {
  const data = resource?.data;
  if (
    resource?.schemaVersion !== RIVER_RESOURCE_SCHEMA_VERSION ||
    data === null ||
    typeof data !== "object" ||
    !("schemaVersion" in data) ||
    data.schemaVersion !== RiverNetworkSchemaVersion.V2
  ) {
    throw new Error("River resource schemaVersion 不兼容，请重新编译。");
  }
}

/** Borrow compiler-owned arrays; the Worker relinquishes them in postMessage. */
export function createRiverCompiledTransfer(data: RiverCompiledData): TransferValue {
  const visit = (value: unknown): TransferValue => {
    if (value instanceof WaterReadonlyUint8Buffer) return { __riverBuffer: "u8", values: value.borrowTypedArray() };
    if (value instanceof WaterReadonlyUint32Buffer) return { __riverBuffer: "u32", values: value.borrowTypedArray() };
    if (value instanceof WaterReadonlyInt32Buffer) return { __riverBuffer: "i32", values: value.borrowTypedArray() };
    if (value instanceof WaterReadonlyFloat32Buffer) return { __riverBuffer: "f32", values: value.borrowTypedArray() };
    if (ArrayBuffer.isView(value)) return value as NumericArray;
    if (Array.isArray(value)) return value.map(visit);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry)]));
    }
    return value as undefined | null | boolean | number | string;
  };
  return visit(data);
}

export function collectRiverTransferables(data: TransferValue): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const visit = (value: TransferValue): void => {
    if (ArrayBuffer.isView(value)) buffers.add(value.buffer as ArrayBuffer);
    else if (value !== null && typeof value === "object") for (const entry of Object.values(value)) visit(entry);
  };
  visit(data);
  return [...buffers];
}

/** Rewrap owned arrays without copying their elements; never parses JSON or hashes. */
export function restoreRiverCompiledTransfer(data: TransferValue): RiverCompiledData {
  const visit = (value: TransferValue): unknown => {
    if (value === null || typeof value !== "object" || ArrayBuffer.isView(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(visit));
    const record = value as { readonly [key: string]: TransferValue };
    const values = record.values;
    if (record.__riverBuffer === "u8" && values instanceof Uint8Array)
      return new WaterReadonlyUint8Buffer(values, WaterBufferOwnership.Transfer);
    if (record.__riverBuffer === "u32" && values instanceof Uint32Array)
      return new WaterReadonlyUint32Buffer(values, WaterBufferOwnership.Transfer);
    if (record.__riverBuffer === "i32" && values instanceof Int32Array)
      return new WaterReadonlyInt32Buffer(values, WaterBufferOwnership.Transfer);
    if (record.__riverBuffer === "f32" && values instanceof Float32Array)
      return new WaterReadonlyFloat32Buffer(values, WaterBufferOwnership.Transfer);
    return Object.freeze(Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, visit(entry)])));
  };
  return visit(data) as RiverCompiledData;
}
