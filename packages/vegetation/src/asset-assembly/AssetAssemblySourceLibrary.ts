import {
  validateManifest,
  capitalize,
  type GeneratedResourceManifest,
  type ProductionCatalogManifest,
  type TreeRecipeManifest,
  type TreeLeafMaskManifest,
  type ShrubManifest,
  type AtomicManifest,
  type AtomicLodManifest
} from "./AssetAssemblyCatalog";
export { validateManifest } from "./AssetAssemblyCatalog";
import {
  AssetType,
  Engine,
  JSONAsset,
  Material,
  PrefabResource,
  ShaderProperty,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode
} from "@galacean/engine";
import {
  PopulationLodMetric,
  type AssetCategory,
  type PopulationLodProfileV1
} from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import { registerTerrainProjectResources } from "@galacean/engine-terrain/terrain/loader/TerrainSceneLoader";
import { plantProjectResources } from "./PlantSpeciesResources";
import {
  resolveTerrainProjectPrefabGeometry,
  type TerrainProjectResolvedRenderer
} from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import type { ProductionAssetCatalogV1 } from "./ProductionAssetCatalog";
import type {
  TreeBillboardTuning,
  TreeLeafCardTuning,
  TreeLeafLightingTuning,
  TreeLeafMaskId
} from "./AssetAssemblyPresetFactory";
import type { TreeLeafCountTuning } from "./ProceduralTreeLeafCount";
import type {
  ProceduralTreeDistributionTuning,
  ProceduralTreeStructureParameters,
  ProceduralTreeTriangleBudgetTuning
} from "./ProceduralTreeGenerator";
import { TREE_SPECIES_CATALOG } from "./TreeSpeciesCatalog";
import { loadTreeSpeciesRecipes } from "./TreeSpeciesRecipeLoader";

const GRASS_DISTANCE_FADE_ENABLE = ShaderProperty.getByName("material_GrassDistanceFadeEnable");
const GRASS_FADE_DISTANCE = ShaderProperty.getByName("material_GrassFadeDistance");
const GRASS_FALLOFF = ShaderProperty.getByName("material_GrassFalloff");

/** Shared static renderer bindings, supplied by a Prefab or the procedural compiler. */
export interface ProductionRenderAtom {
  readonly id: string;
  readonly label: string;
  readonly renderer: TerrainProjectResolvedRenderer;
  /** Every static primitive owned by this atom; single-material atoms contain only `renderer`. */
  readonly renderers: readonly TerrainProjectResolvedRenderer[];
}

/** Authored atoms retain their Prefab; procedural atoms provide the same renderer bindings directly. */
export interface ProductionPrefabAtom extends ProductionRenderAtom {
  readonly prefab: PrefabResource;
}

/** One catalog-authored leaf-mask option resolved without runtime path conventions. */
export interface TreeLeafMaskSource {
  readonly id: TreeLeafMaskId;
  readonly label: string;
  readonly resourceUrl: string;
  readonly texture: Texture2D;
}

