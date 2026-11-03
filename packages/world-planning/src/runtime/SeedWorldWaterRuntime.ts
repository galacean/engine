import { SeedWorldWaterColorRuntime } from "@galacean/engine-water/world/SeedWorldWaterColorRuntime";
import { Layer, type Camera, type Engine, type Entity, type Scene } from "@galacean/engine-core";
import {
  createWaterBodyAsset,
  createWaterBodyInstance,
  RiverQualityLevel,
  createRiverWaterBodyAsset,
  createRiverWaterBodyInstance,
  createWaterReflectionPresentationPolicy,
  type WaterReflectionPresentationMode
} from "@galacean/engine-water/water/index";
import {
  registerRiverWaterBodyPresets,
  RIVER_CANONICAL_LOOK_PRESET_ID,
  riverQualityPlanIdForQuality
} from "@galacean/engine-water/water/presets/river/index";

import type { WaterBodyKind } from "@galacean/engine-water/water/index";

import {
  LAKE_WATER_LOOK_PRESET_ID,
  registerLakeWaterLook,
  LAKE_WATER_OPTICAL_PROFILE
} from "@galacean/engine-water/water/presets/lake/index";
import { hashStableValue } from "@galacean/engine-water/water/compiler/index";

import {
  applyLakeWaterPresentation,
  createLakeWaterPresentationState,
  HeightfieldWaterBackend,
  type HeightfieldWaterBackendRuntimeContext,
  HeightfieldWaterCompileWorkerClient
} from "@galacean/engine-water/water/runtime/heightfield/index";
import type {
  WaterDevelopmentTargetSource,
  WaterTerrainOcclusionProvider,
  LakeWaterLevelRuntimeReadback,
  OceanWaterLevelRuntimeReadback,
  WaterReflectionSource,
  WaterEnvironmentReflectionSource,
  PreparedWaterGenerationResourcesV1,
  WaterSceneRuntimeDiagnostics
} from "@galacean/engine-water/water/runtime/index";

import HeightfieldWaterCompileWorker from "@galacean/engine-water/water/compiler/heightfield/HeightfieldWaterCompileWorker.ts?worker&inline";
import {
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode
} from "@galacean/engine-water/water/runtime/heightfield/config";
import type { HeightfieldWaterSurfaceAppearanceFeatureFlags } from "@galacean/engine-water/water/runtime/heightfield/config";

import { RiverWaterBackend } from "@galacean/engine-water/water/runtime/river/index";
import {
  DEFAULT_WATER_REFLECTION_INTENSITY,
  DEFAULT_WATER_REFRACTION_STRENGTH,
  DEFAULT_WATER_ROUGHNESS,
  WaterSceneRuntimeHost,
  type PublishedWaterSceneBodySet
} from "@galacean/engine-water/water/runtime/index";
import {
  OCEAN_WATER_BACKEND_ID,
  OceanWaterBackend,
  type OceanWaterBackendRuntimeContext,
  OceanDebugView
} from "@galacean/engine-water/water/runtime/ocean/index";
import type {
  OceanWaterRuntimeController,
  OceanWaterRuntimeMetrics
} from "@galacean/engine-water/water/runtime/ocean/index";

import { OceanTextureLibrary } from "@galacean/engine-water/water/resources/ocean/index";

import { createLakeNormalResourceFactory } from "@galacean/engine-water/water/resources/lake/index";
import { TERRAIN_WATER_SSR_CAMERA_SETTINGS } from "../integrations/grasslands/GrasslandsWaterPcg.ts";
import {
  SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1,
  SeedWorldWaterRuntimeBridgeV1,
  type PrepareSeedWorldWaterRuntimeGenerationInputV1
} from "./hydrology-v1/SeedWorldWaterRuntimeBridgeV1.ts";
import { registerSeedWorldAuthoredBasinAuthoringV1 } from "./hydrology-v1/SeedWorldWaterAuthoringPresetsV1.ts";
import { createSeedWorldAuthoredRiverWaterV1 } from "./SeedWorldAuthoredRiverWater.ts";
import { createSeedWorldAuthoredBasinWaterV1, isSeedWorldWaterBasinPatchV1 } from "./SeedWorldAuthoredBasinWater.ts";
import { SeedWorldLakeWaterLevelRuntimeState } from "@galacean/engine-water/world/SeedWorldLakeWaterLevelRuntime";
import {
  SeedWorldAuthoredWaterQueryRegistryV1,
  type SeedWorldAuthoredWaterQueryResultV1
} from "@galacean/engine-water/world/SeedWorldAuthoredWaterQuery";
import type { SeedWorldRiverV1, SeedWorldTerrainPatchV1 } from "../world/SeedWorldWorldEdit.ts";
import {
  resolveSeedWorldOceanPresentationTopology,
  type SeedWorldOceanPresentationMode
} from "@galacean/engine-water/world/SeedWorldOceanPresentation";
import { registerSeedWorldWaterStartupShaders } from "@galacean/engine-water/world/SeedWorldWaterStartupShaders";

export { registerSeedWorldWaterStartupShaders } from "@galacean/engine-water/world/SeedWorldWaterStartupShaders";

const ENVIRONMENT_PROVIDER_ID = "seed-world-water-environment";
const SEED_WORLD_WATER_VISIBILITY_GROUPS = Object.freeze(["lake", "ocean"] as const);

export type SeedWorldWaterVisibilityGroup = (typeof SEED_WORLD_WATER_VISIBILITY_GROUPS)[number];

// Temporary presentation override: keep Scene fog active everywhere except the Seed World Ocean.
const SEED_WORLD_OCEAN_SCENE_FOG_ENABLED = false;

export interface SeedWorldWaterRuntimeConfig {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly root: Entity;
  readonly camera: Camera;
  readonly environmentReflection: WaterEnvironmentReflectionSource;
}

/** Seed World visibility source with an optional monotonic invalidation signal. */
export interface SeedWorldWaterTerrainOcclusionProvider extends WaterTerrainOcclusionProvider {
  readonly revision?: number;
}

