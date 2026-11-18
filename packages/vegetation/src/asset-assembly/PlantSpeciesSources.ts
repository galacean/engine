import { Vector4, MeshRenderer, type Entity, type Material, type ModelMesh } from "@galacean/engine";
import { PLANT_SPECIES_CATALOG, PLANT_SPECIES } from "./PlantSpeciesCatalog";
import { preparePlantPopulationMaterialColor } from "./ProceduralPlantMaterialBindings";
import { loadTreeSpeciesCandidates } from "./TreeSpeciesCandidates";
import { loadCatalogShrubSource } from "./ProceduralShrubSource";
import { loadPlantJSON } from "./ProceduralPlantResources";
import { plantSpeciesResourceUrl } from "./PlantSpeciesResources";
import {
  createProceduralTreeMeshesForLods,
  createProceduralTreeFoliageGeometryTuning,
  type ProceduralTreeSourceLodIndex
} from "./ProceduralTreeGenerator";
import { ProceduralTreeLeafGpuData } from "./ProceduralTreeLeafGpuData";
import {
  configureAssetAssemblyRendererInstance,
  createProceduralBarkPbrMaterial,
  createProceduralLeafPbrMaterial,
  expandProceduralTreeWindBounds,
  resolveProceduralTreeLeafFlutterRadius
} from "./TreeAssemblyRuntime";
import { VEGETATION_AUTHORING_REFERENCE_SCALE } from "./AssetAssemblyRenderProfile";
import type { ProceduralPlantLibraryRuntime } from "./ProceduralPlantLibraryRuntime";

type Source = ReturnType<ProceduralPlantLibraryRuntime["getPlacementSources"]>[number];

/** Catalog formats keep their native compiler and material contract; populations borrow the same renderer interface. */
export class PlantSpeciesSources {
  readonly levels: Map<string, Source>[];
  readonly transitionHeights = new Map<string, readonly number[]>();
  private readonly meshes = new Set<ModelMesh>();
  private readonly materials = new Set<Material>();
  private readonly frames: ProceduralTreeLeafGpuData[] = [];
  private constructor(
    private readonly root: Entity,
    levelCount: number
  ) {
    root.isActive = false;
    this.levels = Array.from({ length: levelCount }, () => new Map());
  }

