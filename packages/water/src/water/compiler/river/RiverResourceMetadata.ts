import {
  WaterReadonlyFloat32Buffer,
  WaterReadonlyInt32Buffer,
  WaterReadonlyUint32Buffer,
  WaterReadonlyUint8Buffer
} from "../shared/ReadonlyNumericBuffer";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import { waterTerrainHashSummary } from "../../authoring/terrain/WaterTerrainIdentity";
import { hashRiverStableValue } from "../shared/determinism";
import type { RiverCompiledData } from "./types";

export interface RiverResourceMetadata {
  readonly descriptorHash: string;
  readonly compiledHash: string;
}

/** Shared exact-identity projection for River descriptors without serializing terrain grids as decimal JSON. */
export function summarizeRiverDescriptorForHash(descriptor: unknown): unknown {
  if (descriptor && typeof descriptor === "object" && "terrain" in descriptor) {
    const candidate = descriptor as RiverNetworkDescriptor;
    if (candidate.terrain) {
      return {
        ...candidate,
        terrain: waterTerrainHashSummary(candidate.terrain)
      };
    }
  }
  return descriptor;
}

const f64Buf = new ArrayBuffer(8);
const f64View = new DataView(f64Buf);
const f64Words = new Uint32Array(f64Buf);

/** Direct zero-allocation streaming hash over compiled River data (typed buffers + plain geometry arrays). */
function hashCompiledRiverData(root: unknown): string {
  let low = 0x811c9dc5;
  let high = 0x9e3779b9;
  const mixWord = (w: number): void => {
    low = Math.imul(low ^ w, 0x01000193) >>> 0;
    high = Math.imul(high ^ w, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
  };
  const mixString = (s: string): void => {
    mixWord(0x73000000 | s.length);
    for (let i = 0; i < s.length; i++) mixWord(s.charCodeAt(i));
  };
  const mixView = (tag: number, view: ArrayBufferView): void => {
    const byteLength = view.byteLength;
    mixWord(tag);
    mixWord(byteLength);
    const alignedWords = (view.byteOffset & 3) === 0 ? byteLength >>> 2 : 0;
    if (alignedWords > 0) {
      const words = new Uint32Array(view.buffer, view.byteOffset, alignedWords);
      for (let i = 0; i < alignedWords; i++) {
        const w = words[i]!;
        low = Math.imul(low ^ w, 0x01000193) >>> 0;
        high = Math.imul(high ^ w, 0x5bd1e995) >>> 0;
        high ^= high >>> 15;
      }
    }
    const tailStart = alignedWords << 2;
    if (tailStart < byteLength) {
      const bytes = new Uint8Array(view.buffer, view.byteOffset, byteLength);
      for (let i = tailStart; i < byteLength; i++) mixWord(bytes[i]!);
    }
  };
  const visit = (value: unknown): void => {
    if (value === null) {
      mixWord(0x10000001);
      return;
    }
    const t = typeof value;
    if (t === "number") {
      mixWord(0x20000001);
      // Normalize -0 to +0 so numeric equality matches JSON semantics.
      f64View.setFloat64(0, value === 0 ? 0 : (value as number), true);
      mixWord(f64Words[0]!);
      mixWord(f64Words[1]!);
      return;
    }
    if (t === "boolean") {
      mixWord(value ? 0x30000001 : 0x30000000);
      return;
    }
    if (t === "string") {
      mixString(value as string);
      return;
    }
    if (t !== "object") {
      mixWord(0x10000002);
      return;
    }
    if (value instanceof WaterReadonlyUint8Buffer) {
      mixView(0x41000001, value.borrowTypedArray());
      return;
    }
    if (value instanceof WaterReadonlyUint32Buffer) {
      mixView(0x41000002, value.borrowTypedArray());
      return;
    }
    if (value instanceof WaterReadonlyInt32Buffer) {
      mixView(0x41000003, value.borrowTypedArray());
      return;
    }
    if (value instanceof WaterReadonlyFloat32Buffer) {
      mixView(0x41000004, value.borrowTypedArray());
      return;
    }
    if (ArrayBuffer.isView(value)) {
      mixView(0x41000005, value);
      return;
    }
    if (Array.isArray(value)) {
      const len = value.length;
      mixWord(0x50000000 ^ len);
      for (let i = 0; i < len; i++) {
        const item = value[i];
        if (typeof item === "number") {
          f64View.setFloat64(0, item === 0 ? 0 : item, true);
          low = Math.imul(low ^ f64Words[0]!, 0x01000193) >>> 0;
          high = Math.imul(high ^ f64Words[0]!, 0x5bd1e995) >>> 0;
          high ^= high >>> 15;
          low = Math.imul(low ^ f64Words[1]!, 0x01000193) >>> 0;
          high = Math.imul(high ^ f64Words[1]!, 0x5bd1e995) >>> 0;
          high ^= high >>> 15;
        } else {
          visit(item);
        }
      }
      return;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    mixWord(0x60000000 ^ keys.length);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!;
      const v = record[k];
      if (v === undefined) continue;
      mixString(k);
      visit(v);
    }
  };
  visit(root);
  return `${(high >>> 0).toString(16).padStart(8, "0")}${(low >>> 0).toString(16).padStart(8, "0")}`;
}

/** Computes persistent identity without encoding or retaining a transport envelope. */
export function createRiverResourceMetadata(
  descriptor: RiverNetworkDescriptor,
  data: RiverCompiledData
): RiverResourceMetadata {
  return Object.freeze({
    descriptorHash: hashRiverStableValue(summarizeRiverDescriptorForHash(descriptor)),
    compiledHash: hashCompiledRiverData(data)
  });
}