export interface PreparedSeedWorldAuthoritativeWaterSceneV1 {
  readonly generationId: number;
  readonly active: boolean;
  readonly bodyIds: ReadonlySet<string>;
  commit(): PublishedWaterSceneBodySet;
  rollback(): Promise<void>;
}

export interface PreparedSeedWorldAuthoritativeWaterCandidateV1 {
  readonly generationId: number;
  readonly bodyIds: ReadonlySet<string>;
  readonly stagedBodyCount: number;
  readonly reusedSceneBodyCount: number;
  readonly preparedResources: PreparedWaterGenerationResourcesV1;
  readonly preparedScene: PreparedSeedWorldAuthoritativeWaterSceneV1;
  /** Wall-clock resource and Scene preparation phases. */
  readonly timingsMilliseconds: Readonly<{
    readonly resources: number;
    readonly scene: number;
    readonly total: number;
  }>;
}

export interface SeedWorldWaterRuntimeDiagnostics {
  readonly ready: boolean;
  readonly visible: boolean;
  readonly reflectionMode: WaterReflectionPresentationMode;
  readonly effectiveReflectionSource: WaterReflectionSource;
  readonly reflectionFallbackReason?: string;
  readonly bodyCount: number;
  readonly chunkCount: number;
  readonly triangleCount: number;
  readonly queryRegisteredBodyCount: number;
  readonly terrainOcclusion: Readonly<{
    /** Lake and River surface chunks eligible for the shared Terrain Horizon. */
    readonly eligibleChunkCount: number;
    /** Eligible chunks currently omitted by terrain occlusion. */
    readonly occludedChunkCount: number;
    /** Heightfield surface regions used for fine Camera and Terrain Horizon visibility. */
    readonly eligibleSurfaceBoundsCount: number;
    /** Heightfield surface regions currently omitted from Camera demand by terrain occlusion. */
    readonly occludedSurfaceBoundsCount: number;
  }>;
  readonly ocean: SeedWorldOceanDiagnostics | null;
  readonly oceanWaterLevel: Readonly<OceanWaterLevelRuntimeReadback> | null;
  readonly lakeWaterLevels: readonly Readonly<LakeWaterLevelRuntimeReadback>[];
  readonly heightfieldPresentations: readonly SeedWorldHeightfieldPresentationDiagnostics[];
  readonly interaction: Readonly<{
    readonly mode: "render-only";
    readonly query: false;
    readonly buoyancy: false;
    readonly wake: false;
    readonly rainImpact: false;
  }>;
  readonly wind: Readonly<{
    readonly source: "none";
    readonly oceanMacroWaveCoupling: false;
    readonly additionalPassCount: 0;
    readonly additionalTextureSampleCount: 0;
  }>;
  readonly hostRevision: number;
  readonly host: WaterSceneRuntimeDiagnostics;
}

export interface SeedWorldOceanDiagnostics {
  /** Stable page-lifetime Water instance slot. */
  readonly bodyId: string;
  /** Hydrology catalog/Asset identity of the currently published generation. */
  readonly authoritativeBodyId: string;
  readonly waterLevel: number;
  readonly surfaceTopology: "finite";
  readonly lookPresetId?: string;
  readonly appearanceAssetId?: string;
  readonly qualityPlanId?: string;
  readonly opticalProfile: Readonly<{
    roughness: number;
    reflectionIntensity: number;
    refractionStrength: number;
  }>;
  readonly metrics: Readonly<OceanWaterRuntimeMetrics>;
}

export interface SeedWorldHeightfieldPresentationDiagnostics {
  readonly bodyId: string;
  readonly effectiveReflectionSource: WaterReflectionSource;
  readonly compositionMode: HeightfieldWaterCompositionMode;
  readonly depthWriteEnabled: boolean;
  readonly debugMode: HeightfieldWaterDebugMode;
  readonly surfaceTimeOverride: number | undefined;
  readonly screenSpaceReflectionCompositeIntensity: number;
  readonly appearanceFeatures: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags>;
  readonly reflectionSampling: Readonly<{
    environmentFallbackIntensity: number;
    distortionStrength: number;
    maximumDistortionPixels: number;
    edgeFadeTexels: number;
    minimumClipW: number;
    roughnessFootprintTexels: number;
    highFilterSampleCount: number;
  }>;
  readonly appearance: Readonly<{
    active: boolean;
    fallbackReason: string | undefined;
    appearanceAssetId: string | undefined;
    appearanceHash: string | undefined;
    normalAssetId: string | undefined;
    normalContentHash: string | undefined;
    normalLayerCount: number;
    detailLayerIds: readonly string[];
    detailLayerVelocities: readonly (readonly [number, number])[];
    detailLayerRotationsDegrees: readonly number[];
    boundaryEffectIds: readonly string[];
    primaryColorClosure: string | undefined;
    depthResponseField: string | undefined;
    composition: string | undefined;
  }> | null;
  readonly optics: Readonly<{
    roughness: number;
    reflectionIntensity: number;
    environmentFallbackIntensity: number;
  }> | null;
}

/** Page-lifetime Water host shared by every generated Seed World revision. */
export class SeedWorldWaterRuntime {
  private readonly _colorAuthoring: SeedWorldWaterColorRuntime;
  readonly visibilityGroups = SEED_WORLD_WATER_VISIBILITY_GROUPS;
  readonly supportedReflectionModes = Object.freeze(["environment", "ssr"] as const);

