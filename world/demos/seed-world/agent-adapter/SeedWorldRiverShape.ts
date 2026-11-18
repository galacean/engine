import type { PlanPoint } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { settlementRandom } from "@galacean/engine-world-planning/semantic-study/SettlementGeometry";

/** Sample progressively gentler curves around a fixed chord. The chord midpoint
 * identifies the site on a one-metre grid, independent of the placement search order.
 */
export function* seedWorldRiverCenterlines(
  seed: number,
  center: PlanPoint,
  forward: readonly [number, number],
  length: number
): Generator<PlanPoint[]> {
  const site = `authored-river:${Math.round(center.x)}:${Math.round(center.z)}`;
  const shape = Math.floor(settlementRandom(seed, `${site}:shape`) * 3);
  const skew = (settlementRandom(seed, `${site}:skew`) < 0.5 ? -1 : 1)
    * (0.45 + 0.35 * settlementRandom(seed, `${site}:skew-strength`));
  const inflectionShift = 0.95 * (2 * settlementRandom(seed, `${site}:inflection`) - 1);
  const direction = settlementRandom(seed, `${site}:direction`) < 0.5 ? -1 : 1;
  const amplitude = length * (0.05 + 0.075 * settlementRandom(seed, `${site}:amplitude`)) * direction;
  const [fx, fz] = forward;
  const sample = (bend: (t: number) => number) => Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    const across = length * (t - 0.5);
    const along = index === 0 || index === 8 ? 0 : bend(t);
    return { x: center.x + fx * along - fz * across, z: center.z + fz * along + fx * across };
  });
  const profiles = [
    (t: number) => Math.sin(Math.PI * t),
    (t: number) => Math.sin(Math.PI * (t + skew * t * (1 - t))),
    (t: number) => 0.22 * Math.sin(Math.PI * t)
      + 0.78 * Math.sin(2 * Math.PI * (t + inflectionShift * t * (1 - t)))
  ];
  const profile = profiles[shape];
  yield sample(t => amplitude * profile(t));
  yield sample(t => amplitude * 0.5 * profile(t));
  // A tight site can still take a shallow bend in either direction.
  yield sample(t => amplitude * 0.25 * Math.sin(Math.PI * t));
  yield sample(t => -amplitude * 0.25 * Math.sin(Math.PI * t));
}
