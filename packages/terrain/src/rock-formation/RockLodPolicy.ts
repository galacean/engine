/** Projected LOD0 reference size as a fraction of viewport height. */
export const ROCK_LOD_SCREEN_HEIGHTS = [0.22, 0.08] as const;

/**
 * Applies shared mesh-switch thresholds to a rock with two or three render meshes.
 * @param authored Minimum screen heights from the asset. The last value is its visibility cutoff.
 * @returns Screen thresholds from highest to lowest detail, including the terminal cutoff.
 * @remarks Visibility remains owned by the asset category. Unrecognized LOD chains keep their authored policy.
 */
export function rockLodScreenHeights(authored: readonly number[]): readonly number[] {
  if (authored.length !== 2 && authored.length !== 3) return authored;
  const switches = ROCK_LOD_SCREEN_HEIGHTS.slice(0, authored.length - 1);
  const cutoff = Math.min(authored[authored.length - 1], switches[switches.length - 1] * 0.5);
  return [...switches, cutoff];
}
