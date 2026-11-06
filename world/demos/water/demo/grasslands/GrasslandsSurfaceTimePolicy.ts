import { isShowcaseAutomation } from "../showcase/ShowcaseCameraPolicy.ts";
import { HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS } from "@galacean/engine-water/water/runtime/heightfield/config";

export const GRASSLANDS_FIXED_SURFACE_TIME = 12.5;

export function resolveGrasslandsSurfaceTimeOverride(search: Pick<URLSearchParams, "get">): number | undefined {
  return isShowcaseAutomation(search) ? GRASSLANDS_FIXED_SURFACE_TIME : undefined;
}

export function resolveGrasslandsSurfaceTimeReadback(
  override: number | undefined,
  engineElapsedTime: number | undefined
): number {
  const selected = override ?? engineElapsedTime;
  if (!Number.isFinite(selected)) return -1;
  return Math.max(selected ?? 0, 0) % HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS;
}
