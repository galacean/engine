import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { seedWorldProjectFormats } from "../../demos/seed-world/SeedWorldProjectFormats.ts";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import {
  importRuntimeHierarchy,
  assertRuntimeHierarchyEquivalent
} from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import {
  assertAssetPath,
  RUNTIME_PROJECT_SAVE_VERSION,
  RuntimeProjectStorage,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { PLANT_SPECIES_CATALOG } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import {
  decodePlantParameters,
  resolvePlantJSONReferences
} from "@galacean/engine-vegetation/asset-assembly/PlantParameterEncoding";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { PlanningProjectStorage } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectStorage.ts";
import { initializePlanningOcean } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningWaterInitialization.ts";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { createSpatialTerrainPlan } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import {
  planningSourceDocument,
  writePlanningProjectSource
} from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectSource.ts";

const projectURL = new URL("../../../packages/terrain/src/data/seed-world/project.json", import.meta.url);
const project = JSON.parse(readFileSync(projectURL, "utf8"));
const formats = new Map([...nativeAssetFormats(() => ({})), ...seedWorldProjectFormats]);
const resources = project.files.filter((file: { virtualPath: string }) =>
  /^(World\/Vegetation|AssetAssembly)\//.test(file.virtualPath)
);
const read = (path: string) =>
  JSON.parse(
    readFileSync(
      new URL(project.files.find((file: { virtualPath: string }) => file.virtualPath === path).path, projectURL),
      "utf8"
    )
  );

it("creates the native Ocean only in island mode", () => {
  const document = createSeedPlanningDocument(1);
  const pack: RuntimeProjectPackage = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project,
    contents: {
      [project.scene]: JSON.stringify(importRuntimeHierarchy(read(project.scene), project.scene, project.files, () => true))
    }
  };
  const draft = new RuntimeProjectEdit(pack, formats);
  writePlanningProjectSource(draft, project.scene, document);
  const recipe = exportPlanningRecipe(document);
  const scene = new RuntimeSceneEdit(draft, project.scene);
  recipe.parameters.landMode = "continuous";
  initializePlanningOcean(draft, createSpatialTerrainPlan(recipe));
  expect(scene.queryComponents({ type: "WaterBodyComponent" })).toHaveLength(0);
  recipe.parameters.landMode = "island";
  initializePlanningOcean(draft, createSpatialTerrainPlan(recipe));
  expect(scene.queryComponents({ type: "WaterBodyComponent" })).toHaveLength(1);
});

