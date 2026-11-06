import { planningAlphamap } from "./PlanningAlphamap";
import { loadPlanningFarmDirtTexture } from "../spatial/farming/PlanningFarmDirtTexture";
import { planningSoilWeights } from "./PlanningSoilWeights";
import type { TerrainLayerResidencyRegionSource } from "@galacean/engine-terrain/terrain/clipmap/TerrainLayerResidency";
import { PlanningVegetationPreview } from "./PlanningVegetationPreview";
import { PlanningTerrainDepth, PLANNING_TERRAIN_LAYER } from "./PlanningTerrainDepth";
import type { Observer } from "../spatial/guidance/VisibilityQuery";
import presentation from "../planning-data/whitebox-presentation.json";
import {
  AssetType,
  Camera,
  Engine,
  Entity,
  Material,
  Texture2D,
  TextureFormat,
  TextureWrapMode,
  Vector4
} from "@galacean/engine";
import { TerrainClipmap } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmap";
import { registerTerrainProjectResources } from "@galacean/engine-terrain/terrain/loader/TerrainSceneLoader";
import { planningTerrainSource, type PlanningTerrainSource } from "./PlanningTerrainSource";
import type { IslandPlan } from "./IslandPlanModel";
import { createPlanningGrassColorField } from "../spatial/runtime/PlanningTerrainAppearance";
import { applySeedWorldTerrainAppearance, SEED_WORLD_ROAD_COLOR_DEFAULT } from "../runtime/SeedWorldTerrainRuntime.ts";
import type { SeedWorldGrassColorFieldBinding } from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";