  private readonly _engine: Engine;
  private readonly _oceanCamera: Camera;
  private readonly _host: WaterSceneRuntimeHost;
  private readonly _heightfieldBackend: HeightfieldWaterBackend;
  private readonly _oceanBackend = new OceanWaterBackend();
  private readonly _riverBackend = new RiverWaterBackend();
  private readonly _compileWorker = new HeightfieldWaterCompileWorkerClient(() => new HeightfieldWaterCompileWorker());
  private readonly _authoritativeBridge: SeedWorldWaterRuntimeBridgeV1;
  private readonly _authoredWaterQueries = new SeedWorldAuthoredWaterQueryRegistryV1();
  private readonly _authoredLakeWaterLevelStates = new Map<string, SeedWorldLakeWaterLevelRuntimeState>();
  private readonly _visibilityByBodyKind: Record<WaterBodyKind, boolean> = {
    river: true,
    lake: true,
    pool: true,
    ocean: true
  };
  private _oceanTextureLibrary?: OceanTextureLibrary;
  private _oceanTextureLibraryPromise?: Promise<OceanTextureLibrary>;
  private _oceanActive = false;
  private _terrainOcclusionProvider?: SeedWorldWaterTerrainOcclusionProvider;
  private _terrainOcclusionRevision = -1;
  private _terrainOcclusionRefreshFrames = 0;
  private _surfaceTimeOverride?: number;
  private _oceanPresentationMode: SeedWorldOceanPresentationMode = "roam";
  private _latestRevision = 0;
  private _destroyPromise?: Promise<void>;

  constructor(config: SeedWorldWaterRuntimeConfig) {
    this._engine = config.engine;
    this._oceanCamera = config.camera;
    this._host = new WaterSceneRuntimeHost({
      engine: config.engine,
      scene: config.scene,
      camera: config.camera,
      root: config.root,
      waterLayer: Layer.Layer30,
      cacheEntryLimit: 24,
      cacheBudgetBytes: 256 * 1024 * 1024,
      maximumConcurrentBodyPreparations: 1,
      yieldBetweenBodyPreparationBatches: true,
      reflection: {
        cullingMask: config.camera.cullingMask,
        waterLayerMask: Layer.Layer30,
        screenSpaceReflection: TERRAIN_WATER_SSR_CAMERA_SETTINGS
      }
    });
    this._heightfieldBackend = new HeightfieldWaterBackend({
      compile: (source, context) =>
        this._compileWorker.compile(
          source,
          context.signal,
          context.resolvedInstance?.qualityPlan.query ?? "dense",
          Object.freeze({
            sourceId: context.asset.id,
            sourceHash: context.asset.sourceHash,
            generationId: context.generationId
          })
        )
    });
    this._host.registerBackend(this._heightfieldBackend);
    this._host.registerBackend(this._oceanBackend);
    this._host.registerBackend(this._riverBackend);
    this._host.registerAuthoring(registerRiverWaterBodyPresets);
    this._colorAuthoring = new SeedWorldWaterColorRuntime(this._host);
    this._host.registerAuthoring(registerLakeWaterLook);
    this._host.registerRuntimeResource(createLakeNormalResourceFactory(config.engine));
    this._authoritativeBridge = new SeedWorldWaterRuntimeBridgeV1(this._host, {
      resolveLookId: (bodyId, lookId) => this._colorAuthoring.resolveLookId(bodyId, lookId),
      getVisible: (bodyKind) => this._visibilityByBodyKind[bodyKind],
      createHeightfieldRuntimeContext: (_bodyId, bodyRoot, surfaceLevelOffsetMetres) =>
        this._createHeightfieldRuntimeContext(bodyRoot, surfaceLevelOffsetMetres),
      createOceanRuntimeContext: (_bodyId, bodyRoot, surfaceLevelOffsetMetres) =>
        this._createOceanRuntimeContext(bodyRoot, surfaceLevelOffsetMetres),
      resolveOceanRepresentationState: (descriptor) =>
        resolveSeedWorldOceanPresentationTopology(descriptor, this._oceanPresentationMode),
      setSurfaceTimeOverride: (bodyId, timeSeconds) => {
        this._heightfieldBackend.setRuntimeSurfaceTimeOverride(bodyId, timeSeconds);
        this._oceanBackend.setRuntimeSurfaceTimeOverride(bodyId, timeSeconds);
      },
      setLakeSurfaceLevelOffset: (bodyId, offsetMetres) =>
        this._heightfieldBackend.setRuntimeSurfaceLevelOffset(bodyId, offsetMetres),
      setOceanSurfaceLevelOffset: (bodyId, offsetMetres) =>
        this._oceanBackend.setRuntimeSurfaceLevelOffset(bodyId, offsetMetres)
    });
    this._host.createEnvironmentReflectionProvider({
      id: ENVIRONMENT_PROVIDER_ID,
      source: config.environmentReflection
    });
  }

  /** Registers the exact Water shaders used by the production Look without creating a Water body. */
  registerStartupShaderVariants(): readonly string[] {
    return registerSeedWorldWaterStartupShaders();
  }

  get colorAuthoring(): SeedWorldWaterColorRuntime {
    return this._colorAuthoring;
  }

  get loader(): WaterDevelopmentTargetSource {
    return this._host.loader;
  }

  get visible(): boolean {
    return (
      this._visibilityByBodyKind.river &&
      this._visibilityByBodyKind.lake &&
      this._visibilityByBodyKind.pool &&
      this._visibilityByBodyKind.ocean
    );
  }

  get reflectionMode(): WaterReflectionPresentationMode {
    const preferred =
      this._host.assets.getLookAuthoringSnapshot(LAKE_WATER_LOOK_PRESET_ID)?.reflectionPolicy.policy.preferred;
    return preferred === "environment" || preferred === "ssr" ? preferred : "environment";
  }

  /** Prepares Water resource leases and invisible Scene state for the generation Publisher. */
  async prepareAuthoritativeCandidate(
    input: Readonly<PrepareSeedWorldWaterRuntimeGenerationInputV1>
  ): Promise<PreparedSeedWorldAuthoritativeWaterCandidateV1> {
    this._reserveAuthoritativeRevision(input.generationId);
    await this._ensureOceanTextureLibrary();
    const parts = await this._authoritativeBridge.prepareCandidateParts(input);
    let active = true;
    const preparedScene: PreparedSeedWorldAuthoritativeWaterSceneV1 = Object.freeze({
      generationId: input.generationId,
      get active() {
        return active && parts.preparedScene.active;
      },
      bodyIds: parts.bodyIds,
      commit: () => {
        if (!active) throw new Error(`Prepared Seed World Water Scene ${input.generationId} is inactive.`);
        const published = parts.preparedScene.commit();
        active = false;
        this._activateAuthoritativeBodySet(parts.bodyIds);
        return published;
      },
      rollback: async () => {
        if (!active) return;
        active = false;
        await parts.preparedScene.rollback();
      }
    });
    return Object.freeze({
      generationId: input.generationId,
      bodyIds: parts.bodyIds,
      stagedBodyCount: parts.stagedBodyCount,
      reusedSceneBodyCount: parts.reusedSceneBodyCount,
      preparedResources: parts.preparedResources,
      preparedScene,
      timingsMilliseconds: parts.timingsMilliseconds
    });
  }

