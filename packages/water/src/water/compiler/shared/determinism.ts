/** Deterministic hashes used by fixtures, caches, and regression tests. */
import type { RiverGeometryData } from "../river/types";

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

class StableNumericArray {
  constructor(readonly values: ArrayLike<number> & ArrayBufferView) {}
}

/** Borrow a numeric view and hash it with the same array encoding as Array.from(view). */
export function asStableHashArray(values: ArrayLike<number> & ArrayBufferView): unknown {
  return new StableNumericArray(values);
}

function stableArrayValues(value: unknown): ArrayLike<unknown> | undefined {
  if (Array.isArray(value)) return value;
  if (value instanceof StableNumericArray) return value.values;
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
  const array = stableArrayValues(value);
  if (array) {
    write("[");
    for (let i = 0; i < array.length; i++) {
      if (i) write(",");
      // Preserve the previous map/join representation of sparse arrays.
      if (i in array) writeStableValue(array[i], write);
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
function* stableValueChunks(value: unknown): Generator<string> {
  if (value === null) {
    yield "null";
    return;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    yield JSON.stringify(value);
    return;
  }
  const array = stableArrayValues(value);
  if (array) {
    let chunk = "[";
    for (let i = 0; i < array.length; i++) {
      if (i) chunk += ",";
      if (i in array) {
        const child = array[i];
        if (child === null || typeof child !== "object") {
          chunk +=
            typeof child === "number" || typeof child === "boolean" || typeof child === "string"
              ? JSON.stringify(child)
              : "null";
        } else {
          if (chunk) yield chunk;
          chunk = "";
          yield* stableValueChunks(child);
        }
      }
      // Batch primitive terrain samples: no per-sample generator allocation.
      if (chunk.length >= 4096) {
        yield chunk;
        chunk = "";
      }
    }
    yield chunk + "]";
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    yield "{";
    let first = true;
    const keys = Object.keys(record);
    const view = value as { length?: number; [index: number]: unknown };
    if (ArrayBuffer.isView(value) && !(value instanceof DataView) && keys.length === view.length) {
      // Typed-array index keys must retain lexical (not numeric) order. Traverse the
      // decimal prefix tree instead of sorting a million keys and mapping strings.
      function* entry(index: number): Generator<string> {
        if (!first) yield ",";
        first = false;
        yield `"${index}":`;
        yield* stableValueChunks(view[index]);
      }
      function* walk(index: number): Generator<string> {
        if (index >= view.length!) return;
        yield* entry(index);
        for (let digit = 0; digit < 10; digit++) {
          const child = index * 10 + digit;
          if (child >= view.length!) break;
          yield* walk(child);
        }
      }
      if (view.length) yield* entry(0);
      for (let digit = 1; digit < 10; digit++) yield* walk(digit);
      yield "}";
      return;
    }
    for (const key of keys.filter((key) => record[key] !== undefined).sort()) {
      if (!first) yield ",";
      first = false;
      yield JSON.stringify(key);
      yield ":";
      yield* stableValueChunks(record[key]);
    }
    yield "}";
    return;
  }
  yield "null";
}

export function hashStableValue(value: unknown): string {
  // Same UTF-16 byte sequence/hash as before, without materializing a world-sized
  // serialized string and per-field string arrays for immutable terrain buffers.
  let low = 0x811c9dc5;
  let high = 0x9e3779b9;
  const feedAscii = (code: number): void => {
    low = Math.imul(Math.imul(low ^ code, 0x01000193), 0x01000193) >>> 0;
    high = Math.imul(high ^ code, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
    high = Math.imul(high, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
  };
  const feedAsciiString = (chunk: string): void => {
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i);
      low = Math.imul(Math.imul(low ^ code, 0x01000193), 0x01000193) >>> 0;
      high = Math.imul(high ^ code, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
      high = Math.imul(high, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
    }
  };
  const feedString = (chunk: string): void => {
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
  };
  const hashValue = (v: unknown): void => {
    if (v === null) {
      feedAsciiString("null");
      return;
    }
    const t = typeof v;
    if (t === "number") {
      if (v === 0) feedAscii(48);
      else if (Number.isFinite(v as number)) feedAsciiString("" + (v as number));
      else feedAsciiString("null");
      return;
    }
    if (t === "boolean") {
      feedAsciiString(v ? "true" : "false");
      return;
    }
    if (t === "string") {
      feedString(JSON.stringify(v));
      return;
    }
    if (v instanceof StableNumericArray) {
      const values = v.values;
      feedAscii(91); // '['
      let l = low;
      let h = high;
      if (values instanceof Uint8Array || values instanceof Uint8ClampedArray) {
        const len = values.length;
        for (let i = 0; i < len; i++) {
          if (i) {
            l = Math.imul(Math.imul(l ^ 44, 0x01000193), 0x01000193) >>> 0;
            h = Math.imul(h ^ 44, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
          }
          const b = values[i];
          if (b < 10) {
            const c0 = 48 + b;
            l = Math.imul(Math.imul(l ^ c0, 0x01000193), 0x01000193) >>> 0;
            h = Math.imul(h ^ c0, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
          } else if (b < 100) {
            const tens = (b * 0.1) | 0;
            const c0 = 48 + tens;
            const c1 = 48 + b - tens * 10;
            l = Math.imul(Math.imul(l ^ c0, 0x01000193), 0x01000193) >>> 0;
            h = Math.imul(h ^ c0, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            l = Math.imul(Math.imul(l ^ c1, 0x01000193), 0x01000193) >>> 0;
            h = Math.imul(h ^ c1, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
          } else {
            const hundreds = (b * 0.01) | 0;
            const rem = b - hundreds * 100;
            const tens = (rem * 0.1) | 0;
            const c0 = 48 + hundreds;
            const c1 = 48 + tens;
            const c2 = 48 + rem - tens * 10;
            l = Math.imul(Math.imul(l ^ c0, 0x01000193), 0x01000193) >>> 0;
            h = Math.imul(h ^ c0, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            l = Math.imul(Math.imul(l ^ c1, 0x01000193), 0x01000193) >>> 0;
            h = Math.imul(h ^ c1, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            l = Math.imul(Math.imul(l ^ c2, 0x01000193), 0x01000193) >>> 0;
            h = Math.imul(h ^ c2, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
          }
        }
      } else {
        const len = values.length;
        for (let i = 0; i < len; i++) {
          if (i) {
            l = Math.imul(Math.imul(l ^ 44, 0x01000193), 0x01000193) >>> 0;
            h = Math.imul(h ^ 44, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
          }
          const n = values[i];
          if (n === 0) {
            l = Math.imul(Math.imul(l ^ 48, 0x01000193), 0x01000193) >>> 0;
            h = Math.imul(h ^ 48, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
          } else if (n === 1) {
            l = Math.imul(Math.imul(l ^ 49, 0x01000193), 0x01000193) >>> 0;
            h = Math.imul(h ^ 49, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x5bd1e995) >>> 0;
            h ^= h >>> 15;
          } else if (Number.isFinite(n)) {
            const s = "" + n;
            for (let j = 0; j < s.length; j++) {
              const c = s.charCodeAt(j);
              l = Math.imul(Math.imul(l ^ c, 0x01000193), 0x01000193) >>> 0;
              h = Math.imul(h ^ c, 0x5bd1e995) >>> 0;
              h ^= h >>> 15;
              h = Math.imul(h, 0x5bd1e995) >>> 0;
              h ^= h >>> 15;
            }
          } else {
            const s = "null";
            for (let j = 0; j < 4; j++) {
              const c = s.charCodeAt(j);
              l = Math.imul(Math.imul(l ^ c, 0x01000193), 0x01000193) >>> 0;
              h = Math.imul(h ^ c, 0x5bd1e995) >>> 0;
              h ^= h >>> 15;
              h = Math.imul(h, 0x5bd1e995) >>> 0;
              h ^= h >>> 15;
            }
          }
        }
      }
      low = l;
      high = h;
      feedAscii(93); // ']'
      return;
    }
    if (Array.isArray(v)) {
      feedAscii(91); // '['
      for (let i = 0; i < v.length; i++) {
        if (i) feedAscii(44); // ','
        if (i in v) hashObject(v[i]);
      }
      feedAscii(93); // ']'
      return;
    }
    if (t === "object") {
      writeStableValue(v, feedString);
      return;
    }
    feedAsciiString("null");
  };
  // Specialize top-level plain objects so nested StableNumericArray fields hit the fast path.
  const hashObject = (v: unknown): void => {
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof StableNumericArray) &&
      !ArrayBuffer.isView(v)
    ) {
      const record = v as Record<string, unknown>;
      feedAscii(123); // '{'
      let first = true;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (!first) feedAscii(44);
        first = false;
        feedString(JSON.stringify(key));
        feedAscii(58); // ':'
        hashObject(record[key]);
      }
      feedAscii(125); // '}'
      return;
    }
    hashValue(v);
  };
  hashObject(value);
  return `${toHex(high)}${toHex(low)}`;
}

/** Hash an owned input without blocking scene updates. Keep it unchanged until completion. */
export async function hashStableValueAsync(value: unknown, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  let low = 0x811c9dc5,
    high = 0x9e3779b9,
    work = 0,
    deadline = performance.now() + 2;
  for (const chunk of stableValueChunks(value)) {
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
      if (++work % 4096 === 0 && performance.now() >= deadline) {
        await yieldHashTask();
        signal?.throwIfAborted();
        deadline = performance.now() + 2;
      }
    }
  }
  signal?.throwIfAborted();
  return `${toHex(high)}${toHex(low)}`;
}
function yieldHashTask(): Promise<void> {
  if (typeof MessageChannel === "undefined") return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const close = () => {
      channel.port1.close();
      channel.port2.close();
    };
    channel.port1.onmessage = () => {
      close();
      resolve();
    };
    try {
      channel.port2.postMessage(null);
    } catch (error) {
      close();
      reject(error);
    }
  });
}

export function hashRiverStableValue(value: unknown): string {
  return hashStableValue(value);
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
