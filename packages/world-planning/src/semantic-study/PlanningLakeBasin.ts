import type { PlanPoint } from "./IslandPlanModel";

/** Grid-aligned capture of a basin outline; identical to the domain resolved for shoreline compilation. */
export function planningLakeCaptureExtent(
  origin: readonly [number, number],
  spacing: number,
  spacingZ: number,
  columns: number,
  rows: number,
  outline: readonly PlanPoint[]
): readonly [number, number, number, number] {
  const x0 = Math.max(0, Math.floor((Math.min(...outline.map((point) => point.x)) - origin[0]) / spacing));
  const z0 = Math.max(0, Math.floor((Math.min(...outline.map((point) => point.z)) - origin[1]) / spacingZ));
  const x1 = Math.min(columns - 1, Math.ceil((Math.max(...outline.map((point) => point.x)) - origin[0]) / spacing));
  const z1 = Math.min(rows - 1, Math.ceil((Math.max(...outline.map((point) => point.z)) - origin[1]) / spacingZ));
  return [origin[0] + x0 * spacing, origin[1] + z0 * spacingZ, origin[0] + x1 * spacing, origin[1] + z1 * spacingZ];
}
