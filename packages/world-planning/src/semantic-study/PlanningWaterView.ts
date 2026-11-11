import { Camera, Layer, type Engine, type Entity } from "@galacean/engine";
import {
  createWaterBodyAsset,
  createWaterBodyInstance,
  WaterBodySourceKind,
  WaterBodySourceSchemaVersion,
  createRiverWaterBodyAsset,
  createRiverWaterBodyInstance,
  RiverQualityLevel,
  computeRiverPhysicalSourceHash
} from "@galacean/engine-water/water/index";
import { registerOceanAuthoring } from "@galacean/engine-water/water/presets/ocean/index";
import {
  registerRiverWaterBodyPresets,
  RIVER_CANONICAL_LOOK_PRESET_ID,
  riverQualityPlanIdForQuality
} from "@galacean/engine-water/water/presets/river/index";

import { OceanTextureLibrary } from "@galacean/engine-water/water/resources/ocean/index";
import { OceanWaterBackend } from "@galacean/engine-water/water/runtime/ocean/index";
import { RiverWaterBackend, RiverCompileWorkerClient } from "@galacean/engine-water/water/runtime/river/index";

import { WaterSceneRuntimeHost, type WaterSceneBodyRequest } from "@galacean/engine-water/water/runtime/index";
import { preparedPlanningOcean } from "./PlanningOceanSource";
import { planningRiverDescriptors } from "./PlanningRiverSource";
import settings from "../planning-data/water-rendering.json";
import type { IslandPlan } from "./IslandPlanModel";

