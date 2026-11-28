/** The recovered roof mode branch compares float32 author values with float32
 * 0.1. Use the same boundary before and after serialization and in every host
 * consumer; JS double 0.1 is slightly smaller than its saved float32 value. */
const FLAT_ROOF_LIMIT = Math.fround(0.1);
export function isFlatRoofHeight(height: number): boolean {
  return Math.fround(height) <= FLAT_ROOF_LIMIT;
}