/** Reusable procedural base tree selected by a Population Token. */
export interface TreeRecipeSource {
  readonly id: string;
  readonly label: string;
  /** Provenance of the exact authored LOD meshes. */
  readonly sourceKind: "grasslands-modular" | "authored-mesh" | "measured-reconstruction";
  readonly proceduralProfile: "small-maple" | "white-birch";
  readonly size: number;
  readonly defaultColorRgb: readonly [number, number, number];
  readonly defaultLodProfile: PopulationLodProfileV1;
  /** The only three runtime asset references owned by a procedural tree recipe. */
  readonly trunkMaterial: Material;
  readonly leafMaterial: Material;
  readonly leafMask: Texture2D;
  readonly leafMaskId: TreeLeafMaskId;
  /** Optional display name for a recipe-owned mask that replaces the catalog default. */
  readonly leafMaskLabel?: string;
  /** Recipe-owned surface defaults applied after cloning the authored leaf Material. */
  readonly defaultLeafLightingTuning?: TreeLeafLightingTuning;
  /** Authored Unity LODGroup projection thresholds for this exact tree family. */
  readonly lodGroup: ProductionLodGroupProfile;
  /** Stable offline identity used when a namespaced Population Token id must reproduce source geometry. */
  readonly proceduralGeometryIdentity?: string;
  /** Final converted structure shared by previews and world instances. */
  readonly structureParameters?: ProceduralTreeStructureParameters;
  /** Recipe-owned defaults for a quantitatively reconstructed procedural tree. */
  readonly proceduralRuntime?: {
    readonly distributionTuning: ProceduralTreeDistributionTuning;
    readonly leafCountTuning: TreeLeafCountTuning;
    readonly leafCardTuning: TreeLeafCardTuning;
    readonly billboardTuning: TreeBillboardTuning;
    /** Vertex-stage card orientation reconstructed from the source asset. */
    readonly leafCardFacingMode: "fixed" | "camera-facing";
    readonly foliageLodScales: readonly [lod0: number, lod1: number, lod2: number, lod3: number];
    readonly triangleBudget: ProceduralTreeTriangleBudgetTuning;
    /** Keeps the source material's two-tone, translucency, climate, and wind shader features. */
    readonly preserveLeafMaterialFeatures: boolean;
  };
  readonly proceduralGate?: {
    readonly status: "failed";
    readonly generator: "hierarchical-skeleton-v1";
    readonly evaluatedViews: 3;
    readonly candidateLeafCount: number;
    readonly authoredLeafCount: number;
    readonly retainedRatio: number;
    readonly perLod: readonly {
      readonly lod: number;
      readonly candidateLeafCount: number;
      readonly authoredLeafCount: number;
      readonly branchSegments: number;
      readonly maxCrownExtentErrorPercent: number;
      readonly maxSpatialOccupancyErrorPercent: number;
      readonly triangleRatio: number;
      readonly transitionCoverageFloor: number;
      readonly passed: false;
    }[];
    readonly failedMetrics: readonly string[];
  };
}

/** Complete shrub geometry ordered by LOD, generated from parameters or authored. */
export interface ShrubAssemblySource {
  /** Rest geometry bounds, before wind expands the renderer's culling envelope. */
  readonly geometryBounds?: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly id: string;
  readonly label: string;
  readonly defaultColorRgb: readonly [number, number, number];
  readonly defaultLodProfile: PopulationLodProfileV1;
  readonly lods: readonly ProductionRenderAtom[];
  readonly authoredLeafCounts: readonly number[];
  /** Authored Project Prefab LODGroup shared by every shrub instance. */
  readonly lodGroup: ProductionLodGroupProfile;
}

/** Complete independently repeated Prefab atom, optionally with authored geometry LODs. */
export interface AtomicAssemblySource {
  readonly id: string;
  readonly label: string;
  /** Relative deterministic selection weight within the authored atom family. */
  readonly selectionWeight: number;
  readonly defaultColorRgb: readonly [number, number, number];
  readonly defaultLodProfile: PopulationLodProfileV1;
  readonly lods: readonly ProductionPrefabAtom[];
  /** Authored Project Prefab LODGroup shared by every instance, when available. */
  readonly lodGroup?: ProductionLodGroupProfile;
}

/** One authored atom family with a stable primary source and weighted source variants. */
export interface AtomicAssemblySourceFamily {
  /** Backward-compatible primary source used by existing Asset Assembly controls. */
  readonly primary: AtomicAssemblySource;
  /** Complete authored source variants selected from a published Producer rank. */
  readonly variants: readonly AtomicAssemblySource[];
}

/** Renderer-independent LODGroup metadata copied from the production Project Prefab. */
export interface ProductionLodGroupProfile {
  readonly localReferencePoint: readonly [number, number, number];
  readonly size: number;
  readonly screenRelativeTransitionHeights: readonly number[];
}

/** Offline-validated physical extent retained as production source metadata. */
export interface AssetAssemblyWorldBounds {
  readonly width: number;
  readonly depth: number;
  readonly minimumAltitude: number;
  readonly maximumAltitude: number;
}

