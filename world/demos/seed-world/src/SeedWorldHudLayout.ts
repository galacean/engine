/** Shared square reference canvas for the voice and camera HUD. */
export const HUD_REFERENCE_SHORT_SIDE = 720;

/** UI units to pixels; pass CSS or backbuffer dimensions for the desired space. */
export function resolveSeedWorldHudScale(width: number, height: number): number {
  return Math.max(Math.min(width, height), 1) / HUD_REFERENCE_SHORT_SIDE;
}
