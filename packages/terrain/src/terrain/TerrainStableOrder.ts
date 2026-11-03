/**
 * Compares opaque Terrain identifiers by fixed UTF-16 code units.
 * @param left First stable value.
 * @param right Second stable value.
 * @returns Negative, zero, or positive according to deterministic code-unit order.
 */
export function compareTerrainStableValues(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