/** Immutable Cartoon Prefab resources consumed by previews and instance batches. */
export interface AssetAssemblySourceLibrary {
  readonly catalogId: string;
  readonly catalogLabel: string;
  readonly worldBounds: Readonly<AssetAssemblyWorldBounds>;
  readonly treeRecipes: readonly TreeRecipeSource[];
  readonly treeLeafMasks: readonly TreeLeafMaskSource[];
  readonly treeImpostor?: AtomicAssemblySource;
  readonly shrub: ShrubAssemblySource;
  /** All catalog shrubs; the legacy shrub slot remains the material/authoring default. */
  readonly shrubRecipes?: readonly ShrubAssemblySource[];
  readonly grass: AtomicAssemblySource;
  readonly flower: AtomicAssemblySource;
  /** Authored grass atom variants, selected only from the Producer prototype rank. */
  readonly grassFamily: AtomicAssemblySourceFamily;
  /** Authored flower atom variants, selected only from the Producer prototype rank. */
  readonly flowerFamily: AtomicAssemblySourceFamily;
  /** Accepted large-outcrop variants with the same Grass 2 or Mud 2 top-coverage semantics as the terrain below. */
  readonly largeRockSurfaceFamilies: Readonly<Record<"grass" | "mud", AtomicAssemblySourceFamily>>;
  /** Non-mountain parent-rock variants which retain rock PBR but deliberately omit top Coverage. */
  readonly featureRockFamily: AtomicAssemblySourceFamily;
  /** Accepted neutral Stone 1–4 variants, all physically smaller than large outcrops. */
  readonly stoneFamily: AtomicAssemblySourceFamily;
  /** Accepted neutral four-pebble debris atom. */
  readonly debrisSource: AtomicAssemblySource;
  /** Accepted Mushroom authored LOD source used by rock-edge clusters. */
  readonly mushroom: AtomicAssemblySource;
  /** Authorized Unity lotus variants with source-authored two-level geometry LODs. */
  readonly lotusFamily: AtomicAssemblySourceFamily;
  readonly rock: AtomicAssemblySource;
  readonly generatedGlbRequests: number;
  readonly generatedPrefabRequests: number;
  readonly originalSourceGlbRequests: 0;
}

/** Optional production-resource selection for pages that enable only a subset of authored trees. */
export interface AssetAssemblySourceLibraryLoadOptions {
  /** ProjectSession has already registered the accepted asset closure. */
  readonly resourcesRegistered?: boolean;
  /** Exact tree recipe ids to preload; omitted loads every authored tree recipe. */
  readonly treeRecipeIds?: ReadonlySet<string>;
  /** Parameter-generated shrubs use the same renderer and Population contracts. */
  readonly shrubSourceFactory?: (engine: Engine) => Promise<ShrubAssemblySource>;
  /** Selects the parent-rock source used by legacy Rock preview controls. */
  readonly legacyRockMode?: "catalog" | "large-rock";
  /** Whether to request the catalog GLB tree billboard. Procedural-only worlds disable it. */
  readonly loadTreeImpostor?: boolean;
}

/** Tree renderer view over the production source library. */
export type TreeAssemblySourceLibrary = AssetAssemblySourceLibrary;

/** Material-authored CPU distance fade used to stop submitting fully collapsed vegetation. */
export interface ProductionDistanceFade {
  readonly enabled: boolean;
  readonly distance: number;
  readonly falloff: number;
}

type StaticRendererCardinality = "exactly-one" | "one-or-more";
/**
 * Reads distance-fade policy from the Material resolved by a production Prefab.
 * @param atom Prefab atom whose Renderer owns the authoritative Material.
 * @returns Detached distance-fade values; non-vegetation Materials resolve to disabled.
 */
