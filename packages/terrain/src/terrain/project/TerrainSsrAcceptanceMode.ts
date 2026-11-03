export const TERRAIN_SSR_ACCEPTANCE_QUERY_PARAMETER = "ssr-acceptance";

/** Explicit opt-in for the deterministic five-renderer SSR acceptance target. */
export function isTerrainSsrAcceptanceEnabled(search: string): boolean {
  return new URLSearchParams(search).get(TERRAIN_SSR_ACCEPTANCE_QUERY_PARAMETER) === "1";
}
