import type { Engine } from "@galacean/engine";

export const PLANT_PROJECT_ROOT = "World/Vegetation/";
export const PLANT_PROJECT_CATALOG = `${PLANT_PROJECT_ROOT}plant-species.json`;
export const PLANT_PROJECT_APPEARANCE = `${PLANT_PROJECT_ROOT}meadow-plant-materials.json`;
export const PLANT_PROJECT_PRODUCTION = `${PLANT_PROJECT_ROOT}production-catalog.json`;
const projectEngines = new WeakSet<Engine>();
export interface PlantProjectResources {
  catalog: string;
  appearance: string;
  production: string;
}
export const DEFAULT_PLANT_PROJECT_RESOURCES: PlantProjectResources = {
  catalog: PLANT_PROJECT_CATALOG,
  appearance: PLANT_PROJECT_APPEARANCE,
  production: PLANT_PROJECT_PRODUCTION
};
const projectReferences = new WeakMap<Engine, PlantProjectResources>();

/** The application registers project resources before opening any plant consumer. */
export function useProjectPlantResources(engine: Engine, references = DEFAULT_PLANT_PROJECT_RESOURCES): void {
  projectEngines.add(engine);
  projectReferences.set(engine, { ...references });
}
export function usesProjectPlantResources(engine: Engine): boolean {
  return projectEngines.has(engine);
}
export function plantProjectResources(engine: Engine): PlantProjectResources {
  return projectReferences.get(engine) ?? DEFAULT_PLANT_PROJECT_RESOURCES;
}

export function resolvePlantResourceReference(file: string, base: string): string {
  return /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(base) ? new URL(file, new URL(base, location.href)).href : file;
}

/** Browser resource resolution stays separate from the catalog consumed by
 * pure planning, authoring contracts and command-line tooling. */
export function plantSpeciesResourceUrl(file: string, engine?: Engine): string {
  if (engine && projectEngines.has(engine)) {
    const references = plantProjectResources(engine);
    if (file === "plant-species.json") return references.catalog;
    if (file === "meadow-plant-materials.json") return references.appearance;
    return file.includes("/") ? file : PLANT_PROJECT_ROOT + file;
  }
  return new URL(file, new URL("./generated/procedural-trees/plant-species.json", import.meta.url)).href;
}