export function productionPrefabDistanceFade(atom: ProductionRenderAtom): ProductionDistanceFade {
  const shaderData = atom.renderer.material.shaderData;
  return {
    enabled: shaderData.getFloat(GRASS_DISTANCE_FADE_ENABLE) === 1,
    distance: shaderData.getFloat(GRASS_FADE_DISTANCE) ?? 0,
    falloff: shaderData.getFloat(GRASS_FALLOFF) ?? 0
  };
}

/**
 * Selects one authored atom without consuming mutable random state.
 * @param family Authored source family with positive relative variant weights.
 * @param rank Published unsigned deterministic rank from the world Producer.
 * @returns The selected authored source variant.
 * @throws {RangeError} When the rank or family weights are invalid.
 */
export function selectAtomicAssemblySourceVariant(
  family: AtomicAssemblySourceFamily,
  rank: number
): AtomicAssemblySource {
  if (!Number.isInteger(rank) || rank < 0 || rank > 0xffff_ffff) {
    throw new RangeError("Asset Assembly atom variant rank must be an unsigned 32-bit integer");
  }
  const totalWeight = family.variants.reduce((sum, variant) => sum + variant.selectionWeight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    throw new RangeError("Asset Assembly atom family requires positive finite selection weights");
  }
  const selectedWeight = (rank / 0x1_0000_0000) * totalWeight;
  let accumulatedWeight = 0;
  for (const variant of family.variants) {
    accumulatedWeight += variant.selectionWeight;
    if (selectedWeight < accumulatedWeight) return variant;
  }
  return family.variants.at(-1)!;
}

/**
 * Loads the one real production catalog and resolves every generated atom through a standard Prefab.
 * @param engine Engine ResourceManager owning the Project, Prefabs, Materials, and Shaders.
 * @param registration Immutable catalog registration selected by the page.
 * @param options Optional authored tree-recipe preload selection.
 * @returns Fully resolved Prefab source library with no dependency on original full source GLBs.
 * @throws If the Project, manifest, Prefab, Material, or generated resource violates its contract.
 */