describe("production vegetation native asset closure", () => {
  it("opens a version 1 project without a native vegetation namespace and persists the import across refresh", async () => {
    const marker = `${project.scene}.vegetation-assets.json`;
    const materialPath = "Material/Terrain/seed-world.mat";
    const authoredMaterial = { ...read(materialPath), name: "Retained terrain material" };
    let saved: RuntimeProjectPackage = {
      version: RUNTIME_PROJECT_SAVE_VERSION,
      project: {
        ...project,
        files: [
          ...project.files
            .filter((file: { virtualPath: string }) => !/^(World\/Vegetation|AssetAssembly)\//.test(file.virtualPath))
            .map((file: { path: string }) => ({
              ...file,
              path: new URL(file.path, projectURL).href,
              dependencies: []
            })),
          { virtualPath: "World/PlayerState.json", path: "runtime-world:player", type: "JSON", dependencies: [] }
        ]
      },
      contents: {
        [materialPath]: JSON.stringify(authoredMaterial),
        "World/PlayerState.json": '{"progress":{"unlocked":true}}'
      },
      documents: { [marker]: '{"version":1}', "Notes/author.txt": "Retain this project" }
    };
    const authoring = createSeedPlanningDocument(1);
    authoring.entities.world.components.landscape = { values: { "vegetation.shrubs": 0 } };
    saved.contents[project.scene] = JSON.stringify(
      importRuntimeHierarchy(read(project.scene), project.scene, saved.project.files, () => true)
    );
    const draft = new RuntimeProjectEdit(saved, formats);
    writePlanningProjectSource(draft, project.scene, authoring);
    const source = new RuntimeSceneEdit(draft, project.scene);
    for (const component of source.queryComponents({ type: "PlanningGroundWind" }))
      source.removeComponent(component.id);
    draft.writeDocument(`${project.scene}.planning-source.json`, '{"version":1}');
    saved = draft.finish();
    const preserved = structuredClone(saved);
    const storage = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({
      load: async () => structuredClone(saved),
      save: async (_id: string, pack: RuntimeProjectPackage) => {
        saved = structuredClone(pack);
      },
      close() {}
    } as unknown as RuntimeProjectStorage);
    vi.stubGlobal("window", {});
    vi.stubGlobal("location", new URL("http://localhost/world/demos/seed-world/index.html"));
    vi.stubGlobal("fetch", async (url: string | URL) => new Response(readFileSync(new URL(url))));
    const opened: { dispose(): void }[] = [];
    try {
      const { openSeedWorldProject } = await import("../../demos/seed-world/SeedWorldProject.ts");
      const session = await openSeedWorldProject(new URL("http://localhost/?seed=1"), project);
      opened.push(session);
      await new PlanningProjectStorage(session, seedWorldProjectFormats).migrateToSource(createSeedPlanningDocument(2));
      expect(JSON.parse(session.projectPackage.documents![marker])).toEqual({ version: 2 });
      expect(JSON.parse(session.projectPackage.documents![`${project.scene}.planning-source.json`])).toEqual({
        version: 2
      });
      expect(planningSourceDocument(session.projectPackage)).toEqual(authoring);
      const migrated = new RuntimeSceneEdit(new RuntimeProjectEdit(session.projectPackage, formats), project.scene);
      expect(migrated.queryComponents({ type: "PlanningVegetationResources" })).toHaveLength(1);
      expect(migrated.queryComponents({ type: "PlanningGroundWind" })).toHaveLength(1);
      for (const file of resources)
        expect(session.projectPackage.project.files).toContainEqual(
          expect.objectContaining({
            virtualPath: file.virtualPath,
            type: file.type
          })
        );
      expect(session.projectPackage.contents[materialPath]).toBe(preserved.contents[materialPath]);
      expect(session.projectPackage.contents["World/PlayerState.json"]).toBe(
        preserved.contents["World/PlayerState.json"]
      );
      expect(session.projectPackage.documents!["Notes/author.txt"]).toBe(preserved.documents!["Notes/author.txt"]);
      // An explicit startup choice must replace the current source even after its v2 import marker exists.
      const selected = structuredClone(authoring);
      selected.entities.world.components.weather = {
        values: { ...selected.entities.world.components.weather?.values, cloudCoverage: 0 }
      };
      await new PlanningProjectStorage(session, seedWorldProjectFormats).migrateToSource(selected, true);
      expect(planningSourceDocument(session.projectPackage)).toEqual(selected);
      await session.save();
      session.dispose();
      const reopened = await openSeedWorldProject(new URL("http://localhost/?seed=1"), project);
      opened.push(reopened);
      expect(reopened.projectPackage).toEqual(saved);
      expect(planningSourceDocument(reopened.projectPackage)).toEqual(selected);
      expect(reopened.projectPackage.project.files.map((file) => file.virtualPath)).toEqual(
        session.projectPackage.project.files.map((file) => file.virtualPath)
      );
    } finally {
      for (const session of opened) session.dispose();
      storage.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("tracks substituted production materials beyond the original generated resource list", () => {
    const catalog = read("World/Vegetation/production-catalog.json");
    const path = "Material/Surface/alternative.mat";
    catalog.treeRecipes[0].trunkMaterial = path;
    const file = project.files.find(
      (file: { virtualPath: string }) => file.virtualPath === "World/Vegetation/production-catalog.json"
    );
    expect(formats.get("PlantProduction")!.references(JSON.stringify(catalog), file)).toContain(path);
  });
  it("publishes physical files, valid native/domain formats and every outgoing reference", () => {
    const paths = new Set(project.files.map((file: { virtualPath: string }) => file.virtualPath));
    for (const file of resources) {
      expect(() => assertAssetPath(file.virtualPath), file.virtualPath).not.toThrow();
      expect(existsSync(new URL(file.path, projectURL)), file.virtualPath).toBe(true);
      if (["GLTF", "Texture", "KTX2"].includes(file.type)) continue;
      const original = read(file.virtualPath);
      const source =
        file.type === "Prefab"
          ? importRuntimeHierarchy(original, file.virtualPath, project.files, () => true)
          : original;
      const text = JSON.stringify(source),
        format = formats.get(file.type)!;
      expect(format, file.type).toBeDefined();
      expect(() => format.validate(text), file.virtualPath).not.toThrow();
      for (const ref of format.references(text, file))
        expect(paths.has(ref), `${file.virtualPath} → ${ref}`).toBe(true);
      if (file.type === "Prefab") {
        const pack: RuntimeProjectPackage = {
          version: RUNTIME_PROJECT_SAVE_VERSION,
          project,
          contents: { [file.virtualPath]: text }
        };
        expect(
          () =>
            assertRuntimeHierarchyEquivalent(
              original,
              JSON.parse(compileProjectResource(pack, file.virtualPath) as string)
            ),
          file.virtualPath
        ).not.toThrow();
      }
    }
  });

  it("retains every species structure and appearance while converting each material slot", () => {
    const catalog = resolvePlantJSONReferences(
      read("World/Vegetation/plant-species.json")
    ) as typeof PLANT_SPECIES_CATALOG;
    expect([...catalog.assets, ...catalog.treeRecipes, ...catalog.shrubRecipes].map((entry) => entry.id)).toEqual(
      [
        ...PLANT_SPECIES_CATALOG.assets,
        ...PLANT_SPECIES_CATALOG.treeRecipes,
        ...PLANT_SPECIES_CATALOG.shrubRecipes
      ].map((entry) => entry.id)
    );
    for (const entry of [...catalog.assets, ...catalog.treeRecipes, ...catalog.shrubRecipes]) {
      const original = [
        ...PLANT_SPECIES_CATALOG.assets,
        ...PLANT_SPECIES_CATALOG.treeRecipes,
        ...PLANT_SPECIES_CATALOG.shrubRecipes
      ].find((item) => item.id === entry.id)!;
      expect(decodePlantParameters(read(entry.parameterFile))).toEqual(
        decodePlantParameters(
          JSON.parse(
            readFileSync(
              new URL(
                `../../../packages/vegetation/src/asset-assembly/generated/procedural-trees/${original.parameterFile}`,
                import.meta.url
              ),
              "utf8"
            )
          )
        )
      );
    }
    const appearance = read("World/Vegetation/meadow-plant-materials.json");
    for (const slots of Object.values(appearance.assets) as Record<string, { material: { $ref: string } }>[]) {
      for (const slot of Object.values(slots))
        expect(
          project.files.find((file: { virtualPath: string }) => file.virtualPath === slot.material.$ref)?.type
        ).toBe("Material");
    }
    const production = read("World/Vegetation/production-catalog.json");
    expect(Object.keys(production.proceduralTreeResources)).not.toHaveLength(0);
    for (const resource of Object.values(production.proceduralTreeResources) as { structure: { $ref: string } }[])
      expect(
        project.files.find((file: { virtualPath: string }) => file.virtualPath === resource.structure.$ref)?.type
      ).toBe("TreeStructure");
  });
});
