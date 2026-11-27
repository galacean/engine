import { describe, expect, it, vi } from "vitest";
import { ShaderData, ShaderDataGroup, type Material, type MeshRenderer } from "@galacean/engine-core";
import { Color, Vector4 } from "@galacean/engine-math";
import {
  PlanningTreeAuthoring,
  type PlanningTreeSnapshot
} from "../../demos/seed-world/src/planning/spatial/runtime/PlanningTreeAuthoring";
import type { LandscapePlantInstance } from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import type { PlanningNaturalVegetationRuntime as VegetationRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime";
import { PlanningTreePanel } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningTreePanel";
import { PLANT_MATERIAL_SLOTS } from "@galacean/engine-world-planning/spatial/PlantMaterialParameters";
import { planningVegetationCatalog } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningVegetationCatalog";
import {
  encodePlantPigment,
  patchVegetationColor,
  VegetationColors,
  type VegetationColorTarget
} from "@galacean/engine-world-planning/spatial/VegetationColors";

vi.hoisted(() => {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
});
const shaderData = (group: ShaderDataGroup) =>
  new (ShaderData as unknown as { new (group: ShaderDataGroup): ShaderData })(group);

describe("immediate tree appearance", () => {
  it("paints the oasis flower brush and the template cushions occupying the same ground", async () => {
    const { createTemplatePlanningDocument } = await import(
      "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring"
    );
    const { generatePlanningDocument } = await import("@galacean/engine-world-planning/spatial/PlanningRuntime");
    const { planningHeightmap } = await import("@galacean/engine-world-planning/semantic-study/PlanningHeightmap");
    const { planningSpatialSnapshotReader } = await import(
      "../../demos/seed-world/src/planning/spatial/runtime/PlanningSpatialQueries"
    );
    const { planningPickAssets } = await import("@galacean/engine-world-planning/spatial/runtime/PlanningWorldPicking");
    const { PlanningNaturalVegetation } = await import(
      "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetation"
    );
    const { PlanningNaturalVegetationRuntime } = await import(
      "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime"
    );
    const { PLANT_SPECIES_CATALOG } = await import("@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog");
    const { SEED_WORLD_POPULATION_CELL_METRES: cell } = await import(
      "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan"
    );
    const document = createTemplatePlanningDocument(42, "titan-wasteland");
    const result = generatePlanningDocument(document);
    const { plan } = result;
    const brush = document.authoredResources!.find((r) => r.resourceId.endsWith(":island-purple-flowers"));
    if (brush?.resourceType !== "vegetation-brush") throw new Error("Missing oasis flower planting");
    const { x, z, radiusMetres } = brush.properties;
    const region = plan.flowerRegions!.find((r) => r.ownerId === brush.resourceId)!;
    const colors = new VegetationColors([
      patchVegetationColor(
        undefined,
        {
          kind: "area",
          id: "oasis-blue",
          targetKinds: ["flower"],
          shape: { kind: "circle", center: { x, z }, radiusMetres },
          featherMetres: 0
        },
        { foliageColorRgb: [0, 0, 255] }
      )!
    ]);
    const native = Object.assign(Object.create(PlanningNaturalVegetationRuntime.prototype), {
      plan,
      localColors: colors,
      metadataSources: new Map()
    });
    native.populateMetadataFromCatalog(PLANT_SPECIES_CATALOG);
    const { fields, population } = planningSpatialSnapshotReader({ result })();
    const planner = new PlanningNaturalVegetation(
      plan,
      planningHeightmap(plan),
      fields,
      population,
      native.buildPlantAssetsFromMetadata()
    );
    const inside = (position: readonly number[]) => Math.hypot(position[0] - x, position[2] - z) < radiusMetres;
    const blue = encodePlantPigment([0, 0, 255], 1);
    let nativeFlowers = 0;
    for (let cz = Math.floor((z - radiusMetres) / cell); cz <= Math.floor((z + radiusMetres) / cell); cz++) {
      for (let cx = Math.floor((x - radiusMetres) / cell); cx <= Math.floor((x + radiusMetres) / cell); cx++) {
        for (const plant of planner.compileCell(cx, cz).instances) {
          if (plant.scopeId !== region.id || plant.layerId !== "零星野花" || !inside(plant.position)) continue;
          const petals = PLANT_MATERIAL_SLOTS.find((slot) => slot.assetId === plant.assetId && slot.part === "petals")!;
          expect(native.pigmentCode(plant, petals.materialId)).toBe(blue);
          nativeFlowers++;
        }
      }
    }
    expect(nativeFlowers).toBeGreaterThan(0);
    const cushions = planningPickAssets(plan).filter(
      (a) => a.properties.species === "pastel-flower" && inside(a.position!)
    );
    expect(cushions.length).toBeGreaterThan(0);
    for (const { ref, position } of cushions) {
      expect(colors.shaderCode({ id: ref.id, kind: "flower", position }, "foliageColorRgb")).toBe(blue);
    }
  }, 60_000);
  it("composites feathered flower polygons over an existing field by root position and species", () => {
    const owner: VegetationColorTarget = { kind: "asset", assetKind: "flower-field", id: "bed" };
    const bank: VegetationColorTarget = {
      kind: "area",
      id: "bank",
      targetKinds: ["flower"],
      assetIds: ["poppy"],
      featherMetres: 2,
      shape: {
        kind: "polygon",
        points: [
          { x: 0, z: 0 },
          { x: 8, z: 0 },
          { x: 8, z: 8 },
          { x: 0, z: 8 }
        ]
      }
    };
    const colors = new VegetationColors([
      patchVegetationColor(undefined, owner, { foliageColorRgb: [255, 0, 0] })!,
      patchVegetationColor(undefined, bank, { foliageColorRgb: [0, 0, 255] })!
    ]);
    const flower = { id: "A", kind: "flower" as const, assetId: "poppy", regionId: "flowers:bed", ownerId: "bed" };
    const at = (x: number, assetId = "poppy") =>
      colors.resolve({ ...flower, assetId, position: [x, 0, 4] }, "foliageColorRgb");
    expect(at(4)).toMatchObject({ colorRgb: [0, 0, 255], sourceId: "bank", weight: 1 });
    expect(at(1)).toMatchObject({ colorRgb: [188, 0, 188], weight: 1 });
    expect(at(0)).toMatchObject({ colorRgb: [255, 0, 0], sourceId: "bed" });
    expect(at(9)).toMatchObject({ colorRgb: [255, 0, 0], sourceId: "bed" });
    expect(at(4, "daisy")).toMatchObject({ colorRgb: [255, 0, 0], sourceId: "bed" });
    expect(colors.resolve(flower, "barkColorRgb").source).toBe("species-default");
  });
  it("uses the flowering plant's authored owner for its petals while retaining the original stem", async () => {
    const { PlanningNaturalVegetationRuntime } = await import(
      "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime"
    );
    const region = { id: "generated-bed", ownerId: "painted-bed", areaM2: 10 };
    const owner = { kind: "asset", assetKind: "flower-field", id: region.ownerId } as const;
    const localColors = new VegetationColors([
      patchVegetationColor(undefined, owner, { foliageColorRgb: [0, 0, 255] })!
    ]);
    const runtime = Object.assign(Object.create(PlanningNaturalVegetationRuntime.prototype), {
      plan: { flowerRegions: [region] },
      localColors,
      previewColors: new Map(),
      materialParameters: {}
    });
    const slotColors = new Map<string, number>();
    const assetId = "SM_Flower_08_01";
    const instance = { id: "flower", assetId, scopeId: region.id, position: [1, 0, 2], layerId: "零星野花" };
    const data = shaderData(ShaderDataGroup.Renderer);
    data.setVector4("renderer_AssetAssemblyColor", new Vector4(1, 1, 1, 1));
    for (const { part, materialId } of PLANT_MATERIAL_SLOTS.filter((slot) => slot.assetId === assetId)) {
      slotColors.set(part, runtime.plantColor(instance, { materialId, renderer: { shaderData: data } }).w);
    }
    expect(slotColors.get("stem")).toBe(1);
    expect(Math.abs(slotColors.get("petals")!)).toBeGreaterThan(1);
    const snapshot = { flowers: [region], seed: 1, authoredPlantIds: [owner.id], trees: [] };
    const [asset] = planningVegetationCatalog({
      getAuthoringSnapshot: () => snapshot as ReturnType<VegetationRuntime["getAuthoringSnapshot"]>
    });
    expect(asset!.relations?.parent).toMatchObject({ kind: "flower-field", source: "authored", id: owner.id });
  });
  it("ignores a removed controller's late blur after a part, species or publication switch", () => {
    const previewAppearance = vi.fn(),
      snapshot = { assetId: "subject" } as PlanningTreeSnapshot;
    const panel = Object.assign(Object.create(PlanningTreePanel.prototype), {
      disposed: false,
      snapshot,
      selected: { assetId: "subject", slotId: "leaf" },
      authoring: { previewAppearance },
      writeStatus: vi.fn()
    }) as {
      snapshot: PlanningTreeSnapshot;
      selected: { assetId: string; slotId: string };
      previewAppearance(
        snapshot: PlanningTreeSnapshot,
        slot: string,
        change: { baseColor: readonly [number, number, number] }
      ): void;
    };
    const change = { baseColor: [1, 0.2, 0.3] as const };
    panel.previewAppearance(snapshot, "leaf", change);
    expect(previewAppearance).toHaveBeenCalledWith(snapshot, "leaf", change);
    previewAppearance.mockClear();
    panel.selected.slotId = "bark";
    panel.previewAppearance(snapshot, "leaf", change);
    panel.selected = { assetId: "other-tree", slotId: "leaf" };
    panel.previewAppearance(snapshot, "leaf", change);
    panel.selected = { assetId: "subject", slotId: "leaf" };
    panel.snapshot = { ...snapshot, revision: 2 };
    panel.previewAppearance(snapshot, "leaf", change);
    expect(previewAppearance).not.toHaveBeenCalled();
  });

  it("synchronously updates every resident LOD and hidden tree, and retains the same preview for future residents", async () => {
    const { PlanningNaturalVegetationRuntime } = await import(
      "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime"
    );
    const material = { shaderData: shaderData(ShaderDataGroup.Material) } as Material;
    const renderer = () => {
      const data = shaderData(ShaderDataGroup.Renderer);
      data.setVector4("renderer_AssetAssemblyColor", new Vector4(0.3, 0.4, 0.5, 1));
      data.setVector4("renderer_ProceduralTreeLeafColor", new Vector4(0.3, 0.4, 0.5, 1));
      return { shaderData: data, getMaterials: () => [material] } as unknown as MeshRenderer;
    };
    const source = { materialId: "leaf", renderer: renderer() };
    const plant = (assetId = "tree") => ({
      instance: { assetId } as LandscapePlantInstance,
      appearanceBindings: [renderer(), renderer(), renderer()].map((renderer) => ({ renderer, source }))
    });
    const active = plant(),
      hidden = plant(),
      resident = plant(),
      other = plant("other-tree");
    const pool = new Map([
      ["active", active],
      ["hidden", hidden],
      ["other", other]
    ]);
    const runtime = Object.assign(Object.create(PlanningNaturalVegetationRuntime.prototype), {
      disposed: false,
      previewColors: new Map(),
      previewSurfaces: new WeakMap(),
      sources: [new Map([["tree", { rendererBindings: [source] }]])],
      treePool: pool,
      cells: new Map([["cell", { plants: [resident] }]])
    }) as VegetationRuntime;
    expect(
      runtime.previewAppearance("tree", "leaf", {
        baseColor: [0, 0.2, 2.8],
        shaderData: { material_LeafAlbedoBrightness: 1.35, material_SecondColor: [0.1, 0.2, 0.3, 0] },
        macros: { MATERIAL_ENABLE_SECOND_COLOR: true }
      })
    ).toBeUndefined();
    for (const tree of [active, hidden, resident])
      for (const { renderer } of tree.appearanceBindings) {
        expect(renderer.shaderData.getVector4("renderer_AssetAssemblyColor")).toEqual(new Vector4(0, 0.2, 2.8, 1));
        expect(renderer.shaderData.getVector4("renderer_ProceduralTreeLeafColor")).toEqual(new Vector4(0, 0.2, 2.8, 1));
        expect(renderer.shaderData.getMacros().map((macro) => macro.name)).toContain("RENDERER_PLANT_COLOR_OVERRIDE_R");
      }
    expect(other.appearanceBindings[0].renderer.shaderData.getVector4("renderer_AssetAssemblyColor")).toEqual(
      new Vector4(0.3, 0.4, 0.5, 1)
    );
    expect(material.shaderData.getFloat("material_LeafAlbedoBrightness")).toBe(1.35);
    expect(material.shaderData.getColor("material_SecondColor")).toEqual(new Color(0.1, 0.2, 0.3, 0));
    expect(material.shaderData.getMacros().map((macro) => macro.name)).toContain("MATERIAL_ENABLE_SECOND_COLOR");
    expect(source.renderer.shaderData.getVector4("renderer_AssetAssemblyColor")).toEqual(new Vector4(0.3, 0.4, 0.5, 1));
    const future = (
      runtime as unknown as { plantColor(instance: LandscapePlantInstance, source: unknown): Vector4 }
    ).plantColor(active.instance, source);
    expect(future).toEqual(new Vector4(0, 0.2, 2.8, 1));
    expect(runtime.appearancePreview("tree", "leaf")).toMatchObject({
      baseColor: [0, 0.2, 2.8],
      shaderData: { material_LeafAlbedoBrightness: 1.35 }
    });
    expect((runtime as unknown as { treePool: unknown }).treePool).toBe(pool);
    expect(() => runtime.previewAppearance("tree", "leaf", { baseColor: [NaN, 0, 0] })).toThrow();
    expect(material.shaderData.getFloat("material_LeafAlbedoBrightness")).toBe(1.35);
  });

  it("routes picker input immediately without opening a project transaction", () => {
    const previewAppearance = vi.fn(),
      beginEdit = vi.fn();
    const authoring = new PlanningTreeAuthoring({
      project: {} as never,
      planning: {} as never,
      application: {} as never,
      editor: { beginEdit } as never,
      readVegetation: () => ({ previewAppearance, appearancePreview: () => ({}) })
    });
    const snapshot = {
      assetId: "selected-tree",
      slots: [
        {
          id: "selected-leaf",
          material: {
            shader: "Terrain/Vegetation",
            shaderData: { material_SecondColor: { type: "Color", value: { r: 0, g: 0, b: 0, a: 1 } } },
            macros: []
          }
        }
      ]
    } as unknown as PlanningTreeSnapshot;
    authoring.previewAppearance(snapshot, "selected-leaf", {
      baseColor: [0, 0.2, 2.8],
      material: { secondColor: [4, 2, 1], secondColorEnabled: true, albedoBrightness: 1.35 }
    });
    expect(previewAppearance).toHaveBeenCalledWith("selected-tree", "selected-leaf", {
      baseColor: [0, 0.2, 2.8],
      shaderData: { material_SecondColor: [4, 2, 1, 1], material_LeafAlbedoBrightness: 1.35 },
      macros: { MATERIAL_ENABLE_SECOND_COLOR: true }
    });
    expect(beginEdit).not.toHaveBeenCalled();
    expect(authoring.busy).toBe(false);
  });

  it("accepts only edited preview fields for persistence, retaining HDR energy, zeros and disabled switches", async () => {
    const authoring = new PlanningTreeAuthoring({
      project: {} as never,
      planning: {} as never,
      application: {} as never,
      editor: {} as never,
      readVegetation: () => ({
        previewAppearance: vi.fn(),
        appearancePreview: () => ({
          baseColor: [0, 0.2, 3.5],
          shaderData: { material_SecondColor: [4, 2, 1, 0.4], material_LeafAlbedoBrightness: 0 },
          macros: { MATERIAL_ENABLE_SECOND_COLOR: false }
        })
      })
    });
    const apply = vi.spyOn(authoring, "apply").mockResolvedValue();
    const snapshot = { assetId: "tree" } as PlanningTreeSnapshot;
    await authoring.saveAppearance(snapshot, "leaf");
    expect(apply).toHaveBeenCalledWith(snapshot, {
      appearance: {
        slotId: "leaf",
        baseColor: [0, 0.2, 3.5],
        material: { secondColor: [4, 2, 1], albedoBrightness: 0, secondColorEnabled: false }
      }
    });
  });
});
