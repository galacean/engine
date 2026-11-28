/** Engine-free planting entry: content, domain, application and confirmed render state. */
export * from "./domain/index";
export * from "./application/index";
export { createPlantingCatalog, type PlantingCatalog } from "./content/PlantingCatalog";
export { createPlantGrowthRegistry, type PlantGrowthPack } from "./procedural/core/PlantGrowthRegistry";
export { createPlantRenderState, cropRenderState, type PlantRenderState } from "./presentation/PlantRenderState";
export type { PlantGrowthDefinition } from "./procedural/core/PlantGrowthDefinition";
export type { PlantGrowthRecipeDocument } from "./procedural/core/PlantLeafTemplate";
export type { PlantShape } from "./procedural/core/PlantGrowthRecipe";
