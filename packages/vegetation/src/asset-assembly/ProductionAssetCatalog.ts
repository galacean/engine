/** One immutable production catalog selectable by the Asset Assembly page. */
export interface ProductionAssetCatalogV1 {
  /** Stable catalog identity owned by the World build. */
  readonly id: string;
  /** Globally versioned identity serialized by Population Tokens. */
  readonly tokenCatalogId: string;
  /** Human-readable style label. */
  readonly label: string;
  /** Standard Project whose Material and Shader resources are authoritative for every Prefab. */
  readonly projectUrl: string;
  /** Generated manifest containing real source atoms and authored assembly data. */
  readonly manifestUrl: string;
}

/** Real production catalogs available in this build; synthetic selector fixtures are forbidden. */
export const PRODUCTION_ASSET_CATALOGS: readonly ProductionAssetCatalogV1[] = [
  {
    id: "cartoon",
    tokenCatalogId: "cartoon/catalog/v1",
    label: "Cartoon",
    // Asset Assembly keeps Grasslands as its broad authoring source while consuming the separately published atoms.
    projectUrl: new URL("../../../terrain/src/data/grasslands/project.json", import.meta.url).href,
    manifestUrl: new URL("../../../terrain/src/data/seed-world/public/production-catalog.json", import.meta.url).href
  }
] as const;

export { SEED_WORLD_PRODUCTION_ASSET_CATALOG } from "./SeedWorldProductionAssetCatalog";

/**
 * Resolves a production catalog selected by the page shell.
 * @param catalogId Stable catalog identifier.
 * @returns Matching immutable registration.
 * @throws If the current build does not contain that real catalog.
 */
export function resolveProductionAssetCatalog(catalogId: string): ProductionAssetCatalogV1 {
  const registration = PRODUCTION_ASSET_CATALOGS.find((catalog) => catalog.id === catalogId);
  if (!registration) throw new Error(`Production asset catalog "${catalogId}" is not registered`);
  return registration;
}
