import "@galacean/engine-building/building/parts/index";
import "@galacean/engine-building/building/parts/BuildingParts";
import { registerBuildingAssetComponents } from "@galacean/engine-building/building/resources/BuildingAssetKit";
import { builtinBuildingPresetFiles } from "@galacean/engine-building/building/resources/BuiltinBuildingPresets";
import "@galacean/engine-building/building/components/BuildingGeneratorComponent";
import { builtinBuildingAssetFiles } from "@galacean/engine-building/building/resources/BuiltinBuildingAssets";
import { Loader } from "@galacean/engine";
import "@galacean/engine-world-planning/runtime/script-registry";
import { registerNativeFarming } from "@galacean/engine-farming/farming/native/index";
import { registerPlanningFarmingAssets } from "./src/planning/spatial/farming/PlanningFarmingAssets.ts";
import { seedWorldProjectFormats } from "./SeedWorldProjectFormats.ts";
import { seedWorldScriptModules } from "./systems/SeedWorldScriptModules.ts";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeProjectStorage, type RuntimeProjectManifest } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { extractAssetDependencies } from "@galacean/engine-project/runtime-editor/project/runtime-project-dependencies";
import { SEED_WORLD_PRODUCTION_ASSET_CATALOG } from "@galacean/engine-vegetation/asset-assembly/SeedWorldProductionAssetCatalog";
import { worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { PLANT_PROJECT_ROOT, PLANT_PROJECT_PRODUCTION, PLANT_PROJECT_CATALOG } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import { resolvePlantJSONReferences } from "@galacean/engine-vegetation/asset-assembly/PlantParameterEncoding";
import { importRuntimeHierarchy, assertRuntimeHierarchyEquivalent } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import { validatePlanningProject } from "./src/planning/spatial/runtime/PlanningProjectSource.ts";
import { registerPlantProjectAssets } from "@galacean/engine-world-planning/integrations/vegetation/PlantProjectFormats";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { registerNativeWater } from "@galacean/engine-water/water/native/index";
import { builtinWaterDefaultFiles } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { migrateSeedWorldWaterTextures } from "./SeedWorldWaterTextureMigration";
import type { AtomicLodManifest } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyCatalog";
import { seedWorldBootTrace } from "./src/SeedWorldBootTrace.ts";
import { parsePreloadedJson } from "./src/SeedWorldProjectTextBundle.ts";

/** Author schemas and saved asset catalogs are intentionally incompatible across these save versions.
 * Opening a project deletes saves of any other version before loading, so it starts from the initial world. */
// Version 12 resets catalogs after merging updated terrain and water shader assets.
export const SEED_WORLD_BUILDING_SAVE_VERSION = 12;
export function seedWorldProjectStorageId(seed: number, projectUrl: string, template = "original"): string {
  const scope = template === "original" ? "" : `${template}:`;
  return `seed-world:native-buildings-v${SEED_WORLD_BUILDING_SAVE_VERSION}-groups:${scope}${seed}:${projectUrl}`;
}

const SEED_WORLD_SAVE_ID = /^seed-world:native-buildings-v(\d+)-[^:]*:(?:[a-z][a-z0-9-]*:)?\d+:(.+)$/;

/** Stale data must not block startup: the storage key already keeps it from being loaded. */
async function deleteRetiredSeedWorldSaves(projectUrl: string): Promise<void> {
  try {
    const storage = await RuntimeProjectStorage.open();
    try {
      await storage.deleteMatching((id) => {
        const match = SEED_WORLD_SAVE_ID.exec(id);
        return match !== null && match[2] === projectUrl && Number(match[1]) !== SEED_WORLD_BUILDING_SAVE_VERSION;
      });
    } finally {
      storage.close();
    }
  } catch (error) {
    console.warn("Seed World could not delete retired saves", error);
  }
}

/** Open a project ready for authoring in both the runtime and the planning editor. */
export async function openSeedWorldProject(
  pageUrl: URL,
  initial?: RuntimeProjectManifest,
  prefetchedTextAssets?: ReadonlyMap<string, string>
): Promise<RuntimeProjectSession> {
  const projectUrl = new URL(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl, location.href).href;
  const raw = pageUrl.searchParams.get("seed");
  const seed = raw !== null && /^\d+$/.test(raw) && Number(raw) <= 0xffffffff ? Number(raw) : SEMANTIC_DEFAULTS.seed;
  const template = worldTemplate(pageUrl.searchParams.get("template"))?.id ?? "original";
  if (!initial) {
    const parsedPreloaded = parsePreloadedJson<RuntimeProjectManifest>(prefetchedTextAssets?.get(projectUrl));
    if (parsedPreloaded !== undefined) {
      initial = parsedPreloaded;
    } else {
      const response = await fetch(projectUrl);
      if (!response.ok) throw new Error(`Project manifest read failed (${response.status})`);
      initial = (await response.json()) as RuntimeProjectManifest;
    }
  }
  const existingVirtualPaths = new Set(initial.files.map((file) => file.virtualPath));
  initial = {
    ...initial,
    files: [
      ...initial.files,
      ...builtinBuildingAssetFiles,
      ...builtinBuildingPresetFiles,
      ...builtinWaterDefaultFiles.filter((file) => !existingVirtualPaths.has(file.virtualPath))
    ]
  };
  void deleteRetiredSeedWorldSaves(projectUrl);
  const project = await seedWorldBootTrace.span("openSeedWorldProject.sessionOpen", () =>
    RuntimeProjectSession.open(seedWorldProjectStorageId(seed, projectUrl, template), initial, projectUrl, {
      scriptModules: seedWorldScriptModules,
      prefetchedTextAssets
    })
  );
  try {
    registerNativeFarming();
    registerNativeWater();
    registerPlanningFarmingAssets();
    registerBuildingAssetComponents();
    registerPlantProjectAssets();
    project.registerAssetFormats(seedWorldProjectFormats);
    await seedWorldBootTrace.span("openSeedWorldProject.migrateBuildingAssetPaths", () =>
      migrateBuildingAssetPaths(project, initial, projectUrl, prefetchedTextAssets)
    );
    await seedWorldBootTrace.span("openSeedWorldProject.migrateWaterTextures", () =>
      migrateSeedWorldWaterTextures(project)
    );
    await seedWorldBootTrace.span("openSeedWorldProject.prepareEditableHierarchies", () =>
      project.prepareEditableHierarchies((name) => Boolean(Loader.getClass(name)))
    );
    await seedWorldBootTrace.span("openSeedWorldProject.initializeDependencies#1", () =>
      project.initializeDependencies()
    );
    await seedWorldBootTrace.span("openSeedWorldProject.migrateVegetationAssets", () =>
      migrateVegetationAssets(project, initial, projectUrl)
    );
    await seedWorldBootTrace.span("openSeedWorldProject.initializeDependencies#2", () =>
      project.initializeDependencies()
    );
    project.registerProjectValidator(validatePlanningProject);
    return project;
  } catch (error) {
    project.dispose();
    throw error;
  }
}

const SEED_WORLD_FLASH_CDN_HOST = "mdn.alipayobjects.com";
const SEED_WORLD_FLASH_CDN_MARKER = "/seed-world-flash/";

function isSeedWorldFlashCdnUrl(url: URL): boolean {
  return url.hostname === SEED_WORLD_FLASH_CDN_HOST && url.pathname.includes(SEED_WORLD_FLASH_CDN_MARKER);
}

/** Rebase retired built-in locations (legacy folder, local-to-CDN offloads, or updated built-in hashes)
 * before any restored hierarchy or resource loader can fetch a deleted or stale URL. */
async function migrateBuildingAssetPaths(
  project: RuntimeProjectSession,
  initial: RuntimeProjectManifest,
  baseUrl: string,
  prefetchedTextAssets?: ReadonlyMap<string, string>
): Promise<void> {
  const locations = new Map(initial.files.map((file) => [file.virtualPath, file]));
  const baseOrigin = new URL(baseUrl).origin;
  const relocate = (file: RuntimeProjectManifest["files"][number]) => {
    const current = locations.get(file.virtualPath);
    if (!current || current.type !== file.type) return file;
    const targetUrl = new URL(current.path, baseUrl);
    const savedUrl = new URL(file.path, baseUrl);
    if (savedUrl.href === targetUrl.href) return file;
    const legacy = targetUrl.href.replace("/packages/building/src/building/", "/packages/building/src/tiny-glade/");
    const isLegacyTinyGlade = legacy !== targetUrl.href && savedUrl.href === legacy;
    const isSameOriginBuiltin =
      ((baseOrigin !== "null" && savedUrl.origin === baseOrigin) ||
        (savedUrl.protocol === "file:" && targetUrl.protocol === "file:")) &&
      (savedUrl.pathname.includes("/packages/") || savedUrl.pathname.includes("/assets/"));
    const isUpdatedFlashCdn = isSeedWorldFlashCdnUrl(savedUrl);
    return isLegacyTinyGlade || isSameOriginBuiltin || isUpdatedFlashCdn ? { ...file, path: targetUrl.href } : file;
  };
  const current = project.projectPackage;
  const files = current.project.files.map(relocate);
  const changed = files.filter((file, index) => file !== current.project.files[index]);
  if (!changed.length) return;
  // Remote URL rebasing invalidates dependency metadata. Preserve validated built-in
  // dependencies or extract them transiently without persisting unedited remote bytes into pack.contents.
  const formats = new Map([...nativeAssetFormats(() => ({})), ...seedWorldProjectFormats]);
  const filePaths = new Set(files.map((file) => file.virtualPath));
  const preservedDependencies = new Map<string, readonly string[]>();
  const contents: Record<string, string> = {};
  for (const file of changed) {
    const format = formats.get(file.type);
    if (
      current.contents[file.virtualPath] !== undefined ||
      file.type === "script" ||
      !format ||
      format.referenceTypes?.length === 0
    ) {
      continue;
    }
    const initialFile = locations.get(file.virtualPath);
    if (
      initialFile?.dependencies !== undefined &&
      initialFile.dependencies.every((dep) => filePaths.has(dep))
    ) {
      preservedDependencies.set(file.virtualPath, [...initialFile.dependencies]);
      continue;
    }
    const preloaded = prefetchedTextAssets?.get(file.path);
    let text: string;
    if (preloaded !== undefined) {
      text = preloaded;
    } else {
      const response = await fetch(file.path);
      if (!response.ok) throw new Error(`Building migration read failed (${response.status}): ${file.virtualPath}`);
      text = await response.text();
    }
    if (file.type === "Prefab" || file.type === "Scene") {
      const original = JSON.parse(text);
      if (!original.asset) {
        const converted = importRuntimeHierarchy(original, file.virtualPath, files, (name) => Boolean(Loader.getClass(name)));
        contents[file.virtualPath] = JSON.stringify(converted);
        const candidate = { ...current, project: { ...current.project, files }, contents: { ...current.contents, ...contents } };
        assertRuntimeHierarchyEquivalent(original, JSON.parse(compileProjectResource(candidate, file.virtualPath) as string));
        continue;
      }
    }
    const deps = extractAssetDependencies(file, text, format);
    if (deps !== undefined) preservedDependencies.set(file.virtualPath, deps);
  }
  await project.rebaseRemoteFiles(
    (pack) => ({
      files: pack.project.files.map(relocate),
      preservedDependencies,
      ...(Object.keys(contents).length ? { contents } : {})
    }),
    { recordHistory: false }
  );
}

/** Versioned import preserves saved asset edits and intentionally deleted resources after migration. */
async function migrateVegetationAssets(project: RuntimeProjectSession, initial: RuntimeProjectManifest, baseUrl: string): Promise<void> {
  const marker = `${project.projectPackage.project.scene}.vegetation-assets.json`;
  const version = project.projectPackage.documents?.[marker] === undefined ? 0
    : JSON.parse(project.projectPackage.documents[marker]).version;
  if (version === 3) return;
  if (version === 2) return migrateVegetationPlacementMetadata(project, initial, baseUrl, marker);
  if (version !== 0 && version !== 1) throw new Error("Unsupported vegetation asset migration");
  const current = project.projectPackage;
  const contents: Record<string, string> = {}, retiredAliases = new Set<string>();
  let introduced: ReadonlySet<string> | undefined;
  // Version 1 also marked projects before native vegetation assets were imported.
  // Only an existing namespace can be upgraded in place; otherwise import its
  // native closure for the first time, preserving all other authored assets.
  const hasNativeVegetation = current.project.files.some(file => file.virtualPath.startsWith(PLANT_PROJECT_ROOT));
  if (version === 1 && hasNativeVegetation) {
    const provider = project.fileProvider();
    const read = async (path: string) => {
      await provider.prepare?.(path);
      const value = provider.read(path);
      if (typeof value !== "string") throw new Error(`Expected vegetation text asset: ${path}`);
      return JSON.parse(value);
    };
    const productionFile = initial.files.find(file => file.virtualPath === PLANT_PROJECT_PRODUCTION)!;
    const response = await fetch(new URL(productionFile.path, baseUrl));
    if (!response.ok) throw new Error(`Vegetation migration read failed (${response.status})`);
    const defaults = await response.json(), production = await read(PLANT_PROJECT_PRODUCTION);
    const needsStructureImport = production.proceduralTreeResources === undefined;
    production.proceduralTreeResources ??= defaults.proceduralTreeResources;
    contents[PLANT_PROJECT_PRODUCTION] = JSON.stringify(production);
    const json = nativeAssetFormats(() => ({})).get("JSON")!;
    introduced = new Set(needsStructureImport ? json.references(JSON.stringify(defaults.proceduralTreeResources), productionFile) : []);
    const catalog = resolvePlantJSONReferences(await read(PLANT_PROJECT_CATALOG)) as {
      treeRecipes: { materialKey: string; barkAlbedoFile: string; barkNormalFile: string; leafMaskFile: string }[]
    };
    // Version 1 copied browser-only texture aliases into the VFS. Translate only
    // untouched import aliases, retaining replacements authored as binary assets or new paths.
    const aliases = new Map<string, string>();
    for (const entry of catalog.treeRecipes) for (const [suffix, target] of [
      ["bark-albedo", entry.barkAlbedoFile], ["bark-normal", entry.barkNormalFile], ["leaves", entry.leafMaskFile]
    ]) {
      const path = `${PLANT_PROJECT_ROOT}${entry.materialKey}-${suffix}.png`;
      const file = current.project.files.find(file => file.virtualPath === path);
      if (file?.path === new URL(`../../asset-assembly/generated/procedural-trees/${path.slice(PLANT_PROJECT_ROOT.length)}`, baseUrl).href
        && current.contents[path] === undefined) aliases.set(path, target);
    }
    for (const file of current.project.files.filter(file => file.type === "Material" && file.virtualPath.startsWith(PLANT_PROJECT_ROOT))) {
      const material = await read(file.virtualPath);
      let changed = false;
      for (const property of Object.values(material.shaderData) as { type: string; value: { url?: string } }[]) {
        const alias = property.type === "Texture" && property.value?.url;
        if (alias && aliases.has(alias)) { property.value.url = aliases.get(alias); retiredAliases.add(alias); changed = true; }
      }
      if (changed) contents[file.virtualPath] = JSON.stringify(material);
    }
  }
  const paths = new Set(current.project.files.map(file => file.virtualPath));
  const additions = initial.files.filter(file => !paths.has(file.virtualPath) &&
    (introduced ? introduced.has(file.virtualPath) : file.virtualPath.startsWith(PLANT_PROJECT_ROOT) || file.virtualPath.startsWith("AssetAssembly/")))
    .map(file => ({ ...file, path: new URL(file.path, baseUrl).href }));
  const files = [...current.project.files, ...additions];
  const formats = new Map([...nativeAssetFormats(() => ({})), ...seedWorldProjectFormats]);
  for (const file of additions.filter(file => formats.get(file.type)?.referenceTypes?.length !== 0)) {
    const response = await fetch(file.path);
    if (!response.ok) throw new Error(`Vegetation hierarchy read failed (${response.status}): ${file.virtualPath}`);
    const original = await response.json();
    if (file.type !== "Prefab" && file.type !== "Scene") { contents[file.virtualPath] = JSON.stringify(original); continue; }
    const converted = original.asset ? original : importRuntimeHierarchy(original, file.virtualPath, files, name => Boolean(Loader.getClass(name)));
    contents[file.virtualPath] = JSON.stringify(converted);
    if (!original.asset) {
      const candidate = { ...current, project: { ...current.project, files }, contents: { ...current.contents, ...contents } };
      assertRuntimeHierarchyEquivalent(original, JSON.parse(compileProjectResource(candidate, file.virtualPath) as string));
    }
  }
  for (const alias of retiredAliases) if (files.some(file => !retiredAliases.has(file.virtualPath) &&
    (contents[file.virtualPath] === undefined ? file.dependencies ?? [] : formats.get(file.type)!.references(contents[file.virtualPath], file)).includes(alias)))
    retiredAliases.delete(alias);
  await project.update(
    (pack) => ({
      ...pack,
      project: {
        ...pack.project,
        files: [...pack.project.files, ...additions]
          .filter((file) => !retiredAliases.has(file.virtualPath))
          .map((file) =>
            file.type === "KTX2" && file.params === undefined
              ? { ...file, params: initial.files.find((initial) => initial.virtualPath === file.virtualPath)?.params }
              : file
          )
      },
      contents: { ...pack.contents, ...contents },
      documents: { ...pack.documents, [marker]: JSON.stringify({ version: 2 }) }
    }),
    { recordHistory: false }
  );
  await migrateVegetationPlacementMetadata(project, initial, baseUrl, marker);
}

/** Add newly published placement metadata to saved catalogs without replacing authored assets. */
async function migrateVegetationPlacementMetadata(
  project: RuntimeProjectSession,
  initial: RuntimeProjectManifest,
  baseUrl: string,
  marker: string
): Promise<void> {
  const provider = project.fileProvider();
  const contents: Record<string, string> = {};
  let defaults: Map<string, AtomicLodManifest> | undefined;
  for (const file of project.projectPackage.project.files.filter(file => file.type === "PlantProduction")) {
    await provider.prepare?.(file.virtualPath);
    const text = provider.read(file.virtualPath);
    if (typeof text !== "string") throw new Error(`Expected vegetation text asset: ${file.virtualPath}`);
    const production = JSON.parse(text);
    const stones = production.stoneVariants as readonly AtomicLodManifest[];
    if (stones.every(stone => stone.geometryBounds !== undefined)) continue;
    if (!defaults) {
      const source = initial.files.find(file => file.virtualPath === PLANT_PROJECT_PRODUCTION);
      if (!source) throw new Error("Missing production catalog for vegetation migration");
      const response = await fetch(new URL(source.path, baseUrl));
      if (!response.ok) throw new Error(`Vegetation migration read failed (${response.status})`);
      const catalog = await response.json();
      defaults = new Map((catalog.stoneVariants as readonly AtomicLodManifest[]).map(stone => [stone.id, stone]));
    }
    production.stoneVariants = stones.map(stone => {
      if (stone.geometryBounds !== undefined) return stone;
      const source = defaults!.get(stone.id);
      if (!source?.geometryBounds || stone.lods.length !== source.lods.length ||
        stone.lods.some((lod, index) => lod.prefabUrl !== source.lods[index].prefabUrl))
        throw new Error(`Saved stone requires authored placement bounds: ${stone.id}`);
      return { ...stone, geometryBounds: structuredClone(source.geometryBounds) };
    });
    contents[file.virtualPath] = JSON.stringify(production);
  }
  await project.update(
    (pack) => ({
      ...pack,
      contents: { ...pack.contents, ...contents },
      documents: { ...pack.documents, [marker]: JSON.stringify({ version: 3 }) }
    }),
    { recordHistory: false }
  );
}