export async function loadAssetAssemblySourceLibrary(
  engine: Engine,
  registration: ProductionAssetCatalogV1,
  options: AssetAssemblySourceLibraryLoadOptions = {}
): Promise<AssetAssemblySourceLibrary> {
  const manifestUrl = new URL(registration.manifestUrl, globalThis.location.href);
  const [manifestAsset] = await Promise.all([
    engine.resourceManager.load<JSONAsset>({
      type: AssetType.JSON,
      url: options.resourcesRegistered ? plantProjectResources(engine).production : manifestUrl.href
    }),
    options.resourcesRegistered ? Promise.resolve() : registerTerrainProjectResources(engine, registration.projectUrl)
  ]);
  const manifest = validateManifest(manifestAsset.data, registration);
  if (!options.resourcesRegistered) registerGeneratedResources(engine, manifestUrl, manifest.generatedResources);
  if (!options.resourcesRegistered) await configureGeneratedKtx2Textures(engine, manifest.generatedResources);
  const treeSpeciesIds = new Set<string>(TREE_SPECIES_CATALOG.map((entry) => entry.assetId));
  const requestedTreeSpeciesIds = options.treeRecipeIds
    ? new Set([...options.treeRecipeIds].filter((id) => treeSpeciesIds.has(id)))
    : undefined;
  const requestedCatalogTreeIds = options.treeRecipeIds
    ? new Set([...options.treeRecipeIds].filter((id) => !treeSpeciesIds.has(id)))
    : undefined;
  const treeRecipesToLoad =
    requestedCatalogTreeIds?.size === 0 ? [] : selectTreeRecipes(manifest.treeRecipes, requestedCatalogTreeIds);
  const treeSpeciesRecipesPromise = loadTreeSpeciesRecipes(engine, requestedTreeSpeciesIds);
  const treeLeafMasksPromise = loadTreeLeafMasks(engine, manifest.treeLeafMasks);

  const [
    treeLeafMasks,
    treeRecipes,
    treeImpostor,
    shrub,
    grassFamily,
    flowerFamily,
    largeRockGrassFamily,
    largeRockMudFamily,
    featureRockFamily,
    stoneFamily,
    debrisSource,
    mushroom,
    lotusFamily,
    catalogRockLods
  ] = await Promise.all([
    treeLeafMasksPromise,
    treeLeafMasksPromise.then((treeLeafMasks) =>
      Promise.all(treeRecipesToLoad.map((recipe) => loadTreeRecipe(engine, recipe, treeLeafMasks)))
    ),
    options.loadTreeImpostor === false
      ? Promise.resolve(undefined)
      : loadPrefabAtom(
          engine,
          manifest.treeImpostor.id,
          "Cartoon whole-tree impostor",
          manifest.treeImpostor.prefabUrl,
          ["Terrain/Billboard"]
        ),
    options.shrubSourceFactory
      ? options.shrubSourceFactory(engine)
      : Promise.all(
          manifest.shrub.lods.map((lod, lodIndex) =>
            loadPrefabAtom(engine, manifest.shrub.id, `${manifest.shrub.label} LOD${lodIndex}`, lod.prefabUrl, [
              "Terrain/Vegetation"
            ])
          )
        ).then(
          (lods): ShrubAssemblySource => ({
            id: manifest.shrub.id,
            label: manifest.shrub.label,
            defaultColorRgb: manifest.shrub.defaultColorRgb,
            defaultLodProfile: detachLodProfile(manifest.shrub.defaultLodProfile),
            lods,
            authoredLeafCounts: manifest.shrub.lods.map((lod) => lod.leafCount),
            lodGroup: detachLodGroupProfile(manifest.shrub.lodGroup)
          })
        ),
    loadAtomicSourceFamily(engine, manifest.grassVariants, "grass", ["Terrain/Grass"]),
    loadAtomicSourceFamily(engine, manifest.flowerVariants, "flower", ["Terrain/Vegetation"]),
    loadAtomicLodSourceFamily(engine, manifest.largeRockGrassVariants, "large rock · grass", ["Terrain/Surface"]),
    loadAtomicLodSourceFamily(engine, manifest.largeRockMudVariants, "large rock · mud", ["Terrain/Surface"]),
    loadAtomicLodSourceFamily(engine, manifest.featureRockVariants, "feature rock", ["Terrain/Surface"]),
    loadAtomicLodSourceFamily(engine, manifest.stoneVariants, "stone", ["Terrain/Surface"]),
    loadAtomicLodSource(engine, manifest.debris, "debris", ["Terrain/Surface"]),
    loadAtomicLodSource(engine, manifest.mushroom, "mushroom", ["Terrain/Vegetation"]),
    loadAtomicLodSourceFamily(engine, manifest.lotusVariants, "lotus", ["Terrain/Vegetation"], "one-or-more"),
    options.legacyRockMode === "large-rock"
      ? Promise.resolve(undefined)
      : Promise.all(
          manifest.rock.lods.map((lod, index) =>
            loadPrefabAtom(engine, manifest.rock.id, `${manifest.rock.label} LOD${index}`, lod.prefabUrl, [
              "Terrain/Surface"
            ])
          )
        )
  ]);

  const runtimeTreeRecipes = Object.freeze([...(await treeSpeciesRecipesPromise), ...treeRecipes]);
  const generatedGlbRequests = manifest.generatedResources.filter((resource) => resource.type === "GLTF").length;
  const generatedPrefabRequests = manifest.generatedResources.filter((resource) => resource.type === "Prefab").length;
  return {
    catalogId: manifest.id,
    catalogLabel: manifest.label,
    worldBounds: { ...manifest.worldBounds },
    treeRecipes: runtimeTreeRecipes,
    treeLeafMasks,
    ...(treeImpostor
      ? {
          treeImpostor: {
            id: manifest.treeImpostor.id,
            label: "Cartoon whole-tree impostor",
            selectionWeight: 1,
            defaultColorRgb: [255, 255, 255] as const,
            defaultLodProfile: { metric: PopulationLodMetric.InstanceCount, values: [1] },
            lods: [treeImpostor]
          }
        }
      : {}),
    shrub,
    grass: grassFamily.primary,
    flower: flowerFamily.primary,
    grassFamily,
    flowerFamily,
    largeRockSurfaceFamilies: Object.freeze({ grass: largeRockGrassFamily, mud: largeRockMudFamily }),
    featureRockFamily,
    stoneFamily,
    debrisSource,
    mushroom,
    lotusFamily,
    rock:
      options.legacyRockMode === "large-rock"
        ? largeRockGrassFamily.primary
        : {
            id: manifest.rock.id,
            label: manifest.rock.label,
            selectionWeight: 1,
            defaultColorRgb: manifest.rock.defaultColorRgb,
            defaultLodProfile: detachLodProfile(manifest.rock.defaultLodProfile),
            lods: catalogRockLods!,
            lodGroup: {
              localReferencePoint: [...manifest.rock.lodGroup.localReferencePoint],
              size: manifest.rock.lodGroup.size,
              screenRelativeTransitionHeights: [...manifest.rock.lodGroup.screenRelativeTransitionHeights]
            }
          },
    generatedGlbRequests,
    generatedPrefabRequests,
    originalSourceGlbRequests: 0
  };
}

