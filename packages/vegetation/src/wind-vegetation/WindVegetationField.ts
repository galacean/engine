import {
  AssetType,
  BoundingBox,
  Camera,
  Engine,
  Entity,
  Material,
  MeshRenderer,
  PrefabResource,
  ShaderProperty,
  Vector3
} from "@galacean/engine";
import { TerrainLodGroupRendererRuntime } from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import { registerTerrainProjectResources } from "@galacean/engine-terrain/terrain/loader/TerrainSceneLoader";
import {
  resolveTerrainProjectPrefabGeometry,
  type TerrainProjectResolvedRenderer
} from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import {
  createTerrainDetailInstancedMesh,
  type TerrainDetailInstancedMesh
} from "@galacean/engine-terrain/terrain/project/TerrainDetailInstancedMesh";
import {
  TERRAIN_HERO_TREE_WIND_ASSETS,
  TerrainHeroTreeWindMaterialLibrary,
  resolveTerrainHeroTreeRenderer,
  type TerrainHeroTreeMaterials as HeroTreeMaterials,
  type TerrainHeroTreeWindAssetId
} from "@galacean/engine-terrain/terrain/project/TerrainHeroTreeWind";
import type { TerrainHeroTreeWindCalibrationKey } from "@galacean/engine-terrain/terrain/project/TerrainWindResponseProfiles";
import {
  cloneTerrainTreeWindResponseControls,
  validateTerrainTreeWindResponseControls,
  type TerrainTreeWindResponseControls
} from "@galacean/engine-terrain/terrain/project/TerrainTreeWindResponseControls";
import type { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";

import PROJECT_URL from "@galacean/engine-terrain/data/grasslands/project.json?url";
const DETAIL_INSTANCE_MACRO = "RENDERER_DETAIL_INSTANCE";
const DETAIL_LOCAL_MATRIX = ShaderProperty.getByName("renderer_DetailLocalMatrix");
const DETAIL_LOCAL_NORMAL_MATRIX = ShaderProperty.getByName("renderer_DetailLocalNormalMat");
const DETAIL_TRANSFORM_FLOATS = 6;
const RESERVED_DETAIL_ATTRIBUTES = new Set(["DETAIL_POSITION_ROTATION", "DETAIL_SCALE"]);

/** Final asset-showcase footprint shared with the ground plane and overview camera. */
export const P3_SHOWCASE_SIZE_METERS = 50;
/** Authored grass clumps per square metre before tree-base clearings. */
export const P3_DENSE_GRASS_TARGET_DENSITY = 1 / (0.95 * 0.95);

type TreeWindPresentation = "hero" | "benchmark";
export type WindTreeMaterialMode = "baseline" | "hero";
export type WindTreeLodMode = "auto" | 0 | 1 | 2;

type HeroTreeCalibrationKey = TerrainHeroTreeWindCalibrationKey;

export const HERO_TREE_CALIBRATION_ASSETS = TERRAIN_HERO_TREE_WIND_ASSETS;
export type HeroTreeCalibrationAssetId = TerrainHeroTreeWindAssetId;

export interface WindVegetationFieldOptions {
  /** Equal-load broadleaf instances used by the Baseline/Hero/Baseline asset gate. */
  readonly treeBenchmarkCount?: number;
  /** Live production tree selected for the same-asset Baseline/Hero calibration pair. */
  readonly heroCalibrationAsset?: HeroTreeCalibrationAssetId;
  /** Shows every production tree variant together; an explicit asset query keeps single-asset calibration. */
  readonly showcaseAllTreeAssets?: boolean;
  /** Optional deterministic LOD projection used only by the calibration scene. */
  readonly initialTreeLodMode?: WindTreeLodMode;
}

interface TreeSpec {
  readonly id: string;
  readonly label: string;
  readonly prefab: string;
  readonly position: readonly [number, number, number];
  readonly rotation: number;
  readonly scale: number;
  readonly presentation: TreeWindPresentation;
  readonly calibration?: HeroTreeCalibrationKey;
}

interface GpuVegetationSpec {
  readonly id: string;
  readonly label: string;
  readonly prefab: string;
  readonly position: readonly [number, number, number];
  readonly rotation: number;
  readonly scale: number;
}

interface DenseGrassPrototype {
  readonly id: string;
  readonly label: string;
  readonly prefab: string;
  readonly mix: number;
  readonly minimumScale: number;
  readonly maximumScale: number;
}

interface DenseGrassBatch {
  readonly renderer: MeshRenderer;
  readonly resources: TerrainDetailInstancedMesh;
  readonly instances: number;
}

const DEFAULT_HERO_TREE_CALIBRATION_ASSET: HeroTreeCalibrationAssetId = "broadleaf-large-1";
const P3_TREE_POSITION = [0, 0, 0.7] as const;

function buildP3TreeSpecs(assetId: HeroTreeCalibrationAssetId): readonly TreeSpec[] {
  const asset = requireHeroTreeCalibrationAsset(assetId);
  return [
    {
      id: `${asset.id}-p3`,
      label: `${asset.label} · P3 Final`,
      prefab: asset.prefab,
      position: P3_TREE_POSITION,
      rotation: 18,
      scale: 0.82,
      presentation: "hero",
      calibration: asset.calibration
    }
  ];
}

function buildP3TreeShowcaseSpecs(): readonly TreeSpec[] {
  const columns = 4;
  const spacingX = 10.5;
  const spacingZ = 14;
  return HERO_TREE_CALIBRATION_ASSETS.map((asset, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const large = asset.calibration.endsWith("-large");
    return {
      id: `${asset.id}-p3`,
      label: `${asset.label} · P3 Final`,
      prefab: asset.prefab,
      position: [(column - (columns - 1) * 0.5) * spacingX, 0, (row - 0.5) * spacingZ] as const,
      rotation: ((index * 47) % 110) - 55,
      scale: large ? 0.58 : 0.7,
      presentation: "hero" as const,
      calibration: asset.calibration
    };
  });
}

const DEFAULT_P3_TREE_SPECS = buildP3TreeSpecs(DEFAULT_HERO_TREE_CALIBRATION_ASSET);

const P3_DENSE_GRASS_PROTOTYPES: readonly DenseGrassPrototype[] = [
  {
    id: "dense-grass-2",
    label: "Grass 2 dense meadow",
    prefab: "Prefab/Prototype/grass-grass-2.prefab",
    mix: 0.68,
    minimumScale: 0.78,
    maximumScale: 1.12
  },
  {
    id: "dense-grass-3",
    label: "Grass 3 dense meadow",
    prefab: "Prefab/Prototype/grass-grass-3.prefab",
    mix: 0.32,
    minimumScale: 0.7,
    maximumScale: 1.02
  }
];

function groundVegetation(
  id: string,
  label: string,
  prefabName: string,
  x: number,
  z: number,
  rotation: number,
  scale: number
): GpuVegetationSpec {
  return {
    id,
    label,
    prefab: `Prefab/Prototype/${prefabName}`,
    position: [x, 0, z],
    rotation,
    scale
  };
}

const P3_GPU_VEGETATION_SPECS: readonly GpuVegetationSpec[] = [
  groundVegetation("grass-2-a", "Grass 2", "grass-grass-2.prefab", -18, 20.5, 13, 1.15),
  groundVegetation("grass-2-b", "Grass 2", "grass-grass-2.prefab", -13, 20.5, 79, 1.05),
  groundVegetation("grass-2-c", "Grass 2", "grass-grass-2.prefab", -8, 20.5, 142, 1.1),
  groundVegetation("grass-2-d", "Grass 2", "grass-grass-2.prefab", -3, 20.5, 218, 1.18),
  groundVegetation("grass-2-e", "Grass 2", "grass-grass-2.prefab", 2, 20.5, 36, 1.2),
  groundVegetation("grass-2-f", "Grass 2", "grass-grass-2.prefab", 7, 20.5, 116, 1.1),
  groundVegetation("grass-2-g", "Grass 2", "grass-grass-2.prefab", 12, 20.5, 194, 1.16),
  groundVegetation("grass-2-h", "Grass 2", "grass-grass-2.prefab", 17, 20.5, 273, 1.08),
  groundVegetation("grass-3-a", "Grass 3", "grass-grass-3.prefab", -15, 17.8, 57, 1.1),
  groundVegetation("grass-3-b", "Grass 3", "grass-grass-3.prefab", -5, 17.8, 149, 1.14),
  groundVegetation("grass-3-c", "Grass 3", "grass-grass-3.prefab", 5, 17.8, 231, 1.06),
  groundVegetation("grass-3-d", "Grass 3", "grass-grass-3.prefab", 15, 17.8, 319, 1.12),
  groundVegetation("flowers-1-a", "Flowers 1", "flower-flowers-1.prefab", -7, 22.2, 28, 1.14),
  groundVegetation("flowers-1-b", "Flowers 1", "flower-flowers-1.prefab", -4.5, 22.5, 167, 1.2),
  groundVegetation("flowers-1-c", "Flowers 1", "flower-flowers-1.prefab", -2, 22.2, 284, 1.16),
  groundVegetation("flowers-2-a", "Flowers 2", "flower-flowers-2.prefab", 2, 22.2, 71, 1.18),
  groundVegetation("flowers-2-b", "Flowers 2", "flower-flowers-2.prefab", 4.5, 22.5, 206, 1.12),
  groundVegetation("flowers-2-c", "Flowers 2", "flower-flowers-2.prefab", 7, 22.2, 336, 1.2),
  groundVegetation("shrub-small-left", "Shrub Small", "shrub-bush-small.prefab", -10, 16.2, 18, 0.86),
  groundVegetation("shrub-small-right", "Shrub Small", "shrub-bush-small.prefab", -10, 19.2, 204, 0.9),
  groundVegetation("shrub-medium-left", "Shrub Medium", "shrub-bush-medium.prefab", 0, 16.2, 42, 0.82),
  groundVegetation("shrub-medium-right", "Shrub Medium", "shrub-bush-medium.prefab", 0, 19.2, 228, 0.84),
  groundVegetation("shrub-large-left", "Shrub Large", "shrub-bush-large.prefab", 10, 16.2, 67, 0.72),
  groundVegetation("shrub-large-right", "Shrub Large", "shrub-bush-large.prefab", 10, 19.2, 251, 0.74)
];

export const WIND_VEGETATION_COVERAGE = Object.freeze({
  p3Tree: buildP3TreeShowcaseSpecs().map(({ id, label, prefab, presentation }) => ({
    id,
    label,
    prefab,
    presentation
  })),
  p3GpuVegetation: P3_GPU_VEGETATION_SPECS.map(({ id, label, prefab }) => ({ id, label, prefab })),
  denseGrass: P3_DENSE_GRASS_PROTOTYPES.map(({ id, label, prefab, mix }) => ({ id, label, prefab, mix })),
  heroTreeCalibrationAssets: HERO_TREE_CALIBRATION_ASSETS
});

export interface WindVegetationFieldDiagnostics {
  readonly heroCalibrationAsset: HeroTreeCalibrationAssetId | "all";
  readonly treeLodMode: WindTreeLodMode;
  readonly treeInstances: number;
  readonly productionPrefabCount: number;
  readonly lodControllers: number;
  readonly statefulTreeConsumers: number;
  readonly p3TreeInstances: number;
  readonly p3GpuVegetationInstances: number;
  readonly vegetationSpecimenInstances: number;
  readonly denseGrassInstances: number;
  readonly denseGrassDrawBatches: number;
  readonly showcaseSizeMeters: number;
  readonly vegetationPrefabCount: number;
  readonly benchmarkTreeInstances: number;
  readonly treeMaterialMode: WindTreeMaterialMode | "p3";
  readonly treeWindResponseControls: Readonly<TerrainTreeWindResponseControls>;
}

interface TreeMaterialBinding {
  readonly renderer: MeshRenderer;
  readonly baseline: Material;
  readonly hero: Material;
}

/** A compact, production-asset vegetation field dedicated to observing wind response. */
export class WindVegetationField {
  private readonly _root: Entity;
  private readonly _lodControllers: TerrainLodGroupRendererRuntime[] = [];
  private readonly _vegetationLodControllers: TerrainLodGroupRendererRuntime[] = [];
  private readonly _denseGrassBatches: DenseGrassBatch[] = [];
  private readonly _benchmarkMaterialBindings: TreeMaterialBinding[] = [];
  private readonly _diagnostics: WindVegetationFieldDiagnostics;
  private _treeWindResponseControls = cloneTerrainTreeWindResponseControls();
  private _lockedMeanDirectionWS: [number, number, number] = [1, 0, 0];
  private _treeMaterialMode: WindTreeMaterialMode | "p3";
  private _treeLodMode: WindTreeLodMode;
  private _lastUpdateTimeSeconds = 0;
  private _destroyed = false;

  static async create(
    engine: Engine,
    parent: Entity,
    camera: Camera,
    wind: TerrainWindRuntime,
    options: Readonly<WindVegetationFieldOptions> = {}
  ): Promise<WindVegetationField> {
    await registerTerrainProjectResources(engine, PROJECT_URL);
    const benchmarkCount = validateTreeBenchmarkCount(options.treeBenchmarkCount ?? 0);
    const heroCalibrationAsset = validateHeroTreeCalibrationAsset(
      options.heroCalibrationAsset ?? DEFAULT_HERO_TREE_CALIBRATION_ASSET,
      benchmarkCount
    );
    const initialTreeLodMode = validateTreeLodMode(options.initialTreeLodMode ?? "auto");
    const showcaseAllTreeAssets = options.showcaseAllTreeAssets === true && benchmarkCount === 0;
    const treeSpecs =
      benchmarkCount > 0
        ? buildTreeBenchmarkSpecs(benchmarkCount)
        : showcaseAllTreeAssets
          ? buildP3TreeShowcaseSpecs()
          : buildP3TreeSpecs(heroCalibrationAsset);
    const vegetationSpecs = showcaseAllTreeAssets ? P3_GPU_VEGETATION_SPECS : [];
    const treePaths = [...new Set(treeSpecs.map((entry) => entry.prefab))];
    const vegetationPaths = [...new Set(vegetationSpecs.map((entry) => entry.prefab))];
    const denseGrassPrototypes = showcaseAllTreeAssets ? P3_DENSE_GRASS_PROTOTYPES : [];
    const denseGrassPaths = denseGrassPrototypes.map((entry) => entry.prefab);
    const requestedPaths = [...new Set([...treePaths, ...vegetationPaths, ...denseGrassPaths])];
    const mechanicalAssets = [
      ...new Map(
        treeSpecs
          .filter((entry) => entry.presentation === "hero" || entry.presentation === "benchmark")
          .map((entry) => {
            const asset = requireHeroTreeCalibrationAssetForPrefab(entry.prefab);
            return [asset.id, asset] as const;
          })
      ).values()
    ];
    const [resources, heroTreeWindMaterials] = await Promise.all([
      Promise.all(
        requestedPaths.map((url) => engine.resourceManager.load<PrefabResource>({ type: AssetType.Prefab, url }))
      ),
      TerrainHeroTreeWindMaterialLibrary.load(
        engine,
        mechanicalAssets.map((asset) => asset.id)
      )
    ]);
    const prefabs = new Map<string, PrefabResource>();
    requestedPaths.forEach((path, index) => {
      const prefab = resources[index];
      if (!(prefab instanceof PrefabResource)) throw new Error(`Wind vegetation asset did not resolve: ${path}`);
      prefabs.set(path, prefab);
    });
    return new WindVegetationField(
      parent,
      camera,
      wind,
      prefabs,
      treeSpecs,
      vegetationSpecs,
      denseGrassPrototypes,
      treePaths.length,
      vegetationPaths.length,
      benchmarkCount,
      showcaseAllTreeAssets ? "all" : heroCalibrationAsset,
      initialTreeLodMode,
      heroTreeWindMaterials
    );
  }

  private constructor(
    parent: Entity,
    private readonly _camera: Camera,
    private readonly _wind: TerrainWindRuntime,
    prefabs: ReadonlyMap<string, PrefabResource>,
    treeSpecs: readonly TreeSpec[],
    vegetationSpecs: readonly GpuVegetationSpec[],
    denseGrassPrototypes: readonly DenseGrassPrototype[],
    treePrefabCount: number,
    vegetationPrefabCount: number,
    benchmarkCount: number,
    heroCalibrationAsset: HeroTreeCalibrationAssetId | "all",
    initialTreeLodMode: WindTreeLodMode,
    private readonly _heroTreeWindMaterials: TerrainHeroTreeWindMaterialLibrary
  ) {
    this._root = parent.createChild("Wind vegetation production field");
    this._treeLodMode = initialTreeLodMode;
    this._treeMaterialMode = benchmarkCount > 0 ? "baseline" : "p3";
    try {
      for (const spec of treeSpecs) {
        this._instantiateLodPlant(
          requirePrefab(prefabs, spec.prefab),
          spec.id,
          spec.position,
          spec.rotation,
          spec.scale,
          this._camera,
          spec.presentation,
          spec.prefab,
          spec.calibration
        );
      }
      for (const spec of vegetationSpecs) {
        this._instantiateGpuVegetation(requirePrefab(prefabs, spec.prefab), spec);
      }
      const denseGrassTransforms = buildDenseGrassTransforms(denseGrassPrototypes, treeSpecs, vegetationSpecs);
      for (const prototype of denseGrassPrototypes) {
        this._instantiateDenseGrass(
          requirePrefab(prefabs, prototype.prefab),
          prototype,
          denseGrassTransforms.get(prototype.id) ?? new Float32Array()
        );
      }
      const denseGrassInstances = this._denseGrassBatches.reduce((total, batch) => total + batch.instances, 0);
      this._diagnostics = {
        heroCalibrationAsset,
        treeLodMode: this._treeLodMode,
        treeInstances: treeSpecs.length,
        productionPrefabCount: treePrefabCount,
        lodControllers: this._lodControllers.length,
        statefulTreeConsumers: 0,
        p3TreeInstances: benchmarkCount === 0 ? treeSpecs.length : 0,
        p3GpuVegetationInstances: vegetationSpecs.length + denseGrassInstances,
        vegetationSpecimenInstances: vegetationSpecs.length,
        denseGrassInstances,
        denseGrassDrawBatches: this._denseGrassBatches.length,
        showcaseSizeMeters: denseGrassPrototypes.length > 0 ? P3_SHOWCASE_SIZE_METERS : 0,
        vegetationPrefabCount,
        benchmarkTreeInstances: benchmarkCount,
        treeMaterialMode: this._treeMaterialMode,
        treeWindResponseControls: cloneTerrainTreeWindResponseControls(this._treeWindResponseControls)
      };
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  update(timeSeconds: number, deltaTimeSeconds: number): void {
    if (this._destroyed) return;
    this._lastUpdateTimeSeconds = timeSeconds;
    const calibrationProjection = treeLodScreenRelativeHeight(this._treeLodMode);
    for (let index = 0; index < this._lodControllers.length; index++) {
      const controller = this._lodControllers[index]!;
      if (calibrationProjection === null) controller.updateRenderers(timeSeconds);
      else controller.updateRenderersWithScreenRelativeHeight(timeSeconds, calibrationProjection);
    }
    for (let index = 0; index < this._vegetationLodControllers.length; index++) {
      this._vegetationLodControllers[index]!.updateRenderers(timeSeconds);
    }
    void deltaTimeSeconds;
  }

  /** Applies one named response-control set to every GPU tree Material variant. */
  setTreeWindResponseControls(controls: Readonly<TerrainTreeWindResponseControls>): void {
    validateTerrainTreeWindResponseControls(controls);
    if (controls.forcing.meanDirectionTracking < this._treeWindResponseControls.forcing.meanDirectionTracking) {
      const direction = this._wind.getSnapshot().direction;
      this._lockedMeanDirectionWS = [direction[0], direction[1], direction[2]];
    }
    this._treeWindResponseControls = cloneTerrainTreeWindResponseControls(controls);
    this._heroTreeWindMaterials.setResponseControls(this._treeWindResponseControls, this._lockedMeanDirectionWS);
  }

  getTreeWindResponseControls(): Readonly<TerrainTreeWindResponseControls> {
    return cloneTerrainTreeWindResponseControls(this._treeWindResponseControls);
  }

  /** Swaps only the benchmark Material variants; geometry, transforms, LOD and GPU state stay unchanged. */
  setTreeMaterialMode(mode: WindTreeMaterialMode): void {
    if (mode !== "baseline" && mode !== "hero") throw new RangeError(`Unknown tree Material mode: ${mode}`);
    if (this._benchmarkMaterialBindings.length === 0) {
      throw new Error("Tree Material mode switching requires a benchmark field");
    }
    if (this._treeMaterialMode === mode) return;
    for (const binding of this._benchmarkMaterialBindings) {
      binding.renderer.setMaterial(mode === "hero" ? binding.hero : binding.baseline);
    }
    this._treeMaterialMode = mode;
  }

  /** Drives every calibration tree through its real animated LOD transition at a deterministic projection. */
  setTreeLodMode(mode: WindTreeLodMode): void {
    const resolved = validateTreeLodMode(mode);
    if (this._treeLodMode === resolved) return;
    this._treeLodMode = resolved;
    const calibrationProjection = treeLodScreenRelativeHeight(resolved);
    for (const controller of this._lodControllers) {
      if (calibrationProjection === null) controller.snapToCurrentLod(this._lastUpdateTimeSeconds);
      else controller.updateWithScreenRelativeHeight(this._lastUpdateTimeSeconds, calibrationProjection);
    }
  }

  getRepresentativeTreeWindDiagnostics(): null {
    // The final tree response stays GPU-resident by design; diagnostics never read it back.
    return null;
  }

  getDiagnostics(): WindVegetationFieldDiagnostics {
    return {
      ...this._diagnostics,
      treeLodMode: this._treeLodMode,
      treeMaterialMode: this._treeMaterialMode,
      treeWindResponseControls: cloneTerrainTreeWindResponseControls(this._treeWindResponseControls)
    };
  }

  destroy(): void {
    if (this._destroyed) return;
    for (const controller of this._lodControllers) controller.disable();
    for (const controller of this._vegetationLodControllers) controller.disable();
    for (const batch of this._denseGrassBatches) disposeDenseGrassBatch(batch);
    this._denseGrassBatches.length = 0;
    this._root.destroy();
    this._heroTreeWindMaterials.destroy();
    this._destroyed = true;
  }

  private _instantiateGpuVegetation(prefab: PrefabResource, spec: Readonly<GpuVegetationSpec>): void {
    const geometry = resolveTerrainProjectPrefabGeometry(prefab, spec.id);
    if (!geometry) throw new Error(`P3 GPU vegetation ${spec.id} requires authored Renderer metadata`);
    const instance = prefab.instantiate();
    if (!instance) throw new Error(`P3 GPU vegetation ${spec.id} could not be instantiated`);
    instance.name = `p3-vegetation:${spec.id}`;
    this._root.addChild(instance);
    instance.transform.setPosition(...spec.position);
    instance.transform.setRotation(0, spec.rotation, 0);
    instance.transform.setScale(spec.scale, spec.scale, spec.scale);
    if (geometry.kind === "lod-group") {
      const lod = new TerrainLodGroupRendererRuntime(instance, this._camera, geometry.lodGroup, 0.22);
      lod.snapToCurrentLod(0);
      this._vegetationLodControllers.push(lod);
    }
  }

  private _instantiateDenseGrass(
    prefab: PrefabResource,
    prototype: Readonly<DenseGrassPrototype>,
    transforms: Float32Array
  ): void {
    if (!transforms.length) throw new Error(`Dense grass prototype ${prototype.id} has no meadow transforms`);
    const geometry = resolveTerrainProjectPrefabGeometry(prefab, prototype.id);
    if (!geometry) throw new Error(`Dense grass prototype ${prototype.id} requires authored Renderer metadata`);
    const bindings = geometry.kind === "renderers" ? geometry.renderers : geometry.lodGroup.lods[0]?.renderers;
    if (!bindings?.length) throw new Error(`Dense grass prototype ${prototype.id} requires a renderable LOD0`);
    bindings.forEach((binding, rendererIndex) => {
      validateDenseGrassBinding(prototype.id, binding);
      const entity = this._root.createChild(`p3-dense-grass:${prototype.id}:${rendererIndex}`);
      const renderer = entity.addComponent(MeshRenderer);
      let resources: TerrainDetailInstancedMesh | null = null;
      try {
        resources = createTerrainDetailInstancedMesh(
          this._root.engine,
          binding.mesh,
          transforms,
          detailBatchBounds(binding, transforms),
          `p3-dense-grass:${prototype.id}:${rendererIndex}`
        );
        renderer.mesh = resources.mesh;
        renderer.setMaterial(binding.material);
        renderer.castShadows = binding.castShadows;
        renderer.receiveShadows = binding.receiveShadows;
        renderer.enableVertexColor = binding.enableVertexColor;
        renderer.shaderData.enableMacro(DETAIL_INSTANCE_MACRO);
        renderer.shaderData.setMatrix(DETAIL_LOCAL_MATRIX, binding.localMatrix);
        renderer.shaderData.setMatrix(DETAIL_LOCAL_NORMAL_MATRIX, binding.localNormalMatrix);
        this._denseGrassBatches.push({
          renderer,
          resources,
          instances: transforms.length / DETAIL_TRANSFORM_FLOATS
        });
      } catch (error) {
        renderer.mesh = null!;
        renderer.setMaterials([]);
        entity.destroy();
        resources?.mesh.destroy();
        resources?.instanceBuffer.destroy();
        resources?.indexBuffer?.destroy();
        throw error;
      }
    });
  }

  private _instantiateLodPlant(
    prefab: PrefabResource,
    id: string,
    position: readonly [number, number, number],
    rotationDegrees: number,
    scale: number,
    camera: Camera,
    presentation: TreeWindPresentation,
    prefabUrl: string,
    calibrationKey?: HeroTreeCalibrationKey
  ): void {
    const geometry = resolveTerrainProjectPrefabGeometry(prefab, id);
    if (!geometry || geometry.kind !== "lod-group") {
      throw new Error(`Wind vegetation plant ${id} requires an authored LODGroup`);
    }
    const instance = prefab.instantiate();
    if (!instance) throw new Error(`Wind vegetation plant ${id} could not be instantiated`);
    instance.name = id;
    this._root.addChild(instance);
    instance.transform.setPosition(...position);
    instance.transform.setRotation(0, rotationDegrees, 0);
    instance.transform.setScale(scale, scale, scale);
    const lod = new TerrainLodGroupRendererRuntime(instance, camera, geometry.lodGroup, 0.28);
    const calibrationProjection = treeLodScreenRelativeHeight(this._treeLodMode);
    if (calibrationProjection === null) lod.snapToCurrentLod(0);
    else lod.snapWithScreenRelativeHeight(0, calibrationProjection);
    this._lodControllers.push(lod);
    const heroAsset = this._heroTreeWindMaterials.getAssetForPrefab(prefabUrl);
    if (!heroAsset || heroAsset.calibration !== calibrationKey) {
      throw new Error(`Wind vegetation Hero tree ${id} calibration does not match its production Prefab`);
    }
    const materials = this._heroTreeWindMaterials.getMaterials(prefabUrl, geometry.lodGroup.lods);
    if (presentation === "hero") {
      this._applyHeroTreeMaterials(instance, geometry.lodGroup.lods, materials, id, lod);
    } else if (presentation === "benchmark") {
      this._registerBenchmarkTreeMaterials(instance, geometry.lodGroup.lods, materials, id, lod);
    }
  }

  private _applyHeroTreeMaterials(
    instance: Entity,
    lods: readonly { readonly renderers: readonly TerrainProjectResolvedRenderer[] }[],
    materials: HeroTreeMaterials,
    id: string,
    controller: TerrainLodGroupRendererRuntime
  ): void {
    lods.forEach((lod, lodIndex) => {
      if (lod.renderers.length !== 2) {
        throw new Error(`Wind vegetation Hero tree ${id} LOD must preserve trunk/leaf Renderer parity`);
      }
      resolveTerrainHeroTreeRenderer(instance, lod.renderers[0], id).setMaterial(materials.lods[lodIndex].trunk);
      resolveTerrainHeroTreeRenderer(instance, lod.renderers[1], id).setMaterial(materials.lods[lodIndex].leaf);
    });
    void controller;
  }

  private _registerBenchmarkTreeMaterials(
    instance: Entity,
    lods: readonly { readonly renderers: readonly TerrainProjectResolvedRenderer[] }[],
    materials: HeroTreeMaterials,
    id: string,
    controller: TerrainLodGroupRendererRuntime
  ): void {
    lods.forEach((lod, lodIndex) => {
      if (lod.renderers.length !== 2) {
        throw new Error(`Wind vegetation benchmark tree ${id} LOD must preserve trunk/leaf Renderer parity`);
      }
      const trunkRenderer = resolveTerrainHeroTreeRenderer(instance, lod.renderers[0], id);
      const leafRenderer = resolveTerrainHeroTreeRenderer(instance, lod.renderers[1], id);
      this._benchmarkMaterialBindings.push(
        { renderer: trunkRenderer, baseline: trunkRenderer.getMaterial()!, hero: materials.lods[lodIndex].trunk },
        { renderer: leafRenderer, baseline: leafRenderer.getMaterial()!, hero: materials.lods[lodIndex].leaf }
      );
    });
    void controller;
  }
}

function buildDenseGrassTransforms(
  prototypes: readonly DenseGrassPrototype[],
  treeSpecs: readonly TreeSpec[],
  vegetationSpecs: readonly GpuVegetationSpec[]
): ReadonlyMap<string, Float32Array> {
  if (!prototypes.length) return new Map();
  const totalMix = prototypes.reduce((sum, prototype) => sum + prototype.mix, 0);
  if (Math.abs(totalMix - 1) > 1e-6) throw new Error("Dense grass prototype mix must sum to one");
  const values = new Map(prototypes.map((prototype) => [prototype.id, [] as number[]]));
  const spacing = Math.sqrt(1 / P3_DENSE_GRASS_TARGET_DENSITY);
  const margin = 1.25;
  const halfSize = P3_SHOWCASE_SIZE_METERS * 0.5;
  const rowLength = Math.floor((P3_SHOWCASE_SIZE_METERS - margin * 2) / spacing) + 1;
  for (let row = 0; row < rowLength; row++) {
    for (let column = 0; column < rowLength; column++) {
      const x = -halfSize + margin + column * spacing + (meadowHash(column, row, 1) - 0.5) * spacing * 0.58;
      const z = -halfSize + margin + row * spacing + (meadowHash(column, row, 2) - 0.5) * spacing * 0.58;
      if (insideTreeBaseClearing(x, z, treeSpecs)) continue;
      if (insideVegetationSpecimenClearing(x, z, vegetationSpecs)) continue;
      const prototype = selectDenseGrassPrototype(prototypes, meadowHash(column, row, 3));
      const baseScale =
        prototype.minimumScale + (prototype.maximumScale - prototype.minimumScale) * meadowHash(column, row, 4);
      const horizontalScale = baseScale * (0.9 + meadowHash(column, row, 5) * 0.18);
      values.get(prototype.id)!.push(x, 0, z, meadowHash(column, row, 6) * Math.PI * 2, horizontalScale, baseScale);
    }
  }
  return new Map([...values].map(([id, transforms]) => [id, new Float32Array(transforms)]));
}

function selectDenseGrassPrototype(prototypes: readonly DenseGrassPrototype[], sample: number): DenseGrassPrototype {
  let threshold = 0;
  for (const prototype of prototypes) {
    threshold += prototype.mix;
    if (sample < threshold) return prototype;
  }
  return prototypes.at(-1)!;
}

function insideTreeBaseClearing(x: number, z: number, treeSpecs: readonly TreeSpec[]): boolean {
  return treeSpecs.some((tree) => {
    const radius = tree.calibration?.endsWith("-large") ? 2.45 : 2.05;
    const dx = x - tree.position[0];
    const dz = z - tree.position[2];
    return dx * dx + dz * dz < radius * radius;
  });
}

function insideVegetationSpecimenClearing(
  x: number,
  z: number,
  vegetationSpecs: readonly GpuVegetationSpec[]
): boolean {
  return vegetationSpecs.some((spec) => {
    const radius = spec.prefab.includes("shrub-bush-large")
      ? 2.1
      : spec.prefab.includes("shrub-bush-medium")
        ? 1.65
        : spec.prefab.includes("shrub-bush-small")
          ? 1.3
          : spec.prefab.includes("flower-")
            ? 0.72
            : 0;
    if (radius === 0) return false;
    const dx = x - spec.position[0];
    const dz = z - spec.position[2];
    return dx * dx + dz * dz < radius * radius;
  });
}

function meadowHash(column: number, row: number, salt: number): number {
  let value = Math.imul(column + 1, 0x1f123bb5) ^ Math.imul(row + 1, 0x5f356495) ^ Math.imul(salt, 0x6c8e9cf5);
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  value = Math.imul(value, 0x297a2d39);
  value ^= value >>> 15;
  return (value >>> 0) / 0x100000000;
}

function validateDenseGrassBinding(prototypeId: string, binding: TerrainProjectResolvedRenderer): void {
  if (!binding.detailInstancing) {
    throw new Error(`Dense grass prototype ${prototypeId} does not declare exact Detail instancing`);
  }
  if (
    binding.mesh.blendShapeCount !== 0 ||
    binding.mesh.subMeshes.length !== 1 ||
    binding.mesh.subMeshes[0].count <= 0 ||
    binding.mesh.vertexElements.some((element) => RESERVED_DETAIL_ATTRIBUTES.has(element.attribute))
  ) {
    throw new Error(`Dense grass prototype ${prototypeId} must resolve exactly one instancing-safe primitive`);
  }
}

function detailBatchBounds(binding: TerrainProjectResolvedRenderer, transforms: Float32Array): BoundingBox {
  const prefabBounds = binding.mesh.bounds.clone().transform(binding.localMatrix);
  const corners = prefabBounds.getCorners();
  let sourceRadius = 0;
  for (const corner of corners) sourceRadius = Math.max(sourceRadius, corner.length());
  const bounds = new BoundingBox(
    new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
  );
  for (let offset = 0; offset < transforms.length; offset += DETAIL_TRANSFORM_FLOATS) {
    const radius = sourceRadius * Math.max(transforms[offset + 4], transforms[offset + 5]);
    bounds.min.x = Math.min(bounds.min.x, transforms[offset] - radius);
    bounds.min.y = Math.min(bounds.min.y, transforms[offset + 1] - radius);
    bounds.min.z = Math.min(bounds.min.z, transforms[offset + 2] - radius);
    bounds.max.x = Math.max(bounds.max.x, transforms[offset] + radius);
    bounds.max.y = Math.max(bounds.max.y, transforms[offset + 1] + radius);
    bounds.max.z = Math.max(bounds.max.z, transforms[offset + 2] + radius);
  }
  return bounds;
}

function disposeDenseGrassBatch(batch: DenseGrassBatch): void {
  batch.renderer.enabled = false;
  batch.renderer.mesh = null!;
  batch.renderer.setMaterials([]);
  batch.renderer.entity.destroy();
  batch.resources.mesh.destroy();
  batch.resources.instanceBuffer.destroy();
  batch.resources.indexBuffer?.destroy();
}

function validateTreeBenchmarkCount(count: number): number {
  if (!Number.isSafeInteger(count) || ![0, 1, 8, 32, 1000].includes(count)) {
    throw new RangeError("Tree benchmark count must be one of 0, 1, 8, 32, or 1000");
  }
  return count;
}

function buildTreeBenchmarkSpecs(count: number): readonly TreeSpec[] {
  const columns = count <= 1 ? 1 : count <= 8 ? 4 : count <= 32 ? 8 : 32;
  const rows = Math.ceil(count / columns);
  const spacingX = 3.35;
  const spacingZ = 3.55;
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: `broadleaf-benchmark-${index}`,
      label: `阔叶大树 · 基准 ${index + 1}`,
      prefab: "Prefab/Prototype/tree-broadleaf-large-1.prefab",
      position: [(column - (columns - 1) * 0.5) * spacingX, 0, (row - (rows - 1) * 0.5) * spacingZ + 0.7] as const,
      rotation: ((index * 47) % 120) - 60,
      scale: 0.58,
      presentation: "benchmark" as const,
      calibration: "broadleaf-large" as const
    };
  });
}

