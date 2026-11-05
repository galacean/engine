import { registerBuildingAssetComponents } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { builtinBuildingPresetFiles } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingPresets";
import "@galacean/engine-building/tiny-glade/components/BuildingComponents";
import "@galacean/engine-building/tiny-glade/components/BuildingGeneratorComponent";
import { builtinBuildingAssetFiles } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingAssets";
import { Loader } from "@galacean/engine";
import "@galacean/engine-world-planning/runtime/script-registry";
import { registerNativeFarming } from "@galacean/engine-farming/farming/native/index";
import { registerPlanningFarmingAssets } from "./src/planning/spatial/farming/PlanningFarmingAssets.ts";
import { seedWorldProjectFormats } from "./SeedWorldProjectFormats.ts";
import { seedWorldScriptModules } from "./systems/SeedWorldScriptModules.ts";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import type { RuntimeProjectManifest } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { SEED_WORLD_PRODUCTION_ASSET_CATALOG } from "@galacean/engine-vegetation/asset-assembly/SeedWorldProductionAssetCatalog";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { PLANT_PROJECT_ROOT, PLANT_PROJECT_PRODUCTION, PLANT_PROJECT_CATALOG } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import { resolvePlantJSONReferences } from "@galacean/engine-vegetation/asset-assembly/PlantParameterEncoding";
import { importRuntimeHierarchy, assertRuntimeHierarchyEquivalent } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import { validatePlanningProject } from "./src/planning/spatial/runtime/PlanningProjectSource.ts";
import { registerPlantProjectAssets } from "@galacean/engine-world-planning/integrations/vegetation/PlantProjectFormats";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { registerNativeWater } from "@galacean/engine-water/water/native/index";

/** Open a project ready for authoring in both the runtime and the planning editor. */
export async function openSeedWorldProject(pageUrl: URL, initial?: RuntimeProjectManifest): Promise<RuntimeProjectSession> {
  const projectUrl = new URL(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl, location.href).href;
  const raw = pageUrl.searchParams.get("seed");
  const seed = raw !== null && /^\d+$/.test(raw) && Number(raw) <= 0xffffffff ? Number(raw) : SEMANTIC_DEFAULTS.seed;
  if (!initial) {
    const response = await fetch(projectUrl);
    if (!response.ok) throw new Error(`Project manifest read failed (${response.status})`);
    initial = await response.json() as RuntimeProjectManifest;
  }
  initial = { ...initial, files: [...initial.files, ...builtinBuildingAssetFiles, ...builtinBuildingPresetFiles] };
  const project = await RuntimeProjectSession.open(`seed-world:native-buildings-v6-assemblies:${seed}:${projectUrl}`, initial, projectUrl, {scriptModules: seedWorldScriptModules});
  try {
    registerNativeFarming();
    registerNativeWater();
    registerPlanningFarmingAssets();
    registerBuildingAssetComponents();
    registerPlantProjectAssets();
    project.registerAssetFormats(seedWorldProjectFormats);
    await project.prepareEditableHierarchies(name => Boolean(Loader.getClass(name)));
    await project.initializeDependencies();
    await migrateVegetationAssets(project, initial, projectUrl);
    await project.initializeDependencies();
    project.registerProjectValidator(validatePlanningProject);
    return project;
  } catch (error) {
    project.dispose();
    throw error;
  }
}

/** Versioned import preserves saved asset edits and intentionally deleted resources after migration. */
async function migrateVegetationAssets(project: RuntimeProjectSession, initial: RuntimeProjectManifest, baseUrl: string): Promise<void> {
  const marker = `${project.projectPackage.project.scene}.vegetation-assets.json`;
  const version = project.projectPackage.documents?.[marker] === undefined ? 0
    : JSON.parse(project.projectPackage.documents[marker]).version;
  if (version === 2) return;
  if (version !== 0 && version !== 1) throw new Error("Unsupported vegetation asset migration");
  const current = project.projectPackage;
  const contents: Record<string, string> = {}, retiredAliases = new Set<string>();
  let introduced: ReadonlySet<string> | undefined;
  if (version === 1) {
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
  await project.update(pack => ({ ...pack, project: { ...pack.project, files: [...pack.project.files, ...additions]
    .filter(file => !retiredAliases.has(file.virtualPath)).map(file => file.type === "KTX2" && file.params === undefined
      ? { ...file, params: initial.files.find(initial => initial.virtualPath === file.virtualPath)?.params } : file) },
    contents: { ...pack.contents, ...contents },
    documents: { ...pack.documents, [marker]: JSON.stringify({ version: 2 }) } }));
}
