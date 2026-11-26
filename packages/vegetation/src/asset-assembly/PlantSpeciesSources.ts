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
  private readonly loadedIds = new Set<string>();
  private constructor(
    private readonly root: Entity,
    private readonly sourceLods: readonly ProceduralTreeSourceLodIndex[]
  ) {
    root.isActive = false;
    this.levels = Array.from({ length: sourceLods.length }, () => new Map());
  }

  static async load(
    owner: Entity,
    sourceLods: readonly ProceduralTreeSourceLodIndex[],
    assetIds: ReadonlySet<string>
  ): Promise<PlantSpeciesSources> {
    const resources = new PlantSpeciesSources(owner.createChild("Catalog plant sources"), sourceLods);
    try {
      await resources.ensureAssets(assetIds);
      return resources;
    } catch (error) {
      resources.destroy();
      throw error;
    }
  }

  async ensureAssets(assetIds: ReadonlySet<string>): Promise<void> {
    const pendingTreeIds = new Set(
      [...assetIds].filter(
        (id) => !this.loadedIds.has(id) && PLANT_SPECIES_CATALOG.treeRecipes.some((entry) => entry.id === id)
      )
    );
    const pendingShrubIds = new Set(
      [...assetIds].filter(
        (id) => !this.loadedIds.has(id) && PLANT_SPECIES_CATALOG.shrubRecipes.some((entry) => entry.id === id)
      )
    );
    if (!pendingTreeIds.size && !pendingShrubIds.size) return;

    const engine = this.root.engine,
      scale = VEGETATION_AUTHORING_REFERENCE_SCALE;
    if (pendingTreeIds.size > 0) {
      for (const recipe of await loadTreeSpeciesCandidates(engine, pendingTreeIds)) {
        const tuning = recipe.proceduralRuntime!;
        const lods = createProceduralTreeMeshesForLods(
          engine,
          recipe,
          this.sourceLods,
          tuning.leafCountTuning,
          tuning.distributionTuning,
          {
            ...createProceduralTreeFoliageGeometryTuning(tuning.leafCardTuning, tuning.billboardTuning),
            lodScales: tuning.foliageLodScales
          },
          tuning.triangleBudget
        );
        for (const lod of lods) {
          this.meshes.add(lod.trunk);
          this.meshes.add(lod.crown);
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
        this.frames.push(frames);
        const bark = createProceduralBarkPbrMaterial(recipe.trunkMaterial, lods[0].generatedHeight);
        this.materials.add(bark);
        const leaves = createProceduralLeafPbrMaterial(
          recipe.leafMaterial,
          recipe.leafMask,
          lods[0].generatedHeight,
          tuning.preserveLeafMaterialFeatures
        );
        this.materials.add(leaves);
        const colors = {
          bark: preparePlantPopulationMaterialColor(bark),
          leaf: preparePlantPopulationMaterialColor(leaves)
        };
        const entry = PLANT_SPECIES.find((entry) => entry.id === recipe.id)!;
        this.transitionHeights.set(entry.id, [...recipe.lodGroup.screenRelativeTransitionHeights, 0]);
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
            const child = this.root.createChild(`${entry.id}/${level}/${materialId}`);
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
          this.levels[level].set(entry.id, {
            entry,
            bounds,
            rendererBindings: bindings,
            renderers: bindings.map((b) => b.renderer)
          });
        });
        this.loadedIds.add(entry.id);
      }
    }
    if (pendingShrubIds.size > 0) {
      const catalog = await loadPlantJSON<typeof PLANT_SPECIES_CATALOG>(
        engine,
        plantSpeciesResourceUrl("plant-species.json", engine)
      );
      const pendingShrubDescriptors = catalog.shrubRecipes.filter((entry) => pendingShrubIds.has(entry.id));
      const settledShrubs = await Promise.allSettled(
        pendingShrubDescriptors.map(async (descriptor) => ({
          descriptor,
          source: await loadCatalogShrubSource(engine, descriptor)
        }))
      );
      const firstRejected = settledShrubs.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (firstRejected) {
        const destroyedMeshes = new Set<ModelMesh>();
        for (const result of settledShrubs) {
          if (result.status !== "fulfilled") continue;
          for (const lod of result.value.source.lods) {
            for (const part of lod.renderers) {
              const mesh = part.mesh as ModelMesh | undefined;
              if (mesh && !destroyedMeshes.has(mesh)) {
                destroyedMeshes.add(mesh);
                mesh.destroy();
              }
            }
          }
        }
        throw firstRejected.reason;
      }
      const loadedShrubs = settledShrubs.map(
        (result) =>
          (
            result as PromiseFulfilledResult<{
              descriptor: (typeof pendingShrubDescriptors)[number];
              source: Awaited<ReturnType<typeof loadCatalogShrubSource>>;
            }>
          ).value
      );
      for (const { descriptor, source } of loadedShrubs) {
        for (const lod of source.lods) for (const part of lod.renderers) this.meshes.add(part.mesh as ModelMesh);
        const entry = PLANT_SPECIES.find((entry) => entry.id === descriptor.id)!;
        this.transitionHeights.set(entry.id, source.lodGroup!.screenRelativeTransitionHeights);
        const bounds = {
          min: source.geometryBounds!.min.map((value) => value * scale) as [number, number, number],
          max: source.geometryBounds!.max.map((value) => value * scale) as [number, number, number]
        };
        const appearances = new Map<Material, { material: Material; color: readonly [number, number, number] }>();
        // Shrub descriptors preserve their authored sequential LODs, unlike the four-slot tree contract.
        source.lods.forEach((lod, level) => {
          if (level >= this.levels.length) throw new Error(`Unsupported shrub LOD count: ${entry.id}`);
          const bindings = lod.renderers.map((part) => {
            const child = this.root.createChild(`${entry.id}/${level}`);
            child.transform.setScale(scale, scale, scale);
            const renderer = child.addComponent(MeshRenderer);
            let appearance = appearances.get(part.material);
            if (!appearance) {
              const material = part.material.clone();
              this.materials.add(material);
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
          this.levels[level].set(entry.id, {
            entry,
            bounds,
            rendererBindings: bindings,
            renderers: bindings.map((b) => b.renderer)
          });
        });
        this.loadedIds.add(entry.id);
      }
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