function validateHeroTreeCalibrationAsset(
  assetId: HeroTreeCalibrationAssetId,
  benchmarkCount: number
): HeroTreeCalibrationAssetId {
  requireHeroTreeCalibrationAsset(assetId);
  if (benchmarkCount > 0 && assetId !== DEFAULT_HERO_TREE_CALIBRATION_ASSET) {
    throw new Error("Tree performance benchmark keeps broadleaf-large-1 geometry fixed");
  }
  return assetId;
}

export function resolveHeroTreeCalibrationAssetId(value: string | null | undefined): HeroTreeCalibrationAssetId {
  if (!value) return DEFAULT_HERO_TREE_CALIBRATION_ASSET;
  const asset = HERO_TREE_CALIBRATION_ASSETS.find((candidate) => candidate.id === value);
  if (!asset) throw new RangeError(`Unknown Hero tree calibration asset: ${value}`);
  return asset.id;
}

export function resolveWindTreeLodMode(value: string | null | undefined): WindTreeLodMode {
  if (!value || value === "auto") return "auto";
  const numeric = Number(value);
  return validateTreeLodMode(numeric as WindTreeLodMode);
}

function requireHeroTreeCalibrationAsset(assetId: HeroTreeCalibrationAssetId) {
  const asset = HERO_TREE_CALIBRATION_ASSETS.find((candidate) => candidate.id === assetId);
  if (!asset) throw new RangeError(`Unknown Hero tree calibration asset: ${assetId}`);
  return asset;
}

function requireHeroTreeCalibrationAssetForPrefab(prefab: string) {
  const asset = HERO_TREE_CALIBRATION_ASSETS.find((candidate) => candidate.prefab === prefab);
  if (!asset) throw new Error(`Hero tree Prefab has no mechanical-data contract: ${prefab}`);
  return asset;
}

function validateTreeLodMode(mode: WindTreeLodMode): WindTreeLodMode {
  if (mode !== "auto" && mode !== 0 && mode !== 1 && mode !== 2) {
    throw new RangeError(`Unknown tree LOD calibration mode: ${mode}`);
  }
  return mode;
}

function treeLodScreenRelativeHeight(mode: WindTreeLodMode): number | null {
  if (mode === "auto") return null;
  // These projections sit safely inside the common authored bands of all eight live tree assets.
  return [0.8, 0.4, 0.1][mode];
}

function requirePrefab(prefabs: ReadonlyMap<string, PrefabResource>, path: string): PrefabResource {
  const prefab = prefabs.get(path);
  if (!prefab) throw new Error(`Wind vegetation Prefab is unavailable: ${path}`);
  return prefab;
}
