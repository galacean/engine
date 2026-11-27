import types from "@galacean/engine-world-planning/planning-data/animal-types.json";
import type {
  SeedWorldAnimalCatalogEntry,
  SeedWorldAnimalCatalogQuery
} from "../../../../agent-adapter/ports/SeedWorldAnimalService.ts";

/** Search content metadata even while disabled; this module has no renderer, GLB or simulation imports. */
export function querySeedAnimalCatalog(input: SeedWorldAnimalCatalogQuery = {}) {
  const search = input.search?.trim().toLocaleLowerCase();
  const matches = (types as SeedWorldAnimalCatalogEntry[]).filter(
    (entry) =>
      (!input.pack || entry.pack === input.pack) &&
      (!search ||
        [entry.typeId, entry.label, ...entry.aliases].some((value) => value.toLocaleLowerCase().includes(search)))
  );
  const offset = Math.max(0, input.offset ?? 0),
    limit = Math.min(100, Math.max(1, input.limit ?? 50));
  return {
    summary: { scope: "all-matches" as const, unit: "model-type" as const, total: matches.length,
      speciesCount: new Set(matches.map(e => e.speciesId)).size,
      appearanceCount: matches.reduce((n, e) => n + e.appearances.length, 0),
      returned: matches.slice(offset, offset + limit).length, hasMore: offset + limit < matches.length },
    entries: structuredClone(matches.slice(offset, offset + limit)),
    matchedCount: matches.length,
    offset,
    ...(offset + limit < matches.length ? { nextOffset: offset + limit } : {})
  };
}

/** Shared identity mapping; model variants do not define distinct biological species. */
export function seedAnimalSpeciesId(typeId: string): string {
  const entry = types.find(e => e.typeId === typeId);
  if (!entry) throw new Error(`Unregistered animal type: ${typeId}`);
  return entry.speciesId;
}
