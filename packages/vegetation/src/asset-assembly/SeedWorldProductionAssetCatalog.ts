import type { ProductionAssetCatalogV1 } from "./ProductionAssetCatalog";

/** Seed World catalog registration backed only by its dedicated runtime Project closure. */
export const SEED_WORLD_PRODUCTION_ASSET_CATALOG: ProductionAssetCatalogV1 = Object.freeze({
  id: "cartoon",
  tokenCatalogId: "cartoon/catalog/v1",
  label: "Cartoon",
  projectUrl: new URL("../../../terrain/src/data/seed-world/project.json", import.meta.url).href,
  manifestUrl: new URL("../../../terrain/src/data/seed-world/public/production-catalog.json", import.meta.url).href
});