  /** Loads immutable Ocean textures while the Loading Scene is still in its static startup gate. */
  async preloadStartupResources(): Promise<void> {
    await this._ensureOceanTextureLibrary();
  }

  setVisible(visible: boolean): void {
    this._host.setVisible(visible);
    for (const bodyKind of ["river", "lake", "pool", "ocean"] as const) {
      this._visibilityByBodyKind[bodyKind] = visible;
    }
  }

  isVisibilityGroupVisible(group: SeedWorldWaterVisibilityGroup): boolean {
    return this._visibilityByBodyKind[group];
  }

  setVisibilityGroupVisible(group: SeedWorldWaterVisibilityGroup, visible: boolean): void {
    if (group !== "lake" && group !== "ocean") {
      throw new RangeError(`Unsupported Seed World Water visibility group '${String(group)}'.`);
    }
    this._host.setVisible(visible, group);
    this._visibilityByBodyKind[group] = visible;
  }

  async setReflectionMode(mode: WaterReflectionPresentationMode): Promise<void> {
    if (mode !== "environment" && mode !== "ssr") {
      throw new RangeError(`Unsupported Water reflection mode: ${mode}`);
    }
    await this._host.updateLookAuthoring(LAKE_WATER_LOOK_PRESET_ID, (current) =>
      Object.freeze({
        ...current,
        reflectionPolicy: Object.freeze({
          ...current.reflectionPolicy,
          policy: createWaterReflectionPresentationPolicy(mode)
        })
      })
    );
  }