/**
 * Loads only the authored small-stone LOD source from a production Asset Assembly catalog.
 * @param engine Engine ResourceManager owning the generated Prefab and Material resources.
 * @param registration Immutable production catalog containing the small-stone source.
 * @returns Resolved small-stone atoms and their authored LODGroup profile.
 * @throws If the catalog, generated resources, Prefabs, or surface Materials violate their contract.
 */
export async function loadAssetAssemblyRockSource(
  engine: Engine,
  registration: ProductionAssetCatalogV1
): Promise<AtomicAssemblySource> {
  const manifestUrl = new URL(registration.manifestUrl, globalThis.location.href);
  const [manifestAsset] = await Promise.all([
    engine.resourceManager.load<JSONAsset>({ type: AssetType.JSON, url: manifestUrl.href }),
    registerTerrainProjectResources(engine, registration.projectUrl)
  ]);
  const manifest = validateManifest(manifestAsset.data, registration);
  registerGeneratedResources(engine, manifestUrl, manifest.generatedResources);
  const lods = await Promise.all(
    manifest.rock.lods.map((lod, index) =>
      loadPrefabAtom(engine, manifest.rock.id, `${manifest.rock.label} LOD${index}`, lod.prefabUrl, ["Terrain/Surface"])
    )
  );
  return {
    id: manifest.rock.id,
    label: manifest.rock.label,
    selectionWeight: 1,
    defaultColorRgb: manifest.rock.defaultColorRgb,
    defaultLodProfile: detachLodProfile(manifest.rock.defaultLodProfile),
    lods,
    lodGroup: detachLodGroupProfile(manifest.rock.lodGroup)
  };
}

async function loadTreeRecipe(
  engine: Engine,
  recipe: TreeRecipeManifest,
  treeLeafMasks: readonly TreeLeafMaskSource[]
): Promise<TreeRecipeSource> {
  const leafMask = treeLeafMasks.find((candidate) => candidate.resourceUrl === recipe.leafMask);
  if (!leafMask) throw new Error(`Asset Assembly ${recipe.label} leaf mask is not registered by the catalog`);
  const [trunkMaterial, leafMaterial] = await Promise.all([
    loadTreeMaterial(engine, recipe.trunkMaterial, "Terrain/Surface", `${recipe.label} bark`),
    loadTreeMaterial(engine, recipe.leafMaterial, "Terrain/Vegetation", `${recipe.label} leaf`)
  ]);
  return {
    ...recipe,
    defaultLodProfile: detachLodProfile(recipe.defaultLodProfile),
    trunkMaterial,
    leafMaterial,
    leafMask: leafMask.texture,
    leafMaskId: leafMask.id,
    lodGroup: detachLodGroupProfile(recipe.lodGroup)
  };
}

