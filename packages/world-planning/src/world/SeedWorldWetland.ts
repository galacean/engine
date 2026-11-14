/** Extra expansion beyond the authored water width before wetland qualification. */
export const SEED_WORLD_WETLAND_BANK_EXPANSION_METRES = 0;
/** Half-width of the continuous wetland material transition. */
export const SEED_WORLD_WETLAND_SDF_TRANSITION_METRES = 10;
/** Maximum mountain uplift at which the categorical ecology preview labels wetland. */
export const SEED_WORLD_WETLAND_MAXIMUM_MOUNTAIN_UPLIFT_METRES = 24;

/**
 * Samples the canonical continuous wetland influence used by planning and surface compilation.
 * @param bankDistanceMetres Signed distance to the authored water bank, negative inside.
 * @param transitionMetres Local dry-bank feather in metres.
 * @returns Wetland influence in the inclusive range 0–1.
 */
export function sampleSeedWorldWetlandInfluence(
  bankDistanceMetres: number,
  transitionMetres = SEED_WORLD_WETLAND_SDF_TRANSITION_METRES
): number {
  const wetlandSignedDistanceMetres = sampleSeedWorldWetlandSignedDistanceMetres(bankDistanceMetres);
  const wetlandSdf = 1 - smoothstep(-transitionMetres, transitionMetres, wetlandSignedDistanceMetres);
  return wetlandSdf;
}

/**
 * Samples signed metres to the habitat-qualified wetland boundary.
 * @param bankDistanceMetres Signed distance to the canonical water bank.
 * @returns Negative values inside the wetland, zero on its continuous boundary, and positive values outside.
 */
export function sampleSeedWorldWetlandSignedDistanceMetres(bankDistanceMetres: number): number {
  return bankDistanceMetres;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
}