  setViewportSize(width: number, height: number): void {
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError("Seed World Water viewport must contain positive integer dimensions.");
    }
    this._host.setViewportSize(width, height);
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    if (elapsedTime !== undefined && (!Number.isFinite(elapsedTime) || elapsedTime < 0)) {
      throw new RangeError("Seed World Water surface time must be finite and non-negative.");
    }
    this._surfaceTimeOverride = elapsedTime;
    this._host.setSurfaceTimeOverride(elapsedTime);
  }

  /** Lake level control shared by natural and authored Heightfield bodies; terrain geometry remains immutable. */
  setLakeWaterLevelMetres(bodyId: string, waterLevelMetres: number): Readonly<LakeWaterLevelRuntimeReadback> {
    const authored = this._authoredLakeWaterLevelStates.get(bodyId);
    return authored
      ? authored.setWaterLevelMetres(waterLevelMetres)
      : this._authoritativeBridge.setLakeWaterLevelMetres(bodyId, waterLevelMetres);
  }

  getLakeWaterLevelReadbacks(): readonly Readonly<LakeWaterLevelRuntimeReadback>[] {
    return Object.freeze(
      [
        ...this._authoritativeBridge.getLakeWaterLevelReadbacks(),
        ...[...this._authoredLakeWaterLevelStates.values()].map((state) => state.readback)
      ].sort((left, right) => left.bodyId.localeCompare(right.bodyId))
    );
  }

  getAuthoredWaterLevelReadback(patchId: string): Readonly<LakeWaterLevelRuntimeReadback> | null {
    return this._authoredLakeWaterLevelStates.get(authoredWaterBasinBodyId(patchId))?.readback ?? null;
  }

  /** Allocation-free generated datum consumed by Seed World's navigation floor. */
  getEffectiveGeneratedWaterLevelMetres(bodyId: string, kind: "lake" | "ocean"): number | undefined {
    return this._authoritativeBridge.getEffectiveGeneratedWaterLevelMetres(bodyId, kind);
  }

  /** Runtime-only Ocean level control; the generated datum and nearshore source remain immutable. */
  setOceanWaterLevelMetres(waterLevelMetres: number): Readonly<OceanWaterLevelRuntimeReadback> {
    return this._authoritativeBridge.setOceanWaterLevelMetres(waterLevelMetres);
  }

  getOceanWaterLevelReadback(): Readonly<OceanWaterLevelRuntimeReadback> | null {
    return this._authoritativeBridge.getOceanWaterLevelReadback();
  }

  /** Development-only render-channel inspection; never changes the authored Ocean contract. */
  setOceanDebugView(view: OceanDebugView): void {
    if (!Number.isInteger(view) || view < OceanDebugView.Final || view > OceanDebugView.Coverage) {
      throw new RangeError(`Unsupported Seed World Ocean debug view: ${view}`);
    }
    const controller = this._oceanBackend.getRuntimeDiagnostics(SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1)?.controller;
    if (!controller) throw new Error("Seed World Ocean runtime is not ready.");
    controller.setDebugView(view);
  }

  /** Development-only LOD visualization; finite geometry and budgets remain unchanged. */
  setOceanLodDebug(enabled: boolean): void {
    const controller = this._oceanBackend.getRuntimeDiagnostics(SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1)?.controller;
    if (!controller) throw new Error("Seed World Ocean runtime is not ready.");
    controller.setLodDebug(enabled);
  }

  /** Publishes one persistent Authoring river without rebuilding unrelated Water bodies. */
  async upsertAuthoredRiver(
    river: Readonly<SeedWorldRiverV1>,
    sizeMetres: number,
    sampleTerrainHeight: (x: number, z: number) => number | undefined,
    signal: AbortSignal
  ): Promise<void> {
    const projected = createSeedWorldAuthoredRiverWaterV1(river, sizeMetres, sampleTerrainHeight);
    const bodyId = authoredRiverBodyId(river.riverId);
    const assetId = `${bodyId}-asset-${river.riverContentHash.slice(0, 16)}`;
    const asset = createRiverWaterBodyAsset(projected.descriptor, assetId);
    await this._host.loadBody(
      {
        bodyId,
        asset,
        instance: createRiverWaterBodyInstance({
          id: bodyId,
          assetId,
          lookPresetId: this._colorAuthoring.resolveLookId(bodyId, RIVER_CANONICAL_LOOK_PRESET_ID),
          qualityPlanId: riverQualityPlanIdForQuality(RiverQualityLevel.High),
          visible: this._visibilityByBodyKind.river,
          priority: 12
        }),
        bodyOrigin: projected.bodyOrigin,
        logicalBounds: projected.logicalBounds,
        profileId: "seed-world-authored-river-v1",
        profileVersion: 1,
        descriptorSchemaVersion: projected.descriptor.schemaVersion,
        canonicalDescriptorHash: asset.sourceHash,
        createRuntimeContext: (bodyRoot) => ({
          engine: this._engine,
          root: bodyRoot,
          logicalBodyOrigin: projected.bodyOrigin,
          submission: { frameBudgetMs: 4, releaseMeshCpuData: true },
          surfaceTimeOverride: this._surfaceTimeOverride
        }),
        setSurfaceTimeOverride: (timeSeconds) =>
          this._riverBackend.getRuntimeDiagnostics(bodyId)?.controller.setSurfaceTimeOverride(timeSeconds)
      },
      signal
    );
    this._authoredWaterQueries.upsert(bodyId, projected.queryBody);
  }

  async removeAuthoredRiver(riverId: string, signal?: AbortSignal): Promise<void> {
    const bodyId = authoredRiverBodyId(riverId);
    await this._removeAuthoredBody(bodyId, signal);
    this._authoredWaterQueries.remove(bodyId);
  }

  /** Publishes one pond/lake over its excavated basin without replacing other Water bodies. */
  async upsertAuthoredWaterBasin(
    patch: Readonly<SeedWorldTerrainPatchV1>,
    sizeMetres: number,
    sampleTerrainHeight: (x: number, z: number) => number | undefined,
    signal: AbortSignal,
    options: Readonly<{ waterLevelAuthority?: "persistent" | "terrain-derived" }> = {}
  ): Promise<void> {
    if (!isSeedWorldWaterBasinPatchV1(patch)) {
      throw new TypeError(`Terrain Patch '${patch.patchId}' is not an authored Water basin.`);
    }
    const projected = createSeedWorldAuthoredBasinWaterV1(patch, sizeMetres, sampleTerrainHeight, options);
    const authored = this._host.registerAuthoring(registerSeedWorldAuthoredBasinAuthoringV1);
    const bodyId = authoredWaterBasinBodyId(patch.patchId);
    const waterLevelState = new SeedWorldLakeWaterLevelRuntimeState({
      bodyId,
      canonicalWaterLevelMetres: projected.waterLevel.canonicalWaterLevelMetres,
      maximumDepthMetres: projected.waterLevel.maximumWaterLevelMetres - projected.waterLevel.minimumWaterLevelMetres,
      initialWaterLevelMetres: projected.waterLevel.effectiveWaterLevelMetres,
      runtimeBaseWaterLevelMetres: projected.waterLevel.effectiveWaterLevelMetres,
      applySurfaceLevelOffset: (targetBodyId, offsetMetres) =>
        this._heightfieldBackend.setRuntimeSurfaceLevelOffset(targetBodyId, offsetMetres),
      onWaterLevelChanged: (readback) =>
        this._authoredWaterQueries.updateBasinWaterLevel(
          bodyId,
          projected.createQueryBody(readback.effectiveWaterLevelMetres)
        )
    });
    const publication = projected.runtimePublication;
    if (!publication) {
      await this._removeAuthoredBody(bodyId, signal);
      this._authoredLakeWaterLevelStates.set(bodyId, waterLevelState);
      this._authoredWaterQueries.remove(bodyId);
      return;
    }
    const assetId = `${bodyId}-asset-${patch.patchContentHash.slice(0, 16)}`;
    const asset = createWaterBodyAsset({
      id: assetId,
      kind: "lake",
      representation: Object.freeze({ domain: "bounded-grid", macroSurface: "heightfield" }),
      representationData: publication.representationData,
      representationDataHash: hashStableValue(publication.representationData),
      sourceHash: hashStableValue(publication.source),
      source: publication.source
    });
    await this._host.loadBody(
      {
        bodyId,
        asset,
        instance: createWaterBodyInstance({
          id: bodyId,
          assetId,
          lookPresetId: this._colorAuthoring.resolveLookId(bodyId, authored.lookPresetId),
          qualityPlanId: authored.qualityPlanId,
          transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] },
          visible: this._visibilityByBodyKind.lake,
          priority: 14,
          interaction: { query: false, buoyancy: false, wake: false }
        }),
        logicalBounds: projected.logicalBounds,
        developmentRuntime: waterLevelState.developmentPort,
        profileId: "seed-world-authored-water-basin-v1",
        profileVersion: 1,
        descriptorSchemaVersion: publication.descriptor.schemaVersion,
        canonicalDescriptorHash: asset.sourceHash,
        createRuntimeContext: (bodyRoot) =>
          this._createHeightfieldRuntimeContext(bodyRoot, waterLevelState.surfaceLevelOffsetMetres),
        setSurfaceTimeOverride: (timeSeconds) =>
          this._heightfieldBackend.setRuntimeSurfaceTimeOverride(bodyId, timeSeconds)
      },
      signal
    );
    this._authoredLakeWaterLevelStates.set(bodyId, waterLevelState);
    this._authoredWaterQueries.upsert(bodyId, projected.queryBody);
  }

  async removeAuthoredWaterBasin(patchId: string, signal?: AbortSignal): Promise<void> {
    const bodyId = authoredWaterBasinBodyId(patchId);
    await this._removeAuthoredBody(bodyId, signal);
    this._authoredLakeWaterLevelStates.delete(bodyId);
    this._authoredWaterQueries.remove(bodyId);
  }

  /** Queries only successfully published authored Water; generated Water remains in SeedWorldFields. */
  queryAuthoredSurface(worldX: number, worldZ: number): Readonly<SeedWorldAuthoredWaterQueryResultV1> {
    return this._authoredWaterQueries.query(worldX, worldZ);
  }

  /** Audio follows the same body-kind visibility as Water rendering. */
  isAudioBodyVisible(kind: "river" | "lake" | "ocean"): boolean {
    return this._visibilityByBodyKind[kind];
  }

  get authoredWaterStructureRevision(): number {
    return this._authoredWaterQueries.structureRevision;
  }

  get authoredWaterRevision(): number {
    return this._authoredWaterQueries.revision;
  }

  getPublishedAuthoredWaterShapes() {
    return this._authoredWaterQueries.entries();
  }

  /** Allocation-free Authoring Water height consumed by Seed World's navigation floor. */
  sampleAuthoredNavigationSurfaceHeight(worldX: number, worldZ: number): number | undefined {
    return this._authoredWaterQueries.sampleSurfaceHeight(worldX, worldZ);
  }

  private async _removeAuthoredBody(bodyId: string, signal?: AbortSignal): Promise<void> {
    const diagnostics = this._host.getDiagnostics();
    if (diagnostics.bodies.some((body) => body.bodyId === bodyId)) {
      const transaction = this._host.beginBodySetTransaction(diagnostics.activeSceneRevision + 1);
      transaction.remove(bodyId);
      await transaction.commit(signal);
    }
  }

  /** Camera modes share the same finite authority and camera-relative graded Ocean presentation. */
  async setOceanPresentationMode(mode: SeedWorldOceanPresentationMode): Promise<void> {
    if (mode !== "orbit" && mode !== "roam") {
      throw new RangeError(`Unsupported Seed World Ocean presentation mode: ${mode}`);
    }
    if (mode === this._oceanPresentationMode) return;
    this._oceanPresentationMode = mode;
  }

  async setScreenSpaceReflectionCompositeIntensity(intensity: number): Promise<void> {
    if (!Number.isFinite(intensity)) throw new RangeError("Seed World Water SSR intensity must be finite.");
    const nextIntensity = Math.min(1, Math.max(0, intensity));
    await this._host.updateLookAuthoring(LAKE_WATER_LOOK_PRESET_ID, (current) =>
      Object.freeze({
        ...current,
        look: Object.freeze({
          ...current.look,
          reflectionSampling: Object.freeze({
            ...current.look.reflectionSampling,
            screenSpaceCompositeIntensity: nextIntensity
          })
        })
      })
    );
  }

  async setSharedLookReflectionIntensity(intensity?: number): Promise<void> {
    if (intensity !== undefined && (!Number.isFinite(intensity) || intensity < 0 || intensity > 4)) {
      throw new RangeError("Seed World Water Look reflection intensity must be within [0, 4].");
    }
    const nextIntensity = intensity ?? LAKE_WATER_OPTICAL_PROFILE.reflectionIntensity;
    await this._host.updateLookAuthoring(LAKE_WATER_LOOK_PRESET_ID, (current) =>
      Object.freeze({
        ...current,
        optics: Object.freeze({
          ...current.optics,
          profile: Object.freeze({ ...current.optics.profile, reflectionIntensity: nextIntensity })
        })
      })
    );
  }

  /** Connects finite Water chunks to the active generated World's shared Terrain Horizon. */
  setTerrainOcclusionProvider(provider?: SeedWorldWaterTerrainOcclusionProvider): void {
    if (provider === this._terrainOcclusionProvider) return;
    this._terrainOcclusionProvider = provider;
    this._terrainOcclusionRevision = -1;
    this._terrainOcclusionRefreshFrames = provider ? 2 : 0;
    this._host.setTerrainOcclusionProvider(provider);
  }

  getDiagnostics(): SeedWorldWaterRuntimeDiagnostics {
    const host = this._host.getDiagnostics();
    const reflection = resolveEffectiveReflectionSource(host, this.reflectionMode);
    const ocean = this._inspectOcean(host);
    const terrainOcclusion = this._inspectTerrainOcclusion(host);
    let chunkCount = 0;
    let triangleCount = 0;
    for (const body of host.bodies) {
      const metrics = ocean?.bodyId === body.bodyId ? ocean.metrics : body.activation.runtimeMetrics;
      chunkCount += metrics.drawCount;
      triangleCount += metrics.triangleCount;
    }
    return Object.freeze({
      ready: host.activeBodyCount > 0,
      visible: this.visible,
      reflectionMode: this.reflectionMode,
      effectiveReflectionSource: reflection.source,
      ...(reflection.fallbackReason ? { reflectionFallbackReason: reflection.fallbackReason } : {}),
      bodyCount: host.activeBodyCount,
      chunkCount,
      triangleCount,
      queryRegisteredBodyCount: host.world.queryRegisteredBodyCount,
      terrainOcclusion,
      ocean,
      oceanWaterLevel: this._authoritativeBridge.getOceanWaterLevelReadback(),
      lakeWaterLevels: this.getLakeWaterLevelReadbacks(),
      heightfieldPresentations: this._inspectHeightfieldPresentations(host),
      interaction: Object.freeze({
        mode: "render-only",
        query: false,
        buoyancy: false,
        wake: false,
        rainImpact: false
      }),
      wind: Object.freeze({
        source: "none",
        oceanMacroWaveCoupling: false,
        additionalPassCount: 0,
        additionalTextureSampleCount: 0
      }),
      hostRevision: host.activeSceneRevision,
      host
    });
  }

  destroy(): Promise<void> {
    if (this._destroyPromise) return this._destroyPromise;
    this._destroyPromise = (async () => {
      try {
        await this._host.destroy();
      } finally {
        const oceanTextures =
          this._oceanTextureLibrary ?? (await this._oceanTextureLibraryPromise?.catch(() => undefined));
        oceanTextures?.destroy();
        this._oceanTextureLibrary = undefined;
        this._oceanTextureLibraryPromise = undefined;
        this._compileWorker.dispose();
        this._oceanActive = false;
        this._terrainOcclusionRefreshFrames = 0;
        this._authoredWaterQueries.clear();
        this._authoredLakeWaterLevelStates.clear();
      }
    })();
    return this._destroyPromise;
  }

  private _reserveAuthoritativeRevision(generationId: number): void {
    if (this._destroyPromise) throw new Error("Seed World Water runtime is being destroyed.");
    if (!Number.isSafeInteger(generationId) || generationId <= this._latestRevision) {
      throw new RangeError("Seed World authoritative Water revision must increase monotonically.");
    }
    this._latestRevision = generationId;
  }

  private _activateAuthoritativeBodySet(bodyIds: ReadonlySet<string>): void {
    this._oceanActive = bodyIds.has(SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1);
    if (this._terrainOcclusionProvider) this._terrainOcclusionRefreshFrames = 2;
    // A full authoritative generation publishes a new Fields/Hydrology snapshot;
    // authored occupancy is now represented there instead of by local delta bodies.
    this._authoredWaterQueries.clear();
    this._authoredLakeWaterLevelStates.clear();
  }

  private _createHeightfieldRuntimeContext(
    bodyRoot: Entity,
    surfaceLevelOffsetMetres = 0
  ): Readonly<HeightfieldWaterBackendRuntimeContext> {
    return Object.freeze({
      engine: this._engine,
      root: bodyRoot,
      submission: Object.freeze({ frameBudgetMs: 4, releaseMeshCpuData: true }),
      debugMode: createLakeWaterPresentationState(this._surfaceTimeOverride).debugMode,
      surfaceTimeOverride: this._surfaceTimeOverride,
      surfaceLevelOffsetMetres
    });
  }

  private _createOceanRuntimeContext(
    bodyRoot: Entity,
    surfaceLevelOffsetMetres = 0
  ): Readonly<OceanWaterBackendRuntimeContext> {
    const textures = this._oceanTextureLibrary;
    if (!textures) throw new Error("Seed World Ocean textures are not ready.");
    return Object.freeze({
      engine: this._engine,
      root: bodyRoot,
      textures: textures.textures,
      cameraPositionProvider: () => this._oceanCamera.entity.transform.worldPosition,
      sceneFogEnabled: SEED_WORLD_OCEAN_SCENE_FOG_ENABLED,
      surfaceTimeOverride: this._surfaceTimeOverride,
      surfaceLevelOffsetMetres
    });
  }

  /** Advances shader time and camera-window accounting; Ocean has no wind, query, or interaction simulation. */
  update(deltaTime: number): void {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("Seed World Water delta time must be finite and non-negative.");
    }
    this._refreshTerrainOcclusion();
    if (this._visibilityByBodyKind.ocean && this._oceanActive) {
      this._oceanBackend.updateRuntime(SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1, deltaTime);
    }
  }

  private _refreshTerrainOcclusion(): void {
    const provider = this._terrainOcclusionProvider;
    if (!provider) return;
    const revision = provider.revision;
    if (revision === undefined) {
      this._host.refreshTerrainOcclusion();
      return;
    }
    if (revision !== this._terrainOcclusionRevision) {
      this._terrainOcclusionRevision = revision;
      this._terrainOcclusionRefreshFrames = 2;
    }
    if (this._terrainOcclusionRefreshFrames === 0) return;
    this._host.refreshTerrainOcclusion();
    this._terrainOcclusionRefreshFrames--;
  }

  private async _ensureOceanTextureLibrary(): Promise<OceanTextureLibrary> {
    if (this._oceanTextureLibrary) return this._oceanTextureLibrary;
    if (!this._oceanTextureLibraryPromise) {
      this._oceanTextureLibraryPromise = OceanTextureLibrary.create(this._engine).then((library) => {
        if (this._destroyPromise) {
          library.destroy();
          throw new Error("Seed World Water runtime was destroyed while Ocean textures were loading.");
        }
        this._oceanTextureLibrary = library;
        return library;
      });
    }
    try {
      return await this._oceanTextureLibraryPromise;
    } catch (error) {
      this._oceanTextureLibraryPromise = undefined;
      throw error;
    }
  }

  private _inspectHeightfieldPresentations(
    host: WaterSceneRuntimeDiagnostics
  ): readonly SeedWorldHeightfieldPresentationDiagnostics[] {
    return Object.freeze(
      host.bodies.flatMap(({ bodyId, activation }) => {
        const controller = this._heightfieldBackend.getRuntimeDiagnostics(bodyId)?.controller;
        if (!controller) return [];
        const appearance = controller.activeSurfaceAppearanceReadback;
        const appearanceBinding = controller.surfaceAppearanceBinding;
        const optics = controller.activeSurfaceOpticsReadback;
        const reflectionSampling = controller.reflectionSamplingSettings;
        return [
          Object.freeze({
            bodyId,
            effectiveReflectionSource: waterReflectionModeToRuntimeSource(
              activation?.effectiveSnapshot?.effectiveReflectionSource ?? "analytic"
            ),
            compositionMode: controller.compositionMode,
            depthWriteEnabled: controller.depthWriteEnabled,
            debugMode: controller.debugMode,
            surfaceTimeOverride: controller.surfaceTimeOverride,
            screenSpaceReflectionCompositeIntensity: controller.screenSpaceReflectionCompositeIntensity,
            appearanceFeatures: Object.freeze({ ...controller.surfaceAppearanceFeatureFlags }),
            reflectionSampling: Object.freeze({
              environmentFallbackIntensity: reflectionSampling.environmentFallbackIntensity,
              distortionStrength: reflectionSampling.distortionStrength,
              maximumDistortionPixels: reflectionSampling.maximumDistortionPixels,
              edgeFadeTexels: reflectionSampling.edgeFadeTexels,
              minimumClipW: reflectionSampling.minimumClipW,
              roughnessFootprintTexels: reflectionSampling.roughnessFootprintTexels,
              highFilterSampleCount: reflectionSampling.highFilterSampleCount
            }),
            appearance: appearance
              ? Object.freeze({
                  active: appearance.active,
                  fallbackReason: appearance.fallbackReason,
                  appearanceAssetId: appearance.appearanceAssetId,
                  appearanceHash: appearance.appearanceHash,
                  normalAssetId: appearance.normalAssetId,
                  normalContentHash: appearance.normalContentHash,
                  normalLayerCount: appearance.normalLayerCount,
                  detailLayerIds: Object.freeze([...(appearance.detailLayerIds ?? [])]),
                  detailLayerVelocities: Object.freeze(
                    appearanceBinding?.appearance.schemaVersion === 2
                      ? appearanceBinding.appearance.detailLayers.map(({ velocity }) =>
                          Object.freeze([velocity[0], velocity[1]] as const)
                        )
                      : []
                  ),
                  detailLayerRotationsDegrees: Object.freeze(
                    appearanceBinding?.appearance.schemaVersion === 2
                      ? appearanceBinding.appearance.detailLayers.map(({ rotationDegrees }) => rotationDegrees)
                      : []
                  ),
                  boundaryEffectIds: Object.freeze([...(appearance.boundaryEffectIds ?? [])]),
                  primaryColorClosure: appearance.primaryColorClosure,
                  depthResponseField: appearance.depthResponseField,
                  composition: appearance.compositionV2
                })
              : null,
            optics: optics
              ? Object.freeze({
                  roughness: optics.opticalProfile.roughness,
                  reflectionIntensity: optics.opticalProfile.reflectionIntensity,
                  environmentFallbackIntensity: optics.environmentFallbackIntensity
                })
              : null
          })
        ];
      })
    );
  }

  private _inspectOcean(host: WaterSceneRuntimeDiagnostics): SeedWorldOceanDiagnostics | null {
    const body = host.bodies.find(
      ({ kind, resolvedBackendId }) => kind === "ocean" && resolvedBackendId === OCEAN_WATER_BACKEND_ID
    );
    if (!body) return null;
    const controller = this._oceanBackend.getRuntimeDiagnostics(body.bodyId)?.controller;
    if (!controller) return null;
    const config = controller.config;
    const lookPresetId = body.activation.lookPresetId;
    const appearanceAssetId = lookPresetId
      ? this._host.assets.getLookPreset(lookPresetId)?.appearanceAssetId
      : undefined;
    return Object.freeze({
      bodyId: body.bodyId,
      authoritativeBodyId: body.assetId,
      waterLevel:
        this._authoritativeBridge.getOceanWaterLevelReadback()?.effectiveWaterLevelMetres ?? config.waterLevel,
      surfaceTopology: config.surfaceTopology,
      lookPresetId,
      appearanceAssetId,
      qualityPlanId: body.activation.qualityPlan?.id,
      opticalProfile: Object.freeze({
        roughness: controller.opticalProfile.roughness ?? DEFAULT_WATER_ROUGHNESS,
        reflectionIntensity: controller.opticalProfile.reflectionIntensity ?? DEFAULT_WATER_REFLECTION_INTENSITY,
        refractionStrength: controller.opticalProfile.refractionStrength ?? DEFAULT_WATER_REFRACTION_STRENGTH
      }),
      metrics: controller.metrics
    });
  }

  private _inspectTerrainOcclusion(host: WaterSceneRuntimeDiagnostics): Readonly<{
    eligibleChunkCount: number;
    occludedChunkCount: number;
    eligibleSurfaceBoundsCount: number;
    occludedSurfaceBoundsCount: number;
  }> {
    let eligibleChunkCount = 0;
    let occludedChunkCount = 0;
    let eligibleSurfaceBoundsCount = 0;
    let occludedSurfaceBoundsCount = 0;
    for (const body of host.bodies) {
      const heightfield = this._heightfieldBackend.getRuntimeDiagnostics(body.bodyId)?.controller;
      if (heightfield) {
        eligibleChunkCount += heightfield.activeChunkCount;
        occludedChunkCount += heightfield.terrainOccludedChunkCount;
        eligibleSurfaceBoundsCount += heightfield.activeVisibilityBoundsCount;
        occludedSurfaceBoundsCount += heightfield.terrainOccludedVisibilityBoundsCount;
        continue;
      }
      const river = this._riverBackend.getRuntimeDiagnostics(body.bodyId)?.controller;
      if (!river) continue;
      eligibleChunkCount += river.activeChunkCount;
      occludedChunkCount += river.terrainOccludedChunkCount;
    }
    return Object.freeze({
      eligibleChunkCount,
      occludedChunkCount,
      eligibleSurfaceBoundsCount,
      occludedSurfaceBoundsCount
    });
  }
}

