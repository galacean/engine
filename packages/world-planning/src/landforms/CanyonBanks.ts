import type { AtomKind } from "./RockAtoms";
import type { PlanPoint } from "../semantic-study/IslandPlanModel";
/** Metric bank composition shared with landform-atlas: opening, staggered throat,
 * release, alternating outward supports and a lower terrace on one bank.
 * @param options Continuous guide and metric dimensions; no assets or world placement.
 * @returns Atom placements in guide coordinates. Height scales precede role-specific profiles.
 */
export function composeCanyonBanks(options: {
  lengthM: number;
  pitchM: number;
  spreadM: number;
  variation: number;
  bankWidthM?: number;
  frame(t: number): { position: PlanPoint; yaw: number };
}) {
  const count = Math.max(2, Math.ceil(options.lengthM / options.pitchM)),
    step = options.lengthM / count;
  const result: {
    kind: AtomKind;
    center: PlanPoint;
    yaw: number;
    width: number;
    depth: number;
    heightScale: number;
    side: number;
    t: number;
  }[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count,
      { position: pos, yaw } = options.frame(t);
    const gap =
      options.spreadM *
      (1.4 - 0.8 * Math.exp(-Math.pow((t - 0.46) / 0.15, 2)) + 0.35 * Math.exp(-Math.pow((t - 0.8) / 0.18, 2)));
    for (const side of [-1, 1]) {
      const depth =
        (options.bankWidthM === undefined ? step : options.bankWidthM / 0.65) *
        (0.65 + 0.25 * Math.sin(t * Math.PI + side));
      const setback = gap / 2 + depth / 2 + step * 0.12 * Math.sin(i * 1.8 + side);
      const center = { x: pos.x - Math.sin(yaw) * setback * side, z: pos.z + Math.cos(yaw) * setback * side };
      const heightScale =
        (side === 1 ? 0.82 : 1) *
        (1 - options.variation * 0.55 + options.variation * 0.55 * Math.cos((i + side) * 1.7));
      result.push({ kind: "wall", center, yaw, width: step * 1.2, depth, heightScale, side, t });
      if (i % 2 === (side === 1 ? 0 : 1))
        result.push({
          kind: "buttress/shoulder",
          center: {
            x: center.x - Math.sin(yaw) * depth * 0.65 * side,
            z: center.z + Math.cos(yaw) * depth * 0.65 * side
          },
          yaw: yaw - (side * Math.PI) / 2,
          width: depth * 1.7,
          depth: step * 1.1,
          heightScale: 0.9,
          side,
          t
        });
      if (side === 1 && t > 0.65 && t < 0.85)
        result.push({ kind: "terrace/cap", center, yaw, width: step, depth: depth * 1.35, heightScale: 0.55, side, t });
    }
  }
  return result;
}
