import { Loader } from "@galacean/engine";
import { AnimalComponent } from "./AnimalComponent";
import { AnimalSystemComponent } from "./AnimalSystemComponent";

export { AnimalComponent, type AnimalInstanceSettings } from "./AnimalComponent";
export { AnimalSystemComponent } from "./AnimalSystemComponent";
export { AnimalSystem, type AnimalAgent } from "./AnimalSystem";
export { ConfiguredAnimal } from "./ConfiguredAnimal";
export {
  AnimalAssetLibrary,
  type AnimalAssetReference,
  type LoadedAnimalAsset,
  type ResolvedAnimalAsset
} from "./AnimalAssetLibrary";
export { readAnimalInstanceDocument, type AnimalInstanceDocument } from "./AnimalInstanceDocument";
export {
  createAnimalPopulationConfig,
  planAnimalPopulation,
  validateAnimalPopulationConfig,
  type AnimalPopulationConfig,
  type AnimalPopulationType,
  type AnimalPopulationAppearance
} from "./AnimalPopulation";
export {
  readAnimalAssetCatalog,
  animalCollisionRadius,
  type AnimalAssetCatalog,
  type AnimalAssetConfig
} from "./AnimalAssetCatalog";
export { registerAnimalCatalog, type RegisteredAnimalCatalog } from "./RegisteredAnimalCatalog";
export { Animal, type AnimalDefinition, type AnimalMotion, type AnimalRoamingArea } from "./Animal";
export { readAnimalSpecies, scaleAnimalProfile } from "./AnimalSpeciesAsset";
export type { AnimalSpeciesDocument, AnimalCompanionProfile, AnimalLodProfile } from "./AnimalSpeciesAsset";
export type {
  AnimalCommand,
  AnimalHost,
  AnimalGround,
  AnimalRideInput,
  AnimalReceipt,
  AnimalSnapshot
} from "./AnimalTypes";

/** Register standard Scene/Prefab Script keys before loading an authored animal Scene. */
export function registerAnimalComponents(): void {
  Loader.registerClass("/Script/AnimalComponent.ts", AnimalComponent);
  Loader.registerClass("/Script/AnimalSystemComponent.ts", AnimalSystemComponent);
}
