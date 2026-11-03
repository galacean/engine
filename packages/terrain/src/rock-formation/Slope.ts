import { hashSeed, random } from "./math";
import type { RockObb } from "./types";

export const DEFAULT_ROCK_SLOPE_VARIATION = 0.2;

/** Lab rise/run baseline: height divided by the shorter footprint half-span. */
export function automaticSlopeRate(size: readonly number[]): number {
  if (size.length !== 3 || !size.every((value) => Number.isFinite(value) && value > 0))
    throw new Error("Slope baseline requires positive finite OBB dimensions");
  return (2 * size[1]) / Math.min(size[0], size[2]);
}

/** Seed only the slope stream; outlines, face samples and upper heights stay fixed. */
export function rockFaceSlopeRate(obb: RockObb, seed: number): (sample: number) => number {
  const mode = obb.slopeMode ?? "auto",
    variation = obb.slopeVariation ?? DEFAULT_ROCK_SLOPE_VARIATION;
  if (mode !== "auto" && mode !== "manual") throw new Error("Unknown rock slope mode");
  if (!Number.isFinite(variation) || variation < 0 || variation > 1)
    throw new Error("Slope variation must be between 0 and 1");
  if (obb.slopeRate !== undefined && (!Number.isFinite(obb.slopeRate) || obb.slopeRate <= 0))
    throw new Error("Manual slope rate must be positive and finite");
  const up = obb.axes[1],
    minimum = Math.hypot(up[0], up[2]) / up[1] + 0.07;
  if (!Number.isFinite(minimum) || up[1] <= 0) throw new Error("Slope requires an upward OBB axis");
  const base = mode === "manual" && obb.slopeRate !== undefined ? obb.slopeRate : automaticSlopeRate(obb.size);
  const boxSample = random(hashSeed(seed, `${obb.id}/slope-rate/v1`))() * 2 - 1;
  const seededBase = mode === "auto" ? base * 2 ** (boxSample * variation) : base;
  return (sample) => {
    // Automatic rates use the lab's scale-independent exponential variation.
    // Manual rates retain linear variation without the lab UI's legacy 12 ceiling.
    const rate = Math.max(minimum, seededBase * (mode === "auto" ? 2 ** (sample * variation) : 1 + sample * variation));
    if (!Number.isFinite(rate)) throw new Error("Slope rate exceeds finite numeric range");
    return rate;
  };
}
