let selection: { id: string; seed: number } | undefined;

export function randomPlanningSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** A shared URL keeps its Seed. A new entry gets a Seed before the world is opened. */
export function planningStartupSeed(query: URLSearchParams): number {
  const raw = query.get("seed");
  if (raw !== null && /^\d+$/.test(raw) && Number(raw) <= 0xffffffff) return Number(raw);
  return randomPlanningSeed();
}

/** Remember an explicit launch selection for this page lifetime only.
 * @param id Registered theme, or empty for the original world.
 * @param seed Selected world identity.
 */
export function selectPlanningStartupTemplate(id: string, seed: number): void {
  selection = { id, seed };
}

export function selectedPlanningStartupTemplate(): { id: string; seed: number } | undefined {
  return selection;
}