async function loadTreeLeafMasks(
  engine: Engine,
  manifests: readonly TreeLeafMaskManifest[]
): Promise<readonly TreeLeafMaskSource[]> {
  return Promise.all(
    manifests.map(async ({ id, label, texture: textureUrl }) => {
      const texture = await engine.resourceManager.load<Texture2D>({ type: AssetType.KTX2, url: textureUrl });
      if (!(texture instanceof Texture2D) || texture.width !== 256 || texture.height !== 256) {
        throw new Error(`Asset Assembly tree leaf mask ${id} did not resolve a 256x256 Texture2D`);
      }
      return { id, label, resourceUrl: textureUrl, texture };
    })
  );
}

async function loadTreeMaterial(
  engine: Engine,
  materialUrl: string,
  expectedShader: "Terrain/Surface" | "Terrain/Vegetation",
  label: string
): Promise<Material> {
  const material = await engine.resourceManager.load<Material>({ type: AssetType.Material, url: materialUrl });
  if (!(material instanceof Material) || material.shader.name !== expectedShader) {
    throw new Error(`Asset Assembly ${label} did not resolve the catalog-authored ${expectedShader} PBR material`);
  }
  return material;
}

async function loadAtomicSourceFamily(
  engine: Engine,
  sources: readonly AtomicManifest[],
  category: "grass" | "flower",
  expectedShaders: readonly string[]
): Promise<AtomicAssemblySourceFamily> {
  const variants = await Promise.all(
    sources.map((source) => loadAtomicSource(engine, source, category, expectedShaders))
  );
  return Object.freeze({ primary: variants[0]!, variants: Object.freeze(variants) });
}

async function loadAtomicSource(
  engine: Engine,
  source: AtomicManifest,
  category: "grass" | "flower",
  expectedShaders: readonly string[]
): Promise<AtomicAssemblySource> {
  return {
    id: source.id,
    label: source.label ?? source.id,
    selectionWeight: source.selectionWeight!,
    defaultColorRgb: source.defaultColorRgb!,
    defaultLodProfile: detachLodProfile(source.defaultLodProfile!),
    lods: [await loadPrefabAtom(engine, source.id, source.label ?? category, source.prefabUrl, expectedShaders)]
  };
}

async function loadAtomicLodSourceFamily(
  engine: Engine,
  sources: readonly AtomicLodManifest[],
  label: string,
  expectedShaders: readonly string[],
  rendererCardinality: StaticRendererCardinality = "exactly-one"
): Promise<AtomicAssemblySourceFamily> {
  const variants = await Promise.all(
    sources.map((source, index) =>
      loadAtomicLodSource(engine, source, `${label} ${index + 1}`, expectedShaders, rendererCardinality)
    )
  );
  return Object.freeze({ primary: variants[0]!, variants: Object.freeze(variants) });
}

async function loadAtomicLodSource(
  engine: Engine,
  source: AtomicLodManifest,
  label: string,
  expectedShaders: readonly string[],
  rendererCardinality: StaticRendererCardinality = "exactly-one"
): Promise<AtomicAssemblySource> {
  const lods = await Promise.all(
    source.lods.map((lod, index) =>
      loadPrefabAtom(
        engine,
        source.id,
        `${source.label ?? label} LOD${index}`,
        lod.prefabUrl,
        expectedShaders,
        rendererCardinality
      )
    )
  );
  return {
    id: source.id,
    label: source.label ?? label,
    selectionWeight: source.selectionWeight ?? 1,
    defaultColorRgb: source.defaultColorRgb,
    defaultLodProfile: detachLodProfile(source.defaultLodProfile),
    lods,
    lodGroup: detachLodGroupProfile(source.lodGroup)
  };
}