  static async load(
    owner: Entity,
    sourceLods: readonly ProceduralTreeSourceLodIndex[],
    assetIds: ReadonlySet<string>
  ): Promise<PlantSpeciesSources> {
    const resources = new PlantSpeciesSources(owner.createChild("Catalog plant sources"), sourceLods.length);
    const engine = owner.engine,
      scale = VEGETATION_AUTHORING_REFERENCE_SCALE;
    try {
      for (const recipe of await loadTreeSpeciesCandidates(engine, assetIds)) {
        const tuning = recipe.proceduralRuntime!;
        const lods = createProceduralTreeMeshesForLods(
          engine,
          recipe,
          sourceLods,
          tuning.leafCountTuning,
          tuning.distributionTuning,
          {
            ...createProceduralTreeFoliageGeometryTuning(tuning.leafCardTuning, tuning.billboardTuning),
            lodScales: tuning.foliageLodScales
          },
          tuning.triangleBudget
        );
        for (const lod of lods) {
          resources.meshes.add(lod.trunk);
          resources.meshes.add(lod.crown);
        }
        const parts = [lods[0].trunk, lods[0].crown];
        const coordinates = (mesh: ModelMesh, maximum: boolean) => {
          const v = maximum ? mesh.bounds.max : mesh.bounds.min;
          return [v.x, v.y, v.z];
        };
        const bounds = {
          min: [0, 1, 2].map((axis) => Math.min(...parts.map((mesh) => coordinates(mesh, false)[axis])) * scale) as [
            number,
            number,
            number
          ],
          max: [0, 1, 2].map((axis) => Math.max(...parts.map((mesh) => coordinates(mesh, true)[axis])) * scale) as [
            number,
            number,
            number
          ]
        };
        const frames = new ProceduralTreeLeafGpuData(
          engine,
          lods[0].leafGpuFrames,
          recipe.label,
          lods[0].leafNormalField
        );
        resources.frames.push(frames);
        const bark = createProceduralBarkPbrMaterial(recipe.trunkMaterial, lods[0].generatedHeight);
        resources.materials.add(bark);
        const leaves = createProceduralLeafPbrMaterial(
          recipe.leafMaterial,
          recipe.leafMask,
          lods[0].generatedHeight,
          tuning.preserveLeafMaterialFeatures
        );
        resources.materials.add(leaves);
        const colors = {
          bark: preparePlantPopulationMaterialColor(bark),
          leaf: preparePlantPopulationMaterialColor(leaves)
        };
        const entry = PLANT_SPECIES.find((entry) => entry.id === recipe.id)!;
        resources.transitionHeights.set(entry.id, [...recipe.lodGroup.screenRelativeTransitionHeights, 0]);
        lods.forEach((lod, level) => {
          expandProceduralTreeWindBounds(lod.trunk, 0);
          expandProceduralTreeWindBounds(
            lod.crown,
            resolveProceduralTreeLeafFlutterRadius(lod.leafGpuFrames, lod.leafGpuFrameScale)
          );
          const bindings = (
            [
              ["bark", lod.trunk, bark],
              ["leaf", lod.crown, leaves]
            ] as const
          ).map(([materialId, mesh, material]) => {
            const child = resources.root.createChild(`${entry.id}/${level}/${materialId}`);
            child.transform.setScale(scale, scale, scale);
            const renderer = child.addComponent(MeshRenderer);
            renderer.mesh = mesh;
            renderer.setMaterial(material);
            renderer.enableVertexColor = true;
            configureAssetAssemblyRendererInstance(renderer);
            if (materialId === "leaf") {
              frames.bind(renderer, lod.leafGpuFrameScale);
            }
            renderer.shaderData.setVector4("renderer_AssetAssemblyColor", new Vector4(...colors[materialId], 1));
            return { materialId, renderer, authoredColorScale: colors[materialId] };
          });
          resources.levels[level].set(entry.id, {
            entry,
            bounds,
            rendererBindings: bindings,
            renderers: bindings.map((b) => b.renderer)
          });
        });
      }
      const catalog = await loadPlantJSON<typeof PLANT_SPECIES_CATALOG>(
        engine,
        plantSpeciesResourceUrl("plant-species.json", engine)
      );
      for (const descriptor of catalog.shrubRecipes.filter((entry) => assetIds.has(entry.id))) {
        const source = await loadCatalogShrubSource(engine, descriptor);
        for (const lod of source.lods) for (const part of lod.renderers) resources.meshes.add(part.mesh as ModelMesh);
        const entry = PLANT_SPECIES.find((entry) => entry.id === descriptor.id)!;
        resources.transitionHeights.set(entry.id, source.lodGroup!.screenRelativeTransitionHeights);
        const bounds = {
          min: source.geometryBounds!.min.map((value) => value * scale) as [number, number, number],
          max: source.geometryBounds!.max.map((value) => value * scale) as [number, number, number]
        };
        const appearances = new Map<Material, { material: Material; color: readonly [number, number, number] }>();
        // Shrub descriptors preserve their authored sequential LODs, unlike the four-slot tree contract.
        source.lods.forEach((lod, level) => {
          if (level >= resources.levels.length) throw new Error(`Unsupported shrub LOD count: ${entry.id}`);
          const bindings = lod.renderers.map((part) => {
            const child = resources.root.createChild(`${entry.id}/${level}`);
            child.transform.setScale(scale, scale, scale);
            const renderer = child.addComponent(MeshRenderer);
            let appearance = appearances.get(part.material);
            if (!appearance) {
              const material = part.material.clone();
              resources.materials.add(material);
              appearance = { material, color: preparePlantPopulationMaterialColor(material) };
              appearances.set(part.material, appearance);
            }
            renderer.mesh = part.mesh;
            renderer.setMaterial(appearance.material);
            configureAssetAssemblyRendererInstance(renderer);
            renderer.shaderData.setVector4("renderer_AssetAssemblyColor", new Vector4(...appearance.color, 1));
            return {
              renderer,
              materialId: Object.keys(descriptor.materialFiles)[0],
              authoredColorScale: appearance.color
            };
          });
          resources.levels[level].set(entry.id, {
            entry,
            bounds,
            rendererBindings: bindings,
            renderers: bindings.map((b) => b.renderer)
          });
        });
      }
      return resources;
    } catch (error) {
      resources.destroy();
      throw error;
    }
  }

  destroy(): void {
    this.root.destroy();
    for (const mesh of this.meshes) mesh.destroy();
    for (const material of this.materials) material.destroy();
    for (const frames of this.frames) frames.destroy();
    this.meshes.clear();
    this.materials.clear();
    this.frames.length = 0;
    for (const level of this.levels) level.clear();
  }
}