interface PreparedWater {
  commit(): void;
  rollback(): Promise<void>;
}
/** One production Water host owns shared camera textures, reflection and transactional body publication. */
export class PlanningWaterView {
  private host: WaterSceneRuntimeHost;
  private ocean = new OceanWaterBackend();
  private compiler = new RiverCompileWorkerClient();
  private river: RiverWaterBackend;
  private current = new Map<string, string>();
  private revision = 0;
  private abort?: AbortController;
  private gate: Promise<void> = Promise.resolve();
  private layers: Readonly<Record<string, boolean>> = {};
  private preparing = false;
  private destroyed = false;
  private constructor(
    private engine: Engine,
    root: Entity,
    private camera: Camera,
    private textures: OceanTextureLibrary
  ) {
    const scene = engine.sceneManager.activeScene!;
    this.host = new WaterSceneRuntimeHost({
      engine,
      root,
      camera,
      scene,
      waterLayer: Layer.Layer29,
      reflection: { cullingMask: camera.cullingMask, waterLayerMask: Layer.Layer29 },
      maximumConcurrentBodyPreparations: 2,
      cacheEntryLimit: 4
    });
    this.river = new RiverWaterBackend({
      compile: (source, context) =>
        this.compiler.compile(source, context.signal, computeRiverPhysicalSourceHash(source))
    });
    this.host.registerBackend(this.ocean);
    this.host.registerBackend(this.river);
    this.host.registerAuthoring(registerRiverWaterBodyPresets);
    this.host.createEnvironmentReflectionProvider({
      id: "planning-water-ibl",
      source: { ambientLight: scene.ambientLight, rotationDegrees: 0, exposure: 1, hdr: true }
    });
  }
  static async create(engine: Engine, root: Entity, camera: Camera): Promise<PlanningWaterView> {
    const textures = await OceanTextureLibrary.create(engine);
    let view: PlanningWaterView | undefined;
    try {
      view = new PlanningWaterView(engine, root, camera, textures);
      await view.host.updateLookAuthoring(RIVER_CANONICAL_LOOK_PRESET_ID, (look) => ({
        ...look,
        optics: {
          ...look.optics,
          profile: {
            ...look.optics.profile,
            ...settings.riverOptics,
            absorptionCoefficient: settings.riverOptics.absorptionCoefficient as [number, number, number],
            scatteringColor: settings.riverOptics.scatteringColor as [number, number, number]
          }
        }
      }));
      return view;
    } catch (error) {
      if (view) await view.dispose();
      else textures.destroy();
      throw error;
    }
  }
  private oceanRequest(plan: IslandPlan): WaterSceneBodyRequest {
    const data = preparedPlanningOcean(plan),
      oceanId = "planning-ocean";
    const descriptor = { schemaVersion: 2 as const, id: data.data.sourceId, config: data.data.config };
    const authoring = this.host.registerAuthoring((assets) => registerOceanAuthoring(assets, descriptor.config));
    const asset = createWaterBodyAsset({
      id: oceanId,
      kind: "ocean",
      representation: { domain: "world-space-ocean", macroSurface: "gerstner" },
      sourceHash: data.sourceHash,
      representationData: data,
      representationDataHash: data.compileKey,
      source: {
        schemaVersion: WaterBodySourceSchemaVersion.V1,
        kind: WaterBodySourceKind.OceanNearshore,
        capabilities: { localBathymetry: true, shoreSdf: true, current: false },
        descriptor
      }
    });
    const instance = createWaterBodyInstance({
      id: oceanId,
      assetId: asset.id,
      ...authoring,
      transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] },
      visible: this.layers.ocean !== false,
      priority: 0,
      interaction: { query: false, buoyancy: false, wake: false },
      representationState: {
        schemaVersion: 1,
        kind: "ocean-surface-layout",
        centerXZ: [plan.parameters.width / 2, plan.parameters.depth / 2],
        size: Math.max(plan.parameters.width, plan.parameters.depth) * 3,
        surfaceTopology: "finite",
        finitePatchGridSize: 1
      }
    });
    return {
      bodyId: oceanId,
      asset,
      instance,
      bodyOrigin: [0, 0],
      canonicalDescriptorHash: asset.sourceHash,
      createRuntimeContext: (root) => ({
        engine: this.engine,
        root,
        textures: this.textures.textures,
        cameraPositionProvider: () => this.camera.entity.transform.worldPosition,
        sceneFogEnabled: true
      })
    };
  }
  private requests(plan: IslandPlan): WaterSceneBodyRequest[] {
    const result = plan.parameters.landMode === "continuous" ? [] : [this.oceanRequest(plan)];
    for (const source of planningRiverDescriptors(plan)) {
      const riverAsset = createRiverWaterBodyAsset(source, source.id + ":asset");
      const riverInstance = createRiverWaterBodyInstance({
        id: source.id,
        assetId: riverAsset.id,
        lookPresetId: RIVER_CANONICAL_LOOK_PRESET_ID,
        qualityPlanId: riverQualityPlanIdForQuality(settings.riverQuality as RiverQualityLevel),
        visible: this.layers["surface-water"] !== false && this.layers["object:" + source.id] !== false
      });
      result.push({
        bodyId: source.id,
        asset: riverAsset,
        instance: riverInstance,
        bodyOrigin: [0, 0],
        canonicalDescriptorHash: riverAsset.sourceHash,
        createRuntimeContext: (root) => ({ engine: this.engine, root, submission: { frameBudgetMs: 4 } })
      });
    }
    return result;
  }
  /** Prepare hidden water resources; the caller commits in the same tick as its Terrain snapshot. */
  async prepare(plan: IslandPlan): Promise<PreparedWater> {
    this.abort?.abort();
    const abort = (this.abort = new AbortController());
    await this.gate;
    if (abort.signal.aborted || this.destroyed) throw new DOMException("过期水体编译已取消", "AbortError");
    let release!: () => void;
    this.gate = new Promise((resolve) => (release = resolve));
    this.preparing = true;
    let transaction: ReturnType<WaterSceneRuntimeHost["beginBodySetTransaction"]> | undefined;
    try {
      const requests = this.requests(plan),
        keys = new Map(
          requests.map((r) => [
            r.bodyId,
            JSON.stringify([r.asset.sourceHash, r.asset.representationDataHash, r.instance])
          ])
        );
      const changed = requests.filter((r) => this.current.get(r.bodyId) !== keys.get(r.bodyId));
      const removed = [...this.current.keys()].filter((id) => !keys.has(id));
      if (!changed.length && !removed.length) {
        this.preparing = false;
        release();
        return { commit: () => {}, rollback: async () => {} };
      }
      transaction = this.host.beginBodySetTransaction(++this.revision);
      for (const request of changed) transaction.stage(request);
      for (const id of removed) transaction.remove(id);
      const prepared = await transaction.prepare(abort.signal);
      let active = true;
      const finish = () => {
        active = false;
        this.preparing = false;
        release();
      };
      return {
        commit: () => {
          if (!active) throw new Error("水体准备结果已使用");
          const published = prepared.commit();
          this.current = keys;
          finish();
          this.setLayers(this.layers);
          void published.retiredCleanup.catch((error) => console.error("Water retired cleanup", error));
        },
        rollback: async () => {
          if (!active) return;
          try {
            await prepared.rollback();
          } finally {
            finish();
          }
        }
      };
    } catch (error) {
      try {
        await transaction?.rollback();
      } finally {
        this.preparing = false;
        release();
      }
      throw error;
    }
  }
  setLayers(layers: Readonly<Record<string, boolean>>): void {
    this.layers = { ...layers };
    if (this.preparing || this.destroyed) return;
    for (const id of this.current.keys()) {
      const visible =
        id === "planning-ocean"
          ? layers.ocean !== false
          : layers["surface-water"] !== false && layers["object:" + id] !== false;
      const handle = this.host.getBodyHandle(id);
      if (handle && handle.visible !== visible) handle.setVisible(visible);
    }
  }
  update(): void {
    if (this.destroyed) return;
    this.ocean.updateRuntime("planning-ocean", 0);
    this.host.setViewportSize(this.engine.canvas.width, this.engine.canvas.height);
  }
  get diagnostics() {
    return this.host.getDiagnostics();
  }
  async dispose(): Promise<void> {
    this.destroyed = true;
    this.abort?.abort();
    this.compiler.dispose();
    await this.gate;
    await this.host.destroy();
    this.textures.destroy();
  }
}
