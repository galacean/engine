import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PlanningTreeAuthoring,
  patchTreeMaterial,
  treeColorToHex,
  treeHexToColor,
  treeMaterialValues,
  plantLandscapeControls,
  type TreeMaterialSource,
  type TreeMaterialValues
} from "../../demos/seed-world/src/planning/spatial/runtime/PlanningTreeAuthoring";
import { decodePlantParameters } from "@galacean/engine-vegetation/asset-assembly/PlantParameterEncoding";
import {
  scaleProceduralPlantWood,
  type ProceduralPlantAsset
} from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantAsset";
import {
  PLANT_MATERIAL_SLOTS,
  plantMaterialField,
  readPlantMaterialParameters,
  validatePlantMaterialParameters
} from "@galacean/engine-world-planning/spatial/PlantMaterialParameters";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { writePlanningProjectSource } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectSource";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import type { SeedWorldAgentApplication } from "../../demos/seed-world/agent-adapter/SeedWorldAgentApplication";

const projectUrl = new URL("../../../packages/terrain/src/data/seed-world/project.json", import.meta.url);
const manifest = JSON.parse(readFileSync(projectUrl, "utf8"));
const read = (path: string) =>
  decodePlantParameters<any>(
    JSON.parse(
      readFileSync(
        new URL(manifest.files.find((file: { virtualPath: string }) => file.virtualPath === path).path, projectUrl),
        "utf8"
      )
    )
  );
const appearance = read("World/Vegetation/meadow-plant-materials.json");
const speciesId = "SM_BirchTree_01";
const leafSlot = PLANT_MATERIAL_SLOTS.find((slot) => slot.assetId === speciesId && slot.role === "leaf")!;
const materialPath = appearance.assets[speciesId][leafSlot.materialId].material.$ref;

