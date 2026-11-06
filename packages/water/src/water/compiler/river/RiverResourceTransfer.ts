import { RiverNetworkSchemaVersion } from "../../authoring/river/RiverAuthoringEnums";
import {
  RiverReadonlyFloat32Buffer,
  RiverReadonlyInt32Buffer,
  RiverReadonlyUint32Buffer,
  RiverReadonlyUint8Buffer
} from "../shared/ReadonlyNumericBuffer";
import { WaterBufferOwnership } from "../shared/WaterBufferOwnership";
import type { RiverCompiledData } from "./types";
import type { RiverResourceMetadata } from "./RiverResourceSerializer";

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
    if (value instanceof RiverReadonlyUint8Buffer) return { __riverBuffer: "u8", values: value.borrowTypedArray() };
    if (value instanceof RiverReadonlyUint32Buffer) return { __riverBuffer: "u32", values: value.borrowTypedArray() };
    if (value instanceof RiverReadonlyInt32Buffer) return { __riverBuffer: "i32", values: value.borrowTypedArray() };
    if (value instanceof RiverReadonlyFloat32Buffer) return { __riverBuffer: "f32", values: value.borrowTypedArray() };
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
      return new RiverReadonlyUint8Buffer(values, WaterBufferOwnership.Transfer);
    if (record.__riverBuffer === "u32" && values instanceof Uint32Array)
      return new RiverReadonlyUint32Buffer(values, WaterBufferOwnership.Transfer);
    if (record.__riverBuffer === "i32" && values instanceof Int32Array)
      return new RiverReadonlyInt32Buffer(values, WaterBufferOwnership.Transfer);
    if (record.__riverBuffer === "f32" && values instanceof Float32Array)
      return new RiverReadonlyFloat32Buffer(values, WaterBufferOwnership.Transfer);
    return Object.freeze(Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, visit(entry)])));
  };
  return visit(data) as RiverCompiledData;
}

const MAGIC = 0x32525652;
const constructors = { Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array, Float64Array };

/** Explicit byte exports use a JSON structure header followed by aligned binary arrays. */
export function encodeRiverTransfer(resource: RiverResourceTransfer): Uint8Array {
  const blocks: Uint8Array[] = [];
  let offset = 0;
  const header = new TextEncoder().encode(
    JSON.stringify(resource, (_key, value: unknown) => {
      if (!ArrayBuffer.isView(value)) return value;
      const array = value as NumericArray;
      const block = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      const reference = { __riverArray: array.constructor.name, offset, length: array.length };
      blocks.push(block);
      offset += Math.ceil(block.byteLength / 8) * 8;
      return reference;
    })
  );
  const bodyStart = Math.ceil((8 + header.byteLength) / 8) * 8;
  const bytes = new Uint8Array(bodyStart + offset);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, header.byteLength, true);
  bytes.set(header, 8);
  let cursor = bodyStart;
  for (const block of blocks) {
    bytes.set(block, cursor);
    cursor += Math.ceil(block.byteLength / 8) * 8;
  }
  return bytes;
}

export function decodeRiverTransfer(bytes: Uint8Array): RiverResourceTransfer {
  if (
    bytes.byteLength < 8 ||
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) !== MAGIC
  ) {
    throw new Error("River resource format 不兼容，请重新编译。");
  }
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  const bodyStart = Math.ceil((8 + headerLength) / 8) * 8;
  if (bodyStart > bytes.byteLength) throw new Error("Malformed river resource header.");
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(8, 8 + headerLength)),
    (_key, value: unknown) => {
      if (value === null || typeof value !== "object") return value;
      const ref = value as { __riverArray?: keyof typeof constructors; offset: number; length: number };
      if (!ref.__riverArray) return value;
      const constructor = constructors[ref.__riverArray];
      if (
        !constructor ||
        !Number.isInteger(ref.offset) ||
        ref.offset < 0 ||
        !Number.isInteger(ref.length) ||
        ref.length < 0
      ) {
        throw new Error("Malformed river numeric array.");
      }
      const end = bodyStart + ref.offset + ref.length * constructor.BYTES_PER_ELEMENT;
      if (end > bytes.byteLength) throw new Error("Truncated river numeric array.");
      // Byte imports own their arrays independently of the caller's transport allocation.
      const storage = new ArrayBuffer(ref.length * constructor.BYTES_PER_ELEMENT);
      new Uint8Array(storage).set(bytes.subarray(bodyStart + ref.offset, end));
      return new constructor(storage);
    }
  ) as RiverResourceTransfer;
}