function authoredRiverBodyId(riverId: string): string {
  return `seed-world-authored-river:${riverId}`;
}

function authoredWaterBasinBodyId(patchId: string): string {
  return `seed-world-authored-water-basin:${patchId}`;
}

function resolveEffectiveReflectionSource(
  diagnostics: WaterSceneRuntimeDiagnostics,
  mode: WaterReflectionPresentationMode
): Readonly<{ source: WaterReflectionSource; fallbackReason?: string }> {
  const representative = diagnostics.bodies.find(({ kind }) => kind === "lake") ?? diagnostics.bodies[0];
  const effectiveMode = representative?.activation.effectiveSnapshot?.effectiveReflectionSource;
  if (!effectiveMode) {
    return { source: "sky", fallbackReason: "Seed World Water has no active EffectiveSnapshot." };
  }
  const source = waterReflectionModeToRuntimeSource(effectiveMode);
  return effectiveMode === mode
    ? { source }
    : {
        source,
        fallbackReason: `Requested '${mode}' resolved to '${effectiveMode}' in '${representative.bodyId}'.`
      };
}

function waterReflectionModeToRuntimeSource(mode: "analytic" | "environment" | "ssr"): WaterReflectionSource {
  return mode === "analytic" ? "sky" : mode === "environment" ? "probe" : mode;
}
