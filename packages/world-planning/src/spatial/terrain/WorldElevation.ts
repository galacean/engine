import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
/** A world-scale directional height intent, independent of any POI or rock. */
export interface WorldElevation {
  riseM: number;
  directionDegrees: number;
  transition: number;
}
/** Evaluate a broad smooth ramp. North is map -Z, east is +X; 45 degrees raises the northeast. */
export function worldElevationField(
  q: Partial<WorldElevation> | undefined,
  width: number,
  depth: number
): (p: PlanPoint) => number {
  if (!q) return () => 0;
  const config = { riseM: 0, directionDegrees: 45, transition: 1, ...q };
  if (config.riseM === 0) return () => 0;
  if (
    ![config.riseM, config.directionDegrees, config.transition].every(Number.isFinite) ||
    config.riseM < 0 ||
    config.riseM > 160 ||
    config.transition < 0.2 ||
    config.transition > 1
  )
    throw Error("全局海拔参数无效");
  const angle = (config.directionDegrees * Math.PI) / 180,
    x = Math.sin(angle),
    z = -Math.cos(angle),
    span = Math.abs(x) * width + Math.abs(z) * depth;
  return (p) => {
    const projected = 0.5 + ((p.x - width / 2) * x + (p.z - depth / 2) * z) / span,
      t = Math.max(0, Math.min(1, (projected - (1 - config.transition) / 2) / config.transition));
    return config.riseM * (0.5 - 0.5 * Math.cos(Math.PI * t));
  };
}
