import {
  animalSemanticLabel,
  compileAnimalRegistration,
  readAnimalRegistrations,
  type AnimalRegistrationCatalog
} from "./AnimalRegistration";
import type { AnimalAssetConfig } from "./AnimalAssetCatalog";
import type { AnimalBehaviorCatalog } from "./AnimalBehaviorCatalog";

/** Validated registration data and executable profiles for the currently loaded asset package. */
export interface RegisteredAnimalCatalog {
  registrations: AnimalRegistrationCatalog;
  behaviors: AnimalBehaviorCatalog;
}

/**
 * Bind a package through the shared enum/config compiler and annotate its inspection UI.
 * @param source Application-authored registration JSON, separate from the original GLBs.
 * @param animals Validated asset configurations; labels and behavior profile references are updated in place.
 * @returns Complete detached registration and validated behavior recipes.
 */
export function registerAnimalCatalog(source: unknown, animals: AnimalAssetConfig[]): RegisteredAnimalCatalog {
  const registrations = readAnimalRegistrations(source, animals);
  const behaviors: AnimalBehaviorCatalog = { version: 1, profiles: {} };
  for (const model of registrations.models) {
    const asset = animals.find((a) => a.id === model.assetId)!;
    asset.behaviorProfile = `registered:${asset.id}`;
    behaviors.profiles[asset.behaviorProfile] = compileAnimalRegistration(
      registrations.species[model.species],
      model,
      asset
    );
    for (const binding of asset.animations) binding.label = animalSemanticLabel(model.animations[binding.id]);
  }
  return { registrations, behaviors };
}
