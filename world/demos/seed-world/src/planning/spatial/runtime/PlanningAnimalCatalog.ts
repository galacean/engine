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
    entries: structuredClone(matches.slice(offset, offset + limit)),
    matchedCount: matches.length,
    offset,
    ...(offset + limit < matches.length ? { nextOffset: offset + limit } : {})
  };
}
