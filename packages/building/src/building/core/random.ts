/** Integer-only hashing and random streams. Every result is a pure function of its
 * inputs: no global state, no `Math.random`, no transcendental functions. */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function mix32(value: number): number {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
export function hashString(value: string, seed = FNV_OFFSET): number {
  let h = seed | 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return mix32(h);
}
/** A seed derived from a parent seed and an ordered list of stable keys. */
export function deriveSeed(seed: number, ...keys: readonly (string | number)[]): number {
  if (!Number.isSafeInteger(seed)) throw Error("Seed must be a safe integer");
  let h = mix32((seed >>> 0) ^ 0x9e3779b9);
  for (const key of keys) {
    if (typeof key === "number" && !Number.isSafeInteger(key)) throw Error("Numeric seed keys must be safe integers");
    h = hashString((typeof key === "number" ? "n" : "s") + key, h);
  }
  return h;
}
/** Counter-based uniform stream. */
export class Random {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  nextUint32(): number {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    return mix32(this.state);
  }
  /** Uniform in [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}
