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

function stableStringifyInternal(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringifyInternal).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringifyInternal(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  return "null";
}

export function hashStableValue(value: unknown): string {
  return hashString(stableStringifyInternal(value));
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
