import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
/** Stateless shape strategy. Lower thresholds are populated first as coverage increases.
 * The strategy does not own POIs, exclusions, roads, region IDs or rendering.
 * Change id when changing its deterministic implementation, to invalidate cached shapes.
 */
export interface FlowerShapeAlgorithm {
  readonly id: string;
  threshold(seed: number, point: PlanPoint, patchSizeM: number): number;
}
function noise(seed: number, x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    smooth = (t: number) => t * t * (3 - 2 * t),
    u = smooth(x - ix),
    v = smooth(z - iz),
    n = (a: number, b: number) => settlementRandom(seed, `flowers:${a}:${b}`);
  return (n(ix, iz) * (1 - u) + n(ix + 1, iz) * u) * (1 - v) + (n(ix, iz + 1) * (1 - u) + n(ix + 1, iz + 1) * u) * v;
}
/** Current two-scale smooth value-noise strategy; independently replaceable in the planner. */
export const flowerShape: FlowerShapeAlgorithm = {
  id: "smooth-value-noise-v1",
  threshold: (seed, p, size) =>
    0.65 * noise(seed, p.x / size, p.z / size) + 0.35 * noise(seed + 17, p.x / (size * 0.43), p.z / (size * 0.43))
};
