/** Typed deterministic identities used across Water authoring, compilation, and runtime publication. */

const DETERMINISTIC_HASH_PATTERN = /^(?:[a-f0-9]{16}|[a-f0-9]{64})$/;

declare const WATER_REVISION_BRAND: unique symbol;
declare const WATER_CONTENT_HASH_BRAND: unique symbol;

export type WaterRevision<Scope extends string> = number & {
  readonly [WATER_REVISION_BRAND]: Scope;
};

export type WaterContentHash<Scope extends string> = string & {
  readonly [WATER_CONTENT_HASH_BRAND]: Scope;
};

function requireNonNegativeSafeInteger(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${path} must be a non-negative safe integer.`);
  }
  return value;
}

export function createWaterRevision<Scope extends string>(
  value: number,
  path = "Water revision"
): WaterRevision<Scope> {
  return requireNonNegativeSafeInteger(value, path) as WaterRevision<Scope>;
}

export function nextWaterRevision<Scope extends string>(
  current: WaterRevision<Scope>,
  path = "Water revision"
): WaterRevision<Scope> {
  if (current >= Number.MAX_SAFE_INTEGER) throw new RangeError(`${path} exhausted the safe integer range.`);
  return createWaterRevision<Scope>(current + 1, path);
}

export function createWaterContentHash<Scope extends string>(
  value: string,
  path = "Water content hash"
): WaterContentHash<Scope> {
  if (typeof value !== "string" || !DETERMINISTIC_HASH_PATTERN.test(value)) {
    throw new TypeError(`${path} must be a deterministic lowercase hex hash.`);
  }
  return value as WaterContentHash<Scope>;
}
