/** Deterministic hashes used by fixtures, caches, and regression tests. */
import type { RiverGeometryData, RiverSamplePoint } from "../river/types";

function hashNumber(hash: number, value: number): number {
  const normalized = Number.isFinite(value) ? Math.round(value * 100000) : 0x7fffffff;
  let current = normalized | 0;
  for (let i = 0; i < 4; i++) {
    hash ^= current & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    current >>= 8;
  }
  return hash;
}

function toHex(hash: number): string {
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashString(value: string): string {
  let low = 0x811c9dc5;
  let high = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    const lowByte = code & 0xff;
    const highByte = code >>> 8;
    low = Math.imul(low ^ lowByte, 0x01000193) >>> 0;
    low = Math.imul(low ^ highByte, 0x01000193) >>> 0;
    high = Math.imul(high ^ lowByte, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
    high = Math.imul(high ^ highByte, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
  }
  return `${toHex(high)}${toHex(low)}`;
}

export function hashRiverString(value: string): string {
  return hashString(value);
}

function writeStableValue(value: unknown, write: (chunk: string) => void): void {
  if (value === null) {
    write("null");
    return;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    write(JSON.stringify(value));
    return;
  }
  if (Array.isArray(value)) {
    write("[");
    for (let i = 0; i < value.length; i++) {
      if (i) write(",");
      // Preserve the previous map/join representation of sparse arrays.
      if (i in value) writeStableValue(value[i], write);
    }
    write("]");
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    write("{");
    let first = true;
    const keys = Object.keys(record);
    const view = value as { length?: number; [index: number]: unknown };
    if (ArrayBuffer.isView(value) && !(value instanceof DataView) && keys.length === view.length) {
      // Typed-array index keys must retain lexical (not numeric) order. Traverse the
      // decimal prefix tree instead of sorting a million keys and mapping strings.
      const entry = (index: number) => {
        if (!first) write(",");
        first = false;
        write(`"${index}":`);
        writeStableValue(view[index], write);
      };
      const walk = (index: number): void => {
        if (index >= view.length!) return;
        entry(index);
        for (let digit = 0; digit < 10; digit++) {
          const child = index * 10 + digit;
          if (child >= view.length!) break;
          walk(child);
        }
      };
      if (view.length) entry(0);
      for (let digit = 1; digit < 10; digit++) walk(digit);
      write("}");
      return;
    }
    for (const key of keys.filter((key) => record[key] !== undefined).sort()) {
      if (!first) write(",");
      first = false;
      write(JSON.stringify(key));
      write(":");
      writeStableValue(record[key], write);
    }
    write("}");
    return;
  }
  write("null");
}

export function hashStableValue(value: unknown): string {
  // Same UTF-16 byte sequence/hash as before, without materializing a world-sized
  // serialized string and per-field string arrays for immutable terrain buffers.
  let low = 0x811c9dc5;
  let high = 0x9e3779b9;
  writeStableValue(value, (chunk) => {
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i),
        lowByte = code & 0xff,
        highByte = code >>> 8;
      low = Math.imul(low ^ lowByte, 0x01000193) >>> 0;
      low = Math.imul(low ^ highByte, 0x01000193) >>> 0;
      high = Math.imul(high ^ lowByte, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      high = Math.imul(high ^ highByte, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
    }
  });
  return `${toHex(high)}${toHex(low)}`;
}

export function hashRiverStableValue(value: unknown): string {
  return hashStableValue(value);
}

export function hashRiverSamples(samples: RiverSamplePoint[]): string {
  let hash = 0x811c9dc5;
  for (const sample of samples) {
    const values = [
      sample.position.x,
      sample.position.y,
      sample.position.z,
      sample.tangent.x,
      sample.tangent.z,
      sample.distance,
      sample.flowTravelTime,
      sample.width,
      sample.depth,
      sample.flowSpeed,
      sample.bankFeather
    ];
    for (const value of values) hash = hashNumber(hash, value);
  }
  return toHex(hash);
}

export function hashRiverGeometryData(data: RiverGeometryData): string {
  let hash = 0x811c9dc5;
  for (const position of data.positions) {
    hash = hashNumber(hash, position[0]);
    hash = hashNumber(hash, position[1]);
    hash = hashNumber(hash, position[2]);
  }
  for (const normal of data.normals ?? []) {
    hash = hashNumber(hash, normal[0]);
    hash = hashNumber(hash, normal[1]);
    hash = hashNumber(hash, normal[2]);
  }
  for (const tangent of data.tangents ?? []) {
    hash = hashNumber(hash, tangent[0]);
    hash = hashNumber(hash, tangent[1]);
    hash = hashNumber(hash, tangent[2]);
    hash = hashNumber(hash, tangent[3]);
  }
  for (const uv of data.uvs) {
    hash = hashNumber(hash, uv[0]);
    hash = hashNumber(hash, uv[1]);
  }
  for (const uv of data.uv1s) {
    hash = hashNumber(hash, uv[0]);
    hash = hashNumber(hash, uv[1]);
  }
  for (const uv of data.uv2s ?? []) {
    hash = hashNumber(hash, uv[0]);
    hash = hashNumber(hash, uv[1]);
  }
  for (const uv of data.uv3s ?? []) {
    hash = hashNumber(hash, uv[0]);
    hash = hashNumber(hash, uv[1]);
  }
  for (const gradient of data.motionGradients ?? []) {
    for (const value of gradient) hash = hashNumber(hash, value);
  }
  for (const color of data.colors ?? []) {
    hash = hashNumber(hash, color[0]);
    hash = hashNumber(hash, color[1]);
    hash = hashNumber(hash, color[2]);
    hash = hashNumber(hash, color[3]);
  }
  for (const index of data.indices) hash = hashNumber(hash, index);
  hash = hashNumber(hash, data.maxDisplacement);
  return toHex(hash);
}