describe("native tree appearance authoring", () => {
  it("edits real leaf Material inputs, preserving unrelated shader state and linear colour precision", () => {
    const source = read(materialPath) as TreeMaterialSource;
    const before = structuredClone(source);
    const patched = patchTreeMaterial(source, {
      albedoBrightness: 1.6,
      baseAoInfluence: 0,
      flipBackfaceNormals: true,
      secondColorEnabled: true,
      secondColor: "#80c0f0",
      translucencyEnabled: false,
      translucencyIntensity: 0
    });
    expect(source).toEqual(before);
    expect(patched.shaderData.material_LeafAlbedoBrightness.value).toBe(1.6);
    expect(patched.shaderData.material_LeafBaseAOInfluence.value).toBe(0);
    expect(patched.shaderData.material_LeafFlipBackfaceNormals.value).toBe(1);
    expect(patched.shaderData.material_TranslucencyIntensity.value).toBe(0);
    expect(treeMaterialValues(patched)).toMatchObject({
      secondColorEnabled: true,
      secondColor: "#80c0f0",
      translucencyEnabled: false
    });
    expect(patched.shaderData.material_BaseTexture).toEqual(source.shaderData.material_BaseTexture);
    expect(patched.shaderData.material_WindForce).toEqual(source.shaderData.material_WindForce);
    expect(
      patched.macros.filter(
        (macro) => !["MATERIAL_ENABLE_SECOND_COLOR", "MATERIAL_ENABLE_TRANSLUCENCY"].includes(macro.name)
      )
    ).toEqual(
      source.macros.filter(
        (macro) => !["MATERIAL_ENABLE_SECOND_COLOR", "MATERIAL_ENABLE_TRANSLUCENCY"].includes(macro.name)
      )
    );
    for (const color of ["#000000", "#ffffff", "#80c0f0", "#ff479d"])
      expect(treeColorToHex(treeHexToColor(color))).toBe(color);
  });
  it("rejects invalid material edits without changing the original asset", () => {
    const source = read(materialPath),
      before = structuredClone(source);
    const invalid: TreeMaterialValues[] = [
      { albedoBrightness: -1 },
      { albedoDesaturation: 2 },
      { secondColor: "pink" },
      { translucencyEnabled: 1 },
      { unknown: 1 },
      { normalDistortion: Number.NaN }
    ];
    for (const patch of invalid) expect(() => patchTreeMaterial(source, patch)).toThrow();
    expect(source).toEqual(before);
  });
  it("keeps HDR material RGB energy and alpha without clipping other shader data", () => {
    const source = read(materialPath) as TreeMaterialSource;
    source.shaderData.material_SecondColor.value = { r: 0.1, g: 0.2, b: 0.3, a: 0.4 };
    const result = patchTreeMaterial(source, { secondColor: [4, 1.5, 0.2], translucencyColor: [2, 0.3, 0] });
    expect(result.shaderData.material_SecondColor.value).toEqual({ r: 4, g: 1.5, b: 0.2, a: 0.4 });
    expect(result.shaderData.material_TranslucencyColor.value).toMatchObject({ r: 2, g: 0.3, b: 0 });
    expect(result.shaderData.material_BaseTexture).toEqual(source.shaderData.material_BaseTexture);
    expect(() => patchTreeMaterial(source, { secondColor: [-1, 0, 0] })).toThrow();
    expect(() => patchTreeMaterial(source, { secondColor: [Infinity, 0, 0] })).toThrow();
  });
  it("changes woody radii at every authored LOD while preserving attachment curves, leaves and the input", () => {
    const catalog = read("World/Vegetation/plant-species.json");
    const entry = catalog.assets.find((entry: { id: string }) => entry.id === speciesId);
    const asset = decodePlantParameters<ProceduralPlantAsset>(read(entry.parameterFile.$ref));
    const before = structuredClone(asset);
    const woody = new Set(
      PLANT_MATERIAL_SLOTS.filter((slot) => slot.assetId === speciesId && slot.role === "bark").map(
        (slot) => slot.materialId
      )
    );
    const next = scaleProceduralPlantWood(asset, woody, 1.5);
    expect(asset).toEqual(before);
    let changed = 0;
    next.geometryLods.forEach((structure, index) => {
      const original = asset.geometryLods[index];
      const ids = new Set(original.parts.filter((part) => woody.has(part.materialId)).map((part) => part.shapeId));
      expect(structure.parts).toEqual(original.parts);
      expect(structure.lods).toEqual(original.lods);
      for (const [id, shape] of Object.entries(structure.shapes)) {
        const previous = original.shapes[id];
        if (ids.has(id) && shape.kind === "tube" && previous.kind === "tube") {
          changed++;
          shape.sections.forEach((section, i) => {
            expect(section.center).toEqual(previous.sections[i].center);
            expect(section.radius).toBe(previous.sections[i].radius * 1.5);
            if (section.axisX) expect(section.axisX).toEqual(previous.sections[i].axisX!.map((value) => value * 1.5));
          });
        } else expect(shape).toEqual(previous);
      }
    });
    expect(changed).toBeGreaterThan(asset.geometryLods.length);
    expect(() => scaleProceduralPlantWood(asset, woody, 0)).toThrow();
  });
  it("reads current project resource references and authored zero channels instead of static preview defaults", async () => {
    const doc = createSeedPlanningDocument(1);
    const red = plantMaterialField(speciesId, leafSlot.materialId, "r");
    doc.entities.world.components.plantMaterial = { values: { [red]: 0 } };
    const planning = new PlanningSession(exportPlanningRecipe(doc), undefined, doc);
    const source = { asset: { version: "2.0" }, scene: { rootEntities: [] }, entities: [], components: [] };
    const draft = new RuntimeProjectEdit(
      {
        version: RUNTIME_PROJECT_SAVE_VERSION,
        project: {
          ...manifest,
          scene: "main.scene",
          files: [...manifest.files, { virtualPath: "main.scene", path: "main.scene", type: "Scene", dependencies: [] }]
        },
        contents: { "main.scene": JSON.stringify(source) }
      },
      nativeAssetFormats(() => ({}))
    );
    writePlanningProjectSource(draft, "main.scene", doc);
    const pack = draft.preview();
    const project = {
      publicationRevision: 0,
      projectPackage: pack,
      fileProvider: () => ({
        read: (path: string) => pack.contents[path] ?? JSON.stringify(read(path))
      })
    } as unknown as RuntimeProjectSession;
    const authoring = new PlanningTreeAuthoring({
      project,
      planning,
      editor: {} as RuntimeNativeEditor,
      application: {} as SeedWorldAgentApplication
    });
    const snapshot = await authoring.snapshot(speciesId);
    expect(snapshot.assetId).toBe(speciesId);
    expect(snapshot.instanceEditable).toBe(true);
    expect(snapshot.species.map((entry) => entry.id)).toContain("SM_BirchBush_03");
    const slot = snapshot.slots.find((slot) => slot.id === leafSlot.materialId)!;
    expect(slot.baseColor[0]).toBe(0);
    expect(slot.baseColor.slice(1)).toEqual(appearance.assets[speciesId][leafSlot.materialId].baseColor.slice(1));
    expect(slot.sharedSlotCount).toBeGreaterThan(1);
    expect(slot.materialPath).toBe(materialPath);
    expect(
      Object.values(snapshot.landscape)
        .filter((value) => typeof value === "number")
        .every(Number.isFinite)
    ).toBe(true);
    const fir = await authoring.snapshot("cartoon/tree/highlands-fir-3-candidate/v1");
    const recipe = read("World/Vegetation/plant-species.json").treeRecipes.find(
      (entry: { id: string }) => entry.id === fir.assetId
    );
    expect(fir.slots.find((slot) => slot.part === "leaves")!.materialPath).toBe(recipe.leafMaterialFile.$ref);
    expect(fir.slots.find((slot) => slot.part === "bark")!.materialPath).toBe(recipe.trunkMaterialFile.$ref);
    expect(fir.instanceEditable).toBe(false);
    const understory = ["shrubs", "herbs", "cover", "flowers", "litter"];
    const groundCatalog = await authoring.snapshot(undefined, understory);
    for (const species of groundCatalog.species) {
      const plant = await authoring.snapshot(species.id, understory);
      expect(plant.assetId).toBe(species.id);
      expect(plant.layers!.some((layer) => understory.includes(layer))).toBe(true);
      expect(plant.slots.length).toBeGreaterThan(0);
      for (const slot of plant.slots) {
        expect(slot.materialPath).toBeTruthy();
        expect(slot.material.shader).toBeTruthy();
        expect(slot.baseColor.every((channel) => Number.isFinite(channel) && channel >= 0)).toBe(true);
      }
    }
    for (const [assetId, layer, parts] of [
      ["SM_CoverPlant_01", "cover", ["foliage"]],
      ["SM_Flower_01_01", "flowers", ["petals", "stem"]],
      ["SM_Mushroom_01", "litter", ["cap", "stem"]]
    ] as const) {
      const plant = await authoring.snapshot(assetId, understory);
      expect(plant.assetId).toBe(assetId);
      expect(plant.layers).toContain(layer);
      expect(plant.instanceEditable).toBe(false);
      expect(plant.species.some((species) => species.id === speciesId)).toBe(false);
      expect(plant.slots.map((slot) => slot.part)).toEqual(expect.arrayContaining([...parts]));
      for (const slot of plant.slots) {
        expect(slot.materialPath).toBe(appearance.assets[assetId][slot.id].material.$ref);
        expect(slot.label).not.toBe("树叶");
        if (parts.some((part) => part === "cap") && slot.part === "stem") expect(slot.label).toMatch(/^菌柄/);
      }
      expect(plantLandscapeControls(plant.layers).map((field) => field.key)).toEqual([
        `vegetation.${layer}`, `plantSizes.${layer}.scaleMin`, `plantSizes.${layer}.scaleMax`
      ]);
      const slot = plant.slots[0];
      const field = plantMaterialField(assetId, slot.id, "b", slot.part);
      const next = planning.prepare([{op: "set", entity: "world", component: "plantMaterial", values: {[field]: 2.5}}]);
      expect(readPlantMaterialParameters(JSON.parse(JSON.stringify(next)))[field]).toBe(2.5);
    }
    const hdr = planning.prepare([{ op: "set", entity: "world", component: "plantMaterial", values: { [red]: 3.5 } }]);
    expect(readPlantMaterialParameters(JSON.parse(JSON.stringify(hdr)))[red]).toBe(3.5);
    for (const invalid of [-1, NaN, Infinity])
      expect(() => validatePlantMaterialParameters({ [red]: invalid })).toThrow();
  });

  it("separates a tube reused by woody and non-woody parts, including explicit LOD shape bindings", () => {
    const resolution = { subdivisionsPerSpan: 1, widthSegments: 1, radialSegments: 8 };
    const asset: ProceduralPlantAsset = {
      version: 1,
      id: "shared-organs",
      category: "Trees",
      materialSlots: { wood: "Bark", other: "Leaves" },
      geometryLods: [
        {
          version: 1,
          shapes: {
            tube: {
              kind: "tube",
              capStart: false,
              capEnd: false,
              sections: [
                { at: 0, center: [0, 0, 0], radius: 1 },
                { at: 1, center: [0, 1, 0], radius: 1 }
              ]
            }
          },
          parts: ["wood", "other"].map((id) => ({
            id,
            shapeId: "tube",
            materialId: id,
            parentId: null,
            attachment: 0,
            offset: [0, 0, 0],
            orientation: [0, 0, 0, 1],
            scale: 1
          })),
          lods: [
            {
              partIds: ["wood", "other"],
              resolution,
              shapeIdsByPart: { wood: "tube", other: "tube" },
              resolutionsByShape: { tube: resolution }
            }
          ]
        }
      ]
    };
    const next = scaleProceduralPlantWood(asset, new Set(["wood"]), 2).geometryLods[0];
    const woodyShape = next.parts.find((part) => part.id === "wood")!.shapeId;
    expect(woodyShape).not.toBe("tube");
    expect(next.shapes.tube).toEqual(asset.geometryLods[0].shapes.tube);
    const shape = next.shapes[woodyShape];
    expect(shape.kind === "tube" ? shape.sections.map((section) => section.radius) : undefined).toEqual([2, 2]);
    expect(next.lods[0].shapeIdsByPart).toEqual({ wood: woodyShape, other: "tube" });
    expect(next.lods[0].resolutionsByShape![woodyShape]).toEqual(resolution);
  });
});
