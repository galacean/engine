import animals from "../../planning-data/animals/assets.json";
import registrations from "../../planning-data/animals/registrations.json";
import behaviorConfiguration from "../../planning-data/animal-behaviors.json";
import calibration from "../../planning-data/animal-calibration.json";
import type { AnimalAssetCatalog } from "@galacean/engine-animals/gameplay/animal/AnimalAssetCatalog";
import type { AnimalRegistrationCatalog } from "@galacean/engine-animals/gameplay/animal/AnimalRegistration";

/** Remote content only. Both packs share the same authored standing-height measurement and metre scale. */
export const seedAnimalCatalog: AnimalAssetCatalog = {
  version: 1,
  animals: (animals as AnimalAssetCatalog).animals
    .map((animal) => {
      const sizing = calibration.models[animal.id as keyof typeof calibration.models];
      if (!sizing) throw new Error(`Missing Seed animal size calibration: ${animal.id}`);
      // Resolve authored metre heights once; native movement and collision consume the same instance scale.
      return { ...animal, scale: sizing.standingHeightMeters / sizing.sourceHeightMeters };
    })
};

/** Source clip meanings plus Seed-owned, capability-filtered behavior policies; imported only when enabled. */
export const seedAnimalRegistrations = structuredClone(registrations) as unknown as AnimalRegistrationCatalog;
for (const [id, species] of Object.entries(seedAnimalRegistrations.species)) {
  const ecology = behaviorConfiguration.ecology[id as keyof typeof behaviorConfiguration.ecology];
  if (!ecology) throw new Error(`Missing Seed animal ecology: ${id}`);
  const profileId = ecology.profile;
  const autonomy = behaviorConfiguration.profiles[profileId as keyof typeof behaviorConfiguration.profiles];
  if (!autonomy) throw new Error(`Missing Seed animal behavior profile: ${id}`);
  Object.assign(species, {
    habitats: ecology.habitats,
    preferredMedium: ecology.preferredMedium,
    fleeWeights: ecology.fleeWeights,
    fleeSpeedMultiplier: "fleeSpeedMultiplier" in ecology ? ecology.fleeSpeedMultiplier : 1,
    autonomy,
    provenance: behaviorConfiguration.note
  });
}