async function loadPrefabAtom(
  engine: Engine,
  id: string,
  label: string,
  prefabUrl: string,
  expectedShaders: readonly string[],
  rendererCardinality: StaticRendererCardinality = "exactly-one"
): Promise<ProductionPrefabAtom> {
  const prefab = await engine.resourceManager.load<PrefabResource>({ type: AssetType.Prefab, url: prefabUrl });
  if (!(prefab instanceof PrefabResource)) throw new Error(`Asset Assembly ${label} did not resolve a Prefab`);
  const geometry = resolveTerrainProjectPrefabGeometry(prefab, id);
  const renderers = geometry?.kind === "renderers" ? geometry.renderers : null;
  if (!renderers || renderers.length === 0 || (rendererCardinality === "exactly-one" && renderers.length !== 1)) {
    throw new Error(
      `Asset Assembly ${label} Prefab must declare ${rendererCardinality === "one-or-more" ? "one or more" : "exactly one"} atom Renderer`
    );
  }
  if (
    renderers.some(
      (renderer) =>
        renderer.mesh.blendShapeCount !== 0 ||
        renderer.mesh.subMeshes.length !== 1 ||
        renderer.mesh.subMeshes[0].count <= 0 ||
        !expectedShaders.includes(renderer.material.shader.name)
    )
  ) {
    throw new Error(`Asset Assembly ${label} Prefab does not bind one supported static production primitive`);
  }
  return { id, label, prefab, renderer: renderers[0]!, renderers: Object.freeze([...renderers]) };
}

function registerGeneratedResources(
  engine: Engine,
  manifestUrl: URL,
  resources: readonly GeneratedResourceManifest[]
): void {
  const registeredResources = resources.map((resource) => ({
    ...resource,
    path: new URL(resource.path, manifestUrl).href
  }));
  const modelTextureAliases = registeredResources.flatMap((resource) => {
    const match =
      ["Texture", "KTX2"].includes(resource.type) && /^(.*)\/Textures\/([^/]+)$/u.exec(resource.virtualPath);
    if (!match) return [];
    const virtualPath = `${match[1]}/Models/textures/${match[2]}`;
    return [
      { ...resource, virtualPath },
      { ...resource, virtualPath: virtualPath.replace(/^AssetAssembly\//u, "assetassembly/") }
    ];
  });
  engine.resourceManager.registerVirtualResources([...registeredResources, ...modelTextureAliases]);
}

async function configureGeneratedKtx2Textures(
  engine: Engine,
  resources: readonly GeneratedResourceManifest[]
): Promise<void> {
  await Promise.all(
    resources
      .filter((resource) => resource.type === "KTX2")
      .map(async (resource) => {
        const texture = await engine.resourceManager.load<Texture2D>({
          type: AssetType.KTX2,
          url: resource.virtualPath
        });
        if (!(texture instanceof Texture2D)) {
          throw new Error(`Asset Assembly KTX2 resource did not resolve to Texture2D: ${resource.virtualPath}`);
        }
        texture.filterMode = TextureFilterMode.Trilinear;
        texture.wrapModeU = TextureWrapMode.Repeat;
        texture.wrapModeV = TextureWrapMode.Repeat;
        texture.anisoLevel = 8;
      })
  );
}

function selectTreeRecipes(
  recipes: readonly TreeRecipeManifest[],
  requestedRecipeIds: ReadonlySet<string> | undefined
): readonly TreeRecipeManifest[] {
  if (requestedRecipeIds === undefined) return recipes;
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const selected = [...requestedRecipeIds].map((id) => {
    const recipe = recipesById.get(id);
    if (!recipe) throw new RangeError(`Production asset catalog does not provide enabled tree recipe ${id}`);
    return recipe;
  });
  if (selected.length === 0) throw new RangeError("Production asset catalog requires at least one enabled tree recipe");
  return selected;
}

function detachLodProfile(profile: PopulationLodProfileV1): PopulationLodProfileV1 {
  return { metric: profile.metric, values: [...profile.values] };
}

function detachLodGroupProfile(profile: ProductionLodGroupProfile): ProductionLodGroupProfile {
  return {
    localReferencePoint: [...profile.localReferencePoint],
    size: profile.size,
    screenRelativeTransitionHeights: [...profile.screenRelativeTransitionHeights]
  };
}
