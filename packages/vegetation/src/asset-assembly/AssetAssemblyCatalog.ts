import {
  PopulationLodMetric,
  type AssetCategory,
  type PopulationLodProfileV1
} from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import type { ProductionAssetCatalogV1 } from "./ProductionAssetCatalog";
import type { TreeLeafMaskId } from "./AssetAssemblyPresetFactory";
import type {
  TreeRecipeSource,
  ProductionLodGroupProfile,
  AssetAssemblyWorldBounds
} from "./AssetAssemblySourceLibrary";

export interface GeneratedResourceManifest {
  readonly virtualPath: string;
  readonly path: string;
  readonly type: "GLTF" | "Prefab" | "Texture" | "KTX2" | "Material";
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface ProductionCatalogManifest {
  readonly version: 5;
  readonly id: string;
  readonly label: string;
  readonly generatedResources: readonly GeneratedResourceManifest[];
  readonly worldBounds: AssetAssemblyWorldBounds;
  readonly treeRecipes: readonly TreeRecipeManifest[];
  readonly treeLeafMasks: readonly TreeLeafMaskManifest[];
  readonly treeImpostor: AtomicManifest;
  readonly shrub: ShrubManifest;
  readonly grass: AtomicManifest;
  readonly grassVariants: readonly AtomicManifest[];
  readonly flower: AtomicManifest;
  readonly flowerVariants: readonly AtomicManifest[];
  readonly largeRockGrassVariants: readonly AtomicLodManifest[];
  readonly largeRockMudVariants: readonly AtomicLodManifest[];
  readonly featureRockVariants: readonly AtomicLodManifest[];
  readonly stoneVariants: readonly AtomicLodManifest[];
  readonly debris: AtomicLodManifest;
  readonly mushroom: AtomicLodManifest;
  readonly lotusVariants: readonly AtomicLodManifest[];
  readonly rock: AtomicLodManifest;
}

export interface TreeRecipeManifest {
  readonly id: string;
  readonly label: string;
  readonly sourceKind: TreeRecipeSource["sourceKind"];
  readonly proceduralProfile: TreeRecipeSource["proceduralProfile"];
  readonly size: number;
  readonly defaultColorRgb: readonly [number, number, number];
  readonly defaultLodProfile: PopulationLodProfileV1;
  readonly trunkMaterial: string;
  readonly leafMaterial: string;
  readonly leafMask: string;
  readonly lodGroup: ProductionLodGroupProfile;
  readonly proceduralGate?: TreeRecipeSource["proceduralGate"];
}

export interface TreeLeafMaskManifest {
  readonly id: TreeLeafMaskId;
  readonly label: string;
  readonly texture: string;
}

export interface ShrubManifest {
  readonly id: string;
  readonly label: string;
  readonly defaultColorRgb: readonly [number, number, number];
  readonly defaultLodProfile: PopulationLodProfileV1;
  readonly lods: readonly [ShrubLodManifest, ShrubLodManifest];
  readonly lodGroup: ProductionLodGroupProfile;
}

export interface ShrubLodManifest {
  readonly prefabUrl: string;
  readonly leafCount: number;
}

export interface AtomicManifest {
  readonly id: string;
  readonly label?: string;
  readonly prefabUrl: string;
  readonly defaultColorRgb?: readonly [number, number, number];
  readonly defaultLodProfile?: PopulationLodProfileV1;
  readonly selectionWeight?: number;
}

export interface AtomicLodManifest {
  readonly id: string;
  readonly label: string;
  readonly lods: readonly { readonly prefabUrl: string }[];
  readonly defaultColorRgb: readonly [number, number, number];
  readonly selectionWeight?: number;
  readonly defaultLodProfile: PopulationLodProfileV1;
  readonly lodGroup: ProductionLodGroupProfile;
}

export function validateManifest(value: unknown, registration: ProductionAssetCatalogV1): ProductionCatalogManifest {
  if (!value || typeof value !== "object") throw new Error("Production asset catalog must be an object");
  const manifest = value as Partial<ProductionCatalogManifest>;
  if (
    manifest.version !== 5 ||
    manifest.id !== registration.id ||
    manifest.label !== registration.label ||
    !validWorldBounds(manifest.worldBounds) ||
    !validGeneratedResources(manifest.generatedResources, registration.id)
  ) {
    throw new Error("Production asset catalog identity or Project resource contract is unsupported");
  }
  const catalog = manifest as ProductionCatalogManifest;
  if (!Array.isArray(catalog.treeRecipes) || catalog.treeRecipes.length < 2) {
    throw new Error("Production asset catalog must provide multiple real tree recipes");
  }
  if (!validTreeLeafMasks(catalog.treeLeafMasks, registration.id)) {
    throw new Error("Production asset catalog tree leaf-mask library is invalid");
  }
  const generatedTextureUrls = new Set(
    catalog.generatedResources
      .filter((resource) => resource.type === "Texture" || resource.type === "KTX2")
      .map((resource) => resource.virtualPath)
  );
  if (catalog.treeLeafMasks.some((source) => !generatedTextureUrls.has(source.texture))) {
    throw new Error("Production asset catalog tree leaf masks must resolve generated Texture resources");
  }
  if (
    catalog.generatedResources.some(
      (resource) =>
        ["GLTF", "Prefab"].includes(resource.type) &&
        /(?:^|\/)[^/]*(?:trunk|crown)\.(?:glb|prefab)$/u.test(resource.path)
    )
  ) {
    throw new Error("Production asset catalog must not package procedural tree trunk or crown geometry");
  }
  const treeLeafMaskUrls = new Set(catalog.treeLeafMasks.map((source) => source.texture));
  for (const recipe of catalog.treeRecipes) validateTreeRecipe(recipe, registration.id, treeLeafMaskUrls);
  requireUniqueIds(
    catalog.treeRecipes.map((recipe) => recipe.id),
    "tree recipe"
  );
  if (!validAtomic(catalog.treeImpostor, "tree", registration.id) || !validShrub(catalog.shrub, registration.id)) {
    throw new Error("Production asset catalog tree impostor or shrub contract is invalid");
  }
  if (
    !validAtomic(catalog.grass, "grass", registration.id) ||
    !validAtomicFamily(catalog.grassVariants, catalog.grass, "grass", registration.id) ||
    !validAtomic(catalog.flower, "flower", registration.id) ||
    !validAtomicFamily(catalog.flowerVariants, catalog.flower, "flower", registration.id) ||
    !validAtomicLodFamily(catalog.largeRockGrassVariants, "rock", registration.id) ||
    !validAtomicLodFamily(catalog.largeRockMudVariants, "rock", registration.id) ||
    !validAtomicLodFamily(catalog.featureRockVariants, "rock", registration.id) ||
    !validAtomicLodFamily(catalog.stoneVariants, "rock", registration.id) ||
    !validAtomicLods(catalog.debris, "rock", registration.id) ||
    !validAtomicLods(catalog.mushroom, "mushroom", registration.id) ||
    !validAtomicLodFamily(catalog.lotusVariants, "lotus", registration.id) ||
    !validAtomicLods(catalog.rock, "rock", registration.id)
  ) {
    throw new Error("Production asset catalog atomic vegetation contract is invalid");
  }
  const prefabResources = new Set(
    catalog.generatedResources.filter((resource) => resource.type === "Prefab").map((resource) => resource.virtualPath)
  );
  for (const prefabUrl of collectPrefabUrls(catalog)) {
    if (!prefabResources.has(prefabUrl)) throw new Error(`Production asset catalog does not declare ${prefabUrl}`);
  }
  return catalog;
}

function validateTreeRecipe(recipe: TreeRecipeManifest, catalogId: string, leafMaskUrls: ReadonlySet<string>): void {
  const proceduralGateIsValid =
    recipe.sourceKind === "authored-mesh"
      ? recipe.proceduralGate === undefined
      : validTreeProceduralGate(recipe.proceduralGate);
  if (
    !validCatalogId(recipe.id, "tree", catalogId) ||
    typeof recipe.label !== "string" ||
    !Number.isFinite(recipe.size) ||
    recipe.size <= 0 ||
    !validRgb(recipe.defaultColorRgb) ||
    !validLodProfile(recipe.defaultLodProfile, 3, PopulationLodMetric.InstanceCount) ||
    !["grasslands-modular", "authored-mesh"].includes(recipe.sourceKind) ||
    !["small-maple", "white-birch"].includes(recipe.proceduralProfile) ||
    !validTreeMaterialUrl(recipe.trunkMaterial, "Surface") ||
    !validTreeMaterialUrl(recipe.leafMaterial, "Vegetation") ||
    !leafMaskUrls.has(recipe.leafMask) ||
    !validLodGroupProfile(recipe.lodGroup, 3) ||
    !proceduralGateIsValid
  ) {
    throw new Error("Production asset catalog contains an invalid tree recipe");
  }
}

function validTreeProceduralGate(gate: TreeRecipeSource["proceduralGate"]): boolean {
  return Boolean(
    gate?.status === "failed" &&
      gate.generator === "hierarchical-skeleton-v1" &&
      gate.evaluatedViews === 3 &&
      Number.isInteger(gate.candidateLeafCount) &&
      Number.isInteger(gate.authoredLeafCount) &&
      gate.authoredLeafCount > 0 &&
      Number.isFinite(gate.retainedRatio) &&
      gate.retainedRatio > 0 &&
      gate.retainedRatio < 1 &&
      Array.isArray(gate.perLod) &&
      gate.perLod.length === 3 &&
      gate.perLod.every(validProceduralLodGate) &&
      Array.isArray(gate.failedMetrics) &&
      gate.failedMetrics.length > 0
  );
}

function validProceduralLodGate(gate: NonNullable<TreeRecipeSource["proceduralGate"]>["perLod"][number]): boolean {
  return Boolean(
    gate &&
      Number.isInteger(gate.lod) &&
      gate.lod >= 0 &&
      gate.lod < 3 &&
      Number.isInteger(gate.candidateLeafCount) &&
      gate.candidateLeafCount > 0 &&
      Number.isInteger(gate.authoredLeafCount) &&
      gate.authoredLeafCount > 0 &&
      Number.isInteger(gate.branchSegments) &&
      gate.branchSegments > 0 &&
      [
        gate.maxCrownExtentErrorPercent,
        gate.maxSpatialOccupancyErrorPercent,
        gate.triangleRatio,
        gate.transitionCoverageFloor
      ].every(Number.isFinite) &&
      gate.passed === false
  );
}

function validTreeLeafMasks(masks: readonly TreeLeafMaskManifest[] | undefined, catalogId: string): boolean {
  if (!Array.isArray(masks) || masks.length === 0) return false;
  const ids = new Set<string>();
  const urls = new Set<string>();
  return masks.every((mask) => {
    const valid = Boolean(
      mask &&
        typeof mask.id === "string" &&
        /^[a-z][a-z0-9-]*$/u.test(mask.id) &&
        typeof mask.label === "string" &&
        mask.label.length > 0 &&
        validGeneratedTextureUrl(mask.texture, catalogId) &&
        !ids.has(mask.id) &&
        !urls.has(mask.texture)
    );
    ids.add(mask.id);
    urls.add(mask.texture);
    return valid;
  });
}

function validTreeMaterialUrl(value: unknown, family: "Surface" | "Vegetation"): value is string {
  return typeof value === "string" && value.startsWith(`Material/${family}/`) && value.endsWith(".mat");
}

function validShrub(source: ShrubManifest | undefined, catalogId: string): boolean {
  return Boolean(
    source &&
      validCatalogId(source.id, "shrub", catalogId) &&
      validRgb(source.defaultColorRgb) &&
      validLodProfile(source.defaultLodProfile, source.lods?.length, PopulationLodMetric.InstanceCount) &&
      Array.isArray(source.lods) &&
      source.lods.length === 2 &&
      source.lods.every(
        (lod) =>
          validGeneratedPrefabUrl(lod?.prefabUrl, catalogId) && Number.isInteger(lod.leafCount) && lod.leafCount > 0
      ) &&
      validLodGroupProfile(source.lodGroup, source.lods.length)
  );
}

function validAtomic(source: AtomicManifest | undefined, category: AssetCategory, catalogId: string): boolean {
  return Boolean(
    source &&
      validCatalogId(source.id, category, catalogId) &&
      validGeneratedPrefabUrl(source.prefabUrl, catalogId) &&
      (category === "tree" || category === "shrub" || validRgb(source.defaultColorRgb)) &&
      (category === "tree" ||
        category === "shrub" ||
        (validLodProfile(source.defaultLodProfile, 1, PopulationLodMetric.CountPerCell) &&
          validSelectionWeight(source.selectionWeight)))
  );
}

function validAtomicFamily(
  variants: readonly AtomicManifest[] | undefined,
  primary: AtomicManifest,
  category: "grass" | "flower",
  catalogId: string
): boolean {
  return Boolean(
    Array.isArray(variants) &&
      variants.length > 0 &&
      variants[0]?.id === primary.id &&
      variants.every((variant) => validAtomic(variant, category, catalogId)) &&
      new Set(variants.map((variant) => variant.id)).size === variants.length
  );
}

function validAtomicLods(
  source: AtomicLodManifest | undefined,
  category: "rock" | "mushroom" | "lotus",
  catalogId: string
): boolean {
  return Boolean(
    source &&
      validCatalogFamilyId(source.id, category, catalogId) &&
      typeof source.label === "string" &&
      validRgb(source.defaultColorRgb) &&
      Array.isArray(source.lods) &&
      source.lods.length > 0 &&
      source.lods.every((lod) => validGeneratedPrefabUrl(lod?.prefabUrl, catalogId)) &&
      validLodProfile(source.defaultLodProfile, source.lods.length, PopulationLodMetric.InstanceCount) &&
      validLodGroupProfile(source.lodGroup, source.lods.length)
  );
}

function validAtomicLodFamily(
  sources: readonly AtomicLodManifest[] | undefined,
  category: "rock" | "mushroom" | "lotus",
  catalogId: string
): boolean {
  return Boolean(
    Array.isArray(sources) &&
      sources.length > 0 &&
      sources.every((source) => validAtomicLods(source, category, catalogId)) &&
      new Set(sources.map((source) => source.id)).size === sources.length
  );
}

function validLodProfile(
  profile: PopulationLodProfileV1 | undefined,
  lodCount: number | undefined,
  expectedMetric: PopulationLodMetric
): boolean {
  return Boolean(
    profile &&
      profile.metric === expectedMetric &&
      Array.isArray(profile.values) &&
      profile.values.length === lodCount &&
      profile.values.every((value) => Number.isInteger(value) && value >= 0)
  );
}

function validLodGroupProfile(profile: ProductionLodGroupProfile | undefined, lodCount: number): boolean {
  return Boolean(
    profile &&
      Array.isArray(profile.localReferencePoint) &&
      profile.localReferencePoint.length === 3 &&
      profile.localReferencePoint.every(Number.isFinite) &&
      Number.isFinite(profile.size) &&
      profile.size > 0 &&
      Array.isArray(profile.screenRelativeTransitionHeights) &&
      profile.screenRelativeTransitionHeights.length === lodCount &&
      profile.screenRelativeTransitionHeights.every(
        (height, index, heights) =>
          Number.isFinite(height) && height >= 0 && height <= 1 && (index === 0 || height < heights[index - 1])
      )
  );
}

function validGeneratedResources(
  resources: readonly GeneratedResourceManifest[] | undefined,
  catalogId: string
): boolean {
  if (!Array.isArray(resources) || resources.length === 0) return false;
  const virtualPaths = new Set<string>();
  return resources.every((resource) => {
    const valid =
      resource &&
      ["GLTF", "Prefab", "Texture", "KTX2", "Material"].includes(resource.type) &&
      typeof resource.virtualPath === "string" &&
      resource.virtualPath.startsWith(`AssetAssembly/${capitalize(catalogId)}/`) &&
      typeof resource.path === "string" &&
      resource.path.length > 0 &&
      !resource.path.startsWith("/") &&
      !resource.path.split("/").includes("..") &&
      !virtualPaths.has(resource.virtualPath);
    virtualPaths.add(resource.virtualPath);
    return Boolean(valid);
  });
}

export function productionCatalogReferences(manifest: ProductionCatalogManifest): string[] {
  return [
    ...new Set([
      ...collectPrefabUrls(manifest),
      ...manifest.treeLeafMasks.map((mask) => mask.texture),
      ...manifest.treeRecipes.flatMap((recipe) => [recipe.trunkMaterial, recipe.leafMaterial, recipe.leafMask])
    ])
  ];
}

function collectPrefabUrls(manifest: ProductionCatalogManifest): string[] {
  return [
    manifest.treeImpostor.prefabUrl,
    ...manifest.shrub.lods.map((lod) => lod.prefabUrl),
    ...manifest.grassVariants.map((variant) => variant.prefabUrl),
    ...manifest.flowerVariants.map((variant) => variant.prefabUrl),
    ...manifest.largeRockGrassVariants.flatMap((source) => source.lods.map((lod) => lod.prefabUrl)),
    ...manifest.largeRockMudVariants.flatMap((source) => source.lods.map((lod) => lod.prefabUrl)),
    ...manifest.featureRockVariants.flatMap((source) => source.lods.map((lod) => lod.prefabUrl)),
    ...manifest.stoneVariants.flatMap((source) => source.lods.map((lod) => lod.prefabUrl)),
    ...manifest.debris.lods.map((lod) => lod.prefabUrl),
    ...manifest.mushroom.lods.map((lod) => lod.prefabUrl),
    ...manifest.lotusVariants.flatMap((source) => source.lods.map((lod) => lod.prefabUrl)),
    ...manifest.rock.lods.map((lod) => lod.prefabUrl)
  ];
}

function validGeneratedPrefabUrl(value: unknown, catalogId: string): value is string {
  return typeof value === "string" && value.startsWith(`AssetAssembly/${capitalize(catalogId)}/Prefabs/`);
}

function validGeneratedTextureUrl(value: unknown, catalogId: string): value is string {
  return typeof value === "string" && value.startsWith(`AssetAssembly/${capitalize(catalogId)}/Textures/`);
}

function validCatalogId(value: unknown, category: AssetCategory, catalogId: string): value is string {
  return typeof value === "string" && value.startsWith(`${catalogId}/${category}/`) && /\/v\d+$/u.test(value);
}

function validCatalogFamilyId(value: unknown, category: string, catalogId: string): value is string {
  return typeof value === "string" && value.startsWith(`${catalogId}/${category}/`) && /\/v\d+$/u.test(value);
}

function validWorldBounds(value: AssetAssemblyWorldBounds | undefined): boolean {
  return Boolean(
    value &&
      [value.width, value.depth, value.minimumAltitude, value.maximumAltitude].every(Number.isFinite) &&
      value.width > 0 &&
      value.depth > 0 &&
      value.maximumAltitude >= value.minimumAltitude
  );
}

function validRgb(value: readonly number[] | undefined): value is readonly [number, number, number] {
  return Boolean(
    value && value.length === 3 && value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
  );
}

function validSelectionWeight(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function requireUniqueIds(ids: readonly string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`Production asset catalog contains duplicate ${label} IDs`);
}

export function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}
