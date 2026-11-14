import { validateAnimalTaskProfile, type AnimalTaskProfile } from "./AnimalTaskController";
import type { AnimalAssetConfig } from "./AnimalAssetCatalog";

/** Application-owned registrations, shared by models using the same authored animation family. */
export interface AnimalBehaviorCatalog {
  version: 1;
  profiles: Record<string, AnimalTaskProfile>;
}

/**
 * Validate every asset's named registration against its actual configured clips before instantiation.
 * @param source Parsed behavior catalog, independent of GLB loading.
 * @param animals Validated asset bindings.
 * @returns Borrowed registrations; instances must clone recipes before execution.
 */
export function readAnimalBehaviorCatalog(source: unknown, animals: AnimalAssetConfig[]): AnimalBehaviorCatalog {
  const document = source as AnimalBehaviorCatalog;
  if (document?.version !== 1 || !document.profiles) throw new Error("Invalid animal behavior catalog");
  for (const animal of animals) {
    const profile = document.profiles[animal.behaviorProfile];
    if (!profile) throw new Error(`Missing animal behavior registration: ${animal.behaviorProfile}`);
    validateAnimalTaskProfile(profile, new Set(animal.animations.map((binding) => binding.id)));
  }
  return document;
}
