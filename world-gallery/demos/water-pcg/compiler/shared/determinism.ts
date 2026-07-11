/** Deterministic hashes used by fixtures, caches, and regression tests. */
import type { RiverSamplePoint } from "../river/types";

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
  return hash.toString(16).padStart(8, "0");
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
      sample.width,
      sample.depth,
      sample.flowSpeed,
      sample.bankFeather
    ];
    for (const value of values) hash = hashNumber(hash, value);
  }
  return toHex(hash);
}