/** Production Terrain owner; authoring and geometry remain in the immutable planning snapshot. */
export class PlanningTerrainView {
  private vegetation: PlanningVegetationPreview;
  private clipmap?: TerrainClipmap;
  private source?: PlanningTerrainSource;
  private diagnostic?: PlanningTerrainDepth;
  private readonly root: Entity;
  private readonly grid: Texture2D;
  private readonly seedMaterial: Material;
  private production = false;
  private dirtTexture?: Texture2D;
  private colorSeed?: number;
  private colorField?: SeedWorldGrassColorFieldBinding;
  private colorLease?: { field: SeedWorldGrassColorFieldBinding; owners: number };
  private retiredColorFields: { seed: number; lease: NonNullable<PlanningTerrainView["colorLease"]> }[] = [];
  private layerBindings = new WeakMap<
    PlanningTerrainSource,
    { production: boolean; layers: TerrainLayerResidencyRegionSource<Texture2D>[] }
  >();
  private disposed = false;
  private appearanceRevision = 0;
  private constructor(
    private engine: Engine,
    parent: Entity,
    private camera: Camera,
    private material: Material,
    private previous?: PlanningTerrainView
  ) {
    this.seedMaterial = material.clone();
    this.seedMaterial.shaderData.disableMacro("PLANNING_DIAGNOSTIC_TERRAIN");
    this.vegetation = new PlanningVegetationPreview(engine, material);
    this.root = parent.createChild("Planning Terrain (production Clipmap)");
    const size = presentation.gridPixelsPerCell * presentation.gridMajorEvery;
    this.grid = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, true, true);
    this.grid.wrapModeU = this.grid.wrapModeV = TextureWrapMode.Repeat;
    const pixels = new Uint8Array(size * size * 4);
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++) {
        const i = (z * size + x) * 4,
          value =
            x === 0 || z === 0
              ? 90
              : x % presentation.gridPixelsPerCell === 0 || z % presentation.gridPixelsPerCell === 0
                ? 170
                : 255;
        pixels.set([value, value, value, 255], i);
      }
    this.grid.setPixelBuffer(pixels);
    this.grid.generateMipmaps();
  }
  /** Switch appearance while preserving the exact published terrain and its coordinate domain. */
  async setProduction(enabled: boolean, seed: number): Promise<void> {
    const revision = ++this.appearanceRevision;
    const stale = () => this.disposed || revision !== this.appearanceRevision;
    if (stale()) throw new DOMException("Terrain appearance is no longer active", "AbortError");
    if (enabled && !this.dirtTexture) {
      const texture = await loadPlanningFarmDirtTexture(this.engine);
      if (stale()) throw new DOMException("Terrain appearance was superseded", "AbortError");
      this.dirtTexture = texture;
    }
    if (enabled && this.colorSeed !== seed) {
      const retained = this.retiredColorFields.findIndex((entry) => entry.seed === seed);
      let lease: NonNullable<PlanningTerrainView["colorLease"]>;
      if (retained >= 0) lease = this.retiredColorFields.splice(retained, 1)[0].lease;
      else if (
        this.previous &&
        this.previous.engine === this.engine &&
        !this.previous.disposed &&
        this.previous.production &&
        this.previous.colorSeed === seed &&
        this.previous.colorLease
      ) {
        lease = this.previous.colorLease;
        lease.owners++;
        this.layerBindings = this.previous.layerBindings;
      } else lease = { field: await createPlanningGrassColorField(this.engine, seed), owners: 1 };
      if (stale()) {
        if (--lease.owners === 0) lease.field.texture.destroy();
        throw new DOMException("Terrain appearance was superseded", "AbortError");
      }
      if (this.colorLease) this.retiredColorFields.push({ seed: this.colorSeed!, lease: this.colorLease });
      this.colorLease = lease;
      this.colorField = lease.field;
      this.colorSeed = seed;
      applySeedWorldTerrainAppearance(this.seedMaterial, lease.field);
    }
    if (this.production !== enabled) {
      this.production = enabled;
      this.source = undefined;
    }
  }
  /** Called after previous vegetation has released its shared colour binding. */
  releaseRetiredAppearance(): void {
    for (const { lease } of this.retiredColorFields) if (--lease.owners === 0) lease.field.texture.destroy();
    this.retiredColorFields.length = 0;
  }
  /** Read-only GPU height binding used by the shared Seed wind field. */
  get heightSamplingSource() {
    if (!this.clipmap) throw new Error("Planning terrain is not ready");
    return this.clipmap.heightSamplingSource;
  }
  /** Shared appearance consumed by Seed's procedural vegetation. */
  get grassColorField(): SeedWorldGrassColorFieldBinding | undefined {
    return this.colorField;
  }
  /** Near Terrain material after Clipmap has bound the current alphamap atlas and world domain. */
  get productionMaterial(): Material {
    const material = this.clipmap?.renderMaterials[0];
    if (!material) throw new Error("Planning terrain surface binding is not ready");
    return material;
  }
  /** Load the existing production Terrain shader/material without loading a second scene.
   * @returns Renderer owner ready to accept immutable plans.
   */
  static async create(
    engine: Engine,
    parent: Entity,
    camera: Camera,
    previous?: PlanningTerrainView
  ): Promise<PlanningTerrainView> {
    await registerTerrainProjectResources(
      engine,
      new URL("../../../terrain/src/data/seed-world/project.json", import.meta.url)
    );
    const shared = await engine.resourceManager.load<Material>({
      type: AssetType.Material,
      url: "Material/Terrain/seed-world.mat"
    });
    const material = shared.clone();
    material.shaderData.enableMacro("PLANNING_DIAGNOSTIC_TERRAIN");
    material.shaderData.setVector4("material_DirectorIdentity", new Vector4(1 / 255, 0, 1 / 255, 0));
    // Use generic authored layer colours instead of Seed's optional procedural grass appearance.
    material.shaderData.disableMacro("MATERIAL_TERRAIN_GRASS_SHADING");
    return new PlanningTerrainView(engine, parent, camera, material, previous);
  }
  /** Publish height/layer residency without changing camera or semantic object identity. */
  setPlan(plan: IslandPlan, visibility: Readonly<Record<string, boolean>> = {}): void {
    if (!this.production) this.vegetation.setPlan(plan, visibility);
    const source = planningTerrainSource(plan, visibility);
    if (this.source === source) return;
    const descriptor = {
      vertexSpacing: source.spacing,
      minHeight: source.minimum,
      maxHeight: source.maximum,
      sources: [source.height]
    };
    const savedLayers = this.layerBindings.get(source);
    let layers = savedLayers?.production === this.production ? savedLayers.layers : undefined;
    if (!layers) {
      layers = [
        {
          ...source.layers,
          layers: source.layers.layers.map((layer) =>
            this.production
              ? {
                  ...layer,
                  tileSize: [2, 2] as const,
                  diffuseRemapMin: (layer.appearance === "grass"
                    ? [1, 1, 1, 1]
                    : [...SEED_WORLD_ROAD_COLOR_DEFAULT, 1]) as [number, number, number, number],
                  diffuseRemapMax: (layer.appearance === "grass"
                    ? [1, 1, 1, 1]
                    : [...SEED_WORLD_ROAD_COLOR_DEFAULT, 1]) as [number, number, number, number]
                }
              : { ...layer, diffuse: this.grid }
          )
        }
      ];
      if (this.production) {
        const weights = planningSoilWeights(plan, layers[0].alphamaps[0].weights, planningAlphamap(plan));
        const dirt = {
          ...layers[0].layers[1],
          id: "bank-soil",
          appearance: undefined,
          diffuse: this.dirtTexture,
          tileSize: [4, 4] as const,
          diffuseRemapMin: [0, 0, 0, 0] as const,
          diffuseRemapMax: [1, 1, 1, 1] as const
        };
        layers = [
          {
            ...layers[0],
            layers: [...layers[0].layers, dirt],
            alphamaps: [{ ...layers[0].alphamaps[0], layers: ["grass", "soil", "bank-soil", null], weights }]
          }
        ];
      }
      this.layerBindings.set(source, { production: this.production, layers });
    }
    const material = this.production ? this.seedMaterial : this.material;
    if (this.clipmap && this.source?.spacing === source.spacing) {
      this.clipmap.updateResidency(descriptor, material, layers);
    } else {
      const next = new TerrainClipmap(this.engine, this.root, this.camera, descriptor, material, 64, 6, layers);
      this.clipmap?.destroy();
      this.clipmap = next;
    }
    const mark = (entity: Entity) => {
      entity.layer = PLANNING_TERRAIN_LAYER;
      for (const child of entity.children) mark(child);
    };
    mark(this.root);
    this.clipmap.setShadowsEnabled(true);
    this.source = source;
    this.previous = undefined;
  }
  /** Capture actual submitted Terrain geometry with the production height/morph vertex path. */
  captureDepth(observer: Observer, width: number, height: number): Uint8Array {
    if (!this.clipmap) throw new Error("Terrain 尚未就绪");
    this.diagnostic ??= new PlanningTerrainDepth(this.engine, this.root.parent!);
    this.clipmap.snap(this.camera.entity.transform.worldPosition);
    const visible = this.root.isActive;
    try {
      this.root.isActive = true;
      return this.diagnostic.capture(observer, width, height);
    } finally {
      this.root.isActive = visible;
    }
  }
  /** Keep the whole terrain visibility independent of the OBB scene. */
  setVisible(visible: boolean): void {
    this.root.isActive = visible;
  }
  /** Release only resources owned by this adapter. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.previous = undefined;
    this.vegetation.dispose();
    this.diagnostic?.dispose();
    this.clipmap?.destroy();
    this.root.destroy();
    this.grid.destroy();
    if (this.colorLease && --this.colorLease.owners === 0) this.colorLease.field.texture.destroy();
    this.releaseRetiredAppearance();
    this.seedMaterial.destroy();
    this.material.destroy();
  }
}
