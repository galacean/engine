/** Addressed vegetation randomness shared by placement and regional composition. */
export function vegetationRank(seed: number, key: string): number {
  return vegetationRankFromHash(vegetationKeyHash(seed, key), "");
}

/** Unfinalized address hash; reuse it for independent properties of the same candidate. */
export function vegetationKeyHash(seed: number, key: string): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Exactly matches vegetationRank(seed, address + suffix), without rehashing address. */
export function vegetationRankFromHash(h: number, suffix: string): number {
  for (let i = 0; i < suffix.length; i++) h = Math.imul(h ^ suffix.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Sample an exchangeable species composition, uniformly over the probability simplex.
 * Independent exponential variates normalize to Dirichlet(1,...,1), so no species
 * names, preferred ratios or arbitrary abundance thresholds enter the algorithm.
 * Addressed streams make catalog ordering and other scopes independent.
 */
export function sampleLandscapeSpeciesWeights(
  seed: number,
  scopeId: string,
  assetIds: readonly string[]
): Record<string, number> {
  if (!Number.isFinite(seed) || !scopeId || new Set(assetIds).size !== assetIds.length || assetIds.some((id) => !id))
    throw new Error("Invalid vegetation species composition input");
  const weights = [...assetIds].sort().map((id) => {
    // rank is a 32-bit discrete uniform sample; use its bin centre to avoid log(0).
    const uniform = vegetationRank(seed, `vegetation-species:${JSON.stringify([scopeId, id])}`) + 0.5 / 2 ** 32;
    return [id, -Math.log1p(-uniform)] as const;
  });
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  return Object.fromEntries(weights.map(([id, weight]) => [id, weight / total]));
}
