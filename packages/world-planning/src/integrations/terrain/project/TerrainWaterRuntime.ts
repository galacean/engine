import { AssetPromise, Camera, Layer, Script } from "@galacean/engine";
import type { TerrainProjectAsset } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import { terrainRasterIndex } from "@galacean/engine-terrain/terrain/project/TerrainProjectCodec";
import {
  TerrainProjectWorldRuntime,
  type TerrainProjectRegionLease
} from "@galacean/engine-terrain/terrain/project/TerrainProjectRuntime";
import type {
  WaterBathymetrySourceKind,
  WaterReflectionPresentationMode,
  WaterShoreSdfSourceKind,
  WaterSpatialFieldSourceSchemaVersion
} from "@galacean/engine-water/water/index";
import type { GrasslandsTerrainWaterLayoutSpec } from "../../grasslands/GrasslandsWaterDescriptor.ts";
import type { GrasslandsTerrainWaterPcg } from "../../grasslands/GrasslandsWaterPcg.ts";

import type {
  WaterDevelopmentTargetSource,
  WaterSceneRuntimeHost,
  WaterSurfaceSample
} from "@galacean/engine-water/water/runtime/index";

import type { TerrainClipmap } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmap";
import type { RiverTerrainInteractionData } from "@galacean/engine-water/water/compiler/index";
import type { GrasslandsLakeRiverInspection } from "../../grasslands/GrasslandsLakeRiverScenario.ts";
import type { GrasslandsRiverTerrainCouplingDiagnostics } from "../../grasslands/GrasslandsRiverTerrainCoupling.ts";
import type { TerrainWaterRainImpactSurfaceProvider } from "../environment/TerrainWaterRainImpactPolicy.ts";

import {
  LAKE_SCENE_REFLECTION_POLICY,
  LAKE_WATER_LOOK_PRESET_ID,
  LAKE_WATER_OPTICAL_PROFILE
} from "@galacean/engine-water/water/presets/lake/index";

export type TerrainWaterReflectionMode = WaterReflectionPresentationMode;
export type TerrainWaterScenario = "lake" | "lake-river";

const GRASSLANDS_DEFAULT_REFLECTION_MODE: TerrainWaterReflectionMode =
  LAKE_SCENE_REFLECTION_POLICY.preferred === "analytic" ? "environment" : LAKE_SCENE_REFLECTION_POLICY.preferred;

const TERRAIN_REALTIME_IBL_ROTATION_DEGREES = 0;
const TERRAIN_REALTIME_IBL_EXPOSURE = 1;
const INACTIVE_RAIN_IMPACT_BOUNDS = Object.freeze({
  minimum: Object.freeze([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as const),
  maximum: Object.freeze([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as const)
});

/** Scene-authored region extraction values for the existing terrain water renderer. */
export interface TerrainWaterRuntimeConfig {
  /** Progressive terrain resource owner. */
  worldRuntime: TerrainProjectWorldRuntime;
  /** Scene camera used by water reflection and refraction. */
  camera: Camera;
  /** Region ids sampled once to compile the detached water body. */
  initialActiveRegionIds: string[];
  /** Water-plane world position. */
  position: readonly [x: number, y: number, z: number];
  /** Water-plane width and depth. */
  sizeXZ: readonly [width: number, depth: number];
  /** Detached water-mask raster size. */
  resolution: readonly [width: number, height: number];
  /** Height tolerance below the water plane considered wet. */
  wetThreshold: number;
}

/** Standard Scene wrapper that feeds canonical Region heights to the existing water runtime. */
export class TerrainWaterRuntime extends Script {
  private _config: TerrainWaterRuntimeConfig | null = null;
  private _lease: TerrainProjectRegionLease | null = null;
  private _water: GrasslandsTerrainWaterPcg | null = null;
  private _host: WaterSceneRuntimeHost | null = null;
  private _scenario: TerrainWaterScenario = "lake";
  private _river: GrasslandsLakeRiverInspection | null = null;
  private _riverTerrainInteraction: RiverTerrainInteractionData | null = null;
  private _riverBodyOrigin: readonly [x: number, z: number] | null = null;
  private _riverTerrain: GrasslandsRiverTerrainCouplingDiagnostics | null = null;
  private _riverTerrainCoupler:
    | typeof import("../../grasslands/GrasslandsRiverTerrainCoupling.ts").coupleGrasslandsTerrainToRiver
    | null = null;
  private _visible = true;
  private _reflectionMode: TerrainWaterReflectionMode = GRASSLANDS_DEFAULT_REFLECTION_MODE;
  private _surfaceTimeOverride?: number;
  private _resolveReady!: (water: GrasslandsTerrainWaterPcg) => void;
  private _rejectReady!: (reason: unknown) => void;
  private readonly _ready = new AssetPromise<GrasslandsTerrainWaterPcg>((resolve, reject) => {
    this._resolveReady = resolve;
    this._rejectReady = reject!;
  });
  /** Stable presentation-only query adapter consumed by the Terrain precipitation owner. */
  readonly rainImpactSurfaceProvider: TerrainWaterRainImpactSurfaceProvider = Object.freeze({
    getBounds: () => this._water?.rainImpactBounds ?? INACTIVE_RAIN_IMPACT_BOUNDS,
    sampleSurface: (
      worldPosition: Parameters<TerrainWaterRainImpactSurfaceProvider["sampleSurface"]>[0],
      outSample: WaterSurfaceSample
    ) => {
      const water = this._water;
      return this._visible && water !== null && water.rainImpactSurfaceProvider.sampleSurface(worldPosition, outSample);
    }
  });

  /**
   * Stores Scene references and finite extraction values before loading begins.
   * @param config World runtime, camera, Region residency, and water bounds.
   * @returns Nothing.
   * @throws If references or extraction values are invalid.
   */
  initialize(config: TerrainWaterRuntimeConfig): void {
    if (!(config?.worldRuntime instanceof TerrainProjectWorldRuntime) || !(config.camera instanceof Camera)) {
      throw new Error("Terrain water requires serialized world-runtime and camera references");
    }
    if (
      !Array.isArray(config.initialActiveRegionIds) ||
      new Set(config.initialActiveRegionIds).size !== config.initialActiveRegionIds.length
    ) {
      throw new Error("Terrain water active Region ids must be a unique array");
    }
    validateFiniteTuple(config.position, 3, "position");
    validateFiniteTuple(config.sizeXZ, 2, "sizeXZ");
    validateFiniteTuple(config.resolution, 2, "resolution");
    if (config.sizeXZ.some((value) => value <= 0)) throw new RangeError("Terrain water size must be positive");
    if (config.resolution.some((value) => !Number.isInteger(value) || value <= 0)) {
      throw new RangeError("Terrain water resolution must contain positive integers");
    }
    if (!Number.isFinite(config.wetThreshold) || config.wetThreshold < 0) {
      throw new RangeError("Terrain water wet threshold must be finite and non-negative");
    }
    this._config = {
      ...config,
      initialActiveRegionIds: [...config.initialActiveRegionIds],
      position: [...config.position],
      sizeXZ: [...config.sizeXZ],
      resolution: [...config.resolution]
    };
  }

  /**
   * Returns an independently cancellable observer of water startup.
   * @returns Task resolving to the active water runtime.
   */
  waitUntilReady(): AssetPromise<GrasslandsTerrainWaterPcg> {
    return this._ready.then((water) => water);
  }

  /** Selects the URL-driven acceptance composition before Scene startup. */
  setScenario(scenario: TerrainWaterScenario): void {
    if (scenario !== "lake" && scenario !== "lake-river") {
      throw new RangeError(`Unsupported Terrain water scenario: ${String(scenario)}`);
    }
    if (this._water || this._host) throw new Error("Terrain water scenario cannot change after startup begins.");
    this._scenario = scenario;
  }

  /** Applies the active River's Water-authored bed corridor through Terrain-owned height patches. */
  coupleScenarioTerrain(clipmap: TerrainClipmap): GrasslandsRiverTerrainCouplingDiagnostics | null {
    if (!this._water || !this._lease) throw new Error("Terrain Water must be ready before River terrain coupling.");
    if (!this._riverTerrainInteraction || !this._riverBodyOrigin) return null;
    if (this._riverTerrain) return this._riverTerrain;
    const coupler = this._riverTerrainCoupler;
    if (!coupler) throw new Error("Terrain Water River coupling module is not ready.");
    const coupling = coupler(this._lease.assets, this._riverTerrainInteraction, this._riverBodyOrigin);
    clipmap.updateHeightRegions(coupling.patches);
    this._riverTerrain = coupling.diagnostics;
    return this._riverTerrain;
  }

  /** Shared Scene loader exposed by the finite-Terrain compatibility facade. */
  get loader(): WaterDevelopmentTargetSource {
    const host = this._host;
    if (!host) throw new Error("Terrain Water Scene Host is not ready.");
    return host.loader;
  }

  /** @returns Whether water should be visible once startup settles. */
  get visible(): boolean {
    return this._visible;
  }

  /** @returns The requested mode, including requests stored before Water is ready. */
  get reflectionMode(): TerrainWaterReflectionMode {
    return this._reflectionMode;
  }

  /**
   * Changes water visibility without rebuilding its compiled resources.
   * @param visible Whether water should render.
   * @returns Nothing.
   */
  setVisible(visible: boolean): void {
    this._visible = visible;
    this._host?.setVisible(visible);
  }

  /**
   * Stores the Environment/SSR choice before startup and applies it live once ready.
   * @param mode Canonical Water reflection presentation mode.
   */
  async setReflectionMode(mode: TerrainWaterReflectionMode): Promise<void> {
    if (mode !== "environment" && mode !== "ssr") {
      throw new RangeError(`Unsupported Terrain water reflection mode: ${String(mode)}`);
    }
    if (this._water) await this._water.setReflectionMode(mode);
    this._reflectionMode = mode;
  }

  /** Freezes or releases Water surface animation for deterministic captures. */
  setSurfaceTimeOverride(elapsedTime?: number): void {
    if (elapsedTime !== undefined && (!Number.isFinite(elapsedTime) || elapsedTime < 0)) {
      throw new RangeError("Terrain water surface time must be finite and non-negative");
    }
    this._surfaceTimeOverride = elapsedTime;
    this._water?.setSurfaceTimeOverride(elapsedTime);
  }

  /** Publishes the shared Look's Water Forward SSR contribution. */
  async setScreenSpaceReflectionCompositeIntensity(intensity: number): Promise<void> {
    if (!Number.isFinite(intensity)) {
      throw new RangeError("Terrain Water SSR composite intensity must be finite");
    }
    const host = this._host;
    if (!host) throw new Error("Terrain Water Scene Host is not ready.");
    const nextIntensity = Math.min(1, Math.max(0, intensity));
    await host.updateLookAuthoring(LAKE_WATER_LOOK_PRESET_ID, (current) =>
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

  /**
   * Publishes one new revision of the shared lake Look. Every active consumer is
   * refreshed by the Host transaction; instances remain free of visual data.
   */
  async setSharedLookReflectionIntensity(intensity?: number): Promise<void> {
    if (intensity !== undefined && (!Number.isFinite(intensity) || intensity < 0 || intensity > 4)) {
      throw new RangeError("Terrain Water Look reflection intensity must be finite and within [0, 4].");
    }
    const host = this._host;
    if (!host) throw new Error("Terrain Water Scene Host is not ready.");
    const nextIntensity = intensity ?? LAKE_WATER_OPTICAL_PROFILE.reflectionIntensity;
    await host.updateLookAuthoring(LAKE_WATER_LOOK_PRESET_ID, (current) =>
      Object.freeze({
        ...current,
        optics: Object.freeze({
          ...current.optics,
          profile: Object.freeze({ ...current.optics.profile, reflectionIntensity: nextIntensity })
        })
      })
    );
  }

  /**
   * Applies a presentation-only left-to-right reveal to already prepared water resources.
   * @param progress Normalized reveal progress.
   * @returns Nothing.
   * @throws If progress is not finite.
   */
  setHorizontalRevealProgress(progress: number): void {
    if (!Number.isFinite(progress)) throw new RangeError("Terrain water reveal progress must be finite");
    this._water?.setHorizontalRevealProgress(progress);
  }

  /**
   * Synchronizes water-owned camera resources with the current drawing buffer.
   * @param width Drawing-buffer width in pixels.
   * @param height Drawing-buffer height in pixels.
   * @returns Nothing.
   */
  setViewportSize(width: number, height: number): void {
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError("Terrain water viewport size must contain positive integers");
    }
    this._water?.setViewportSize(width, height);
  }

  /** Starts progressive Region acquisition and detached water compilation. */
  override onStart(): void {
    const config = this._config;
    if (!config) {
      this._rejectReady(new Error("Terrain water was not initialized by its Scene"));
      return;
    }
    const load = config.worldRuntime.acquireRegions(config.initialActiveRegionIds);
    load.then(
      (lease) => void this._createWater(config, lease),
      (error) => this._rejectReady(error)
    );
  }

  /** Releases Region residency and water-owned resources. */
  override onDestroy(): void {
    this._rejectReady(new Error("Terrain water was destroyed before startup completed"));
    const water = this._water;
    this._water = null;
    const host = this._host;
    this._host = null;
    this._river = null;
    this._riverTerrainInteraction = null;
    this._riverBodyOrigin = null;
    this._riverTerrain = null;
    this._riverTerrainCoupler = null;
    if (water) void water.destroy().finally(() => host?.destroy());
    else if (host) void host.destroy();
    this._lease?.release();
    this._lease = null;
    this._config = null;
  }

  private async _createWater(config: TerrainWaterRuntimeConfig, lease: TerrainProjectRegionLease): Promise<void> {
    if (this.destroyed || this.pendingDestroy) {
      lease.release();
      return;
    }
    this._lease = lease;
    let createdWater: GrasslandsTerrainWaterPcg | undefined;
    try {
      const [authoringTypes, waterRuntime, regionProvider, hostRuntime] = await Promise.all([
        import("@galacean/engine-water/water/index"),
        import("../../grasslands/GrasslandsWaterPcg.ts"),
        import("../../grasslands/GrasslandsWaterRegionProvider.ts"),
        import("@galacean/engine-water/water/runtime/index")
      ]);
      const sampler = new TerrainProjectHeightSampler(lease.assets);
      const baseLayout = createWaterLayout(config, {
        schemaVersion: authoringTypes.WaterSpatialFieldSourceSchemaVersion.V1,
        bathymetry: authoringTypes.WaterBathymetrySourceKind.ShoreDistanceProfile,
        shoreSdf: authoringTypes.WaterShoreSdfSourceKind.WetMask
      });
      const region = regionProvider.createGrasslandsWaterRegion(baseLayout, sampler);
      const bedSamples = regionProvider.createGrasslandsTerrainBedSamples(baseLayout, region, sampler);
      const layout: GrasslandsTerrainWaterLayoutSpec = Object.freeze({
        ...baseLayout,
        spatialFields: Object.freeze({ ...baseLayout.spatialFields, bathymetry: bedSamples })
      });
      const environmentReflection = {
        ambientLight: this.scene!.ambientLight,
        rotationDegrees: TERRAIN_REALTIME_IBL_ROTATION_DEGREES,
        exposure: TERRAIN_REALTIME_IBL_EXPOSURE,
        hdr: true
      };
      const host = new hostRuntime.WaterSceneRuntimeHost({
        engine: this.engine,
        scene: this.scene!,
        camera: config.camera,
        root: this.entity,
        waterLayer: Layer.Layer30,
        cacheEntryLimit: 24,
        cacheBudgetBytes: 256 * 1024 * 1024,
        reflection: {
          cullingMask: config.camera.cullingMask,
          waterLayerMask: Layer.Layer30,
          screenSpaceReflection: waterRuntime.TERRAIN_WATER_SSR_CAMERA_SETTINGS
        }
      });
      this._host = host;
      const water = await waterRuntime.GrasslandsTerrainWaterPcg.createWithHost(
        host,
        this.engine,
        config.camera,
        environmentReflection,
        layout,
        region
      );
      createdWater = water;
      const riverStage =
        this._scenario === "lake-river"
          ? await Promise.all([
              import("../../grasslands/GrasslandsLakeRiverScenario.ts"),
              import("../../grasslands/GrasslandsRiverTerrainCoupling.ts")
            ]).then(([scenario, terrainCoupling]) => {
              this._riverTerrainCoupler = terrainCoupling.coupleGrasslandsTerrainToRiver;
              return scenario.stageGrasslandsLakeRiver(host, this.engine, 1);
            })
          : null;
      if (this.destroyed || this.pendingDestroy) {
        await water.destroy();
        await host.destroy();
        return;
      }
      this._water = water;
      this._river = riverStage?.inspection ?? null;
      this._riverTerrainInteraction = riverStage?.terrainInteraction ?? null;
      this._riverBodyOrigin = riverStage?.bodyOrigin ?? null;
      await water.setReflectionMode(this._reflectionMode);
      host.setVisible(this._visible);
      water.setViewportSize(this.engine.canvas.width, this.engine.canvas.height);
      water.setSurfaceTimeOverride(this._surfaceTimeOverride);
      this._resolveReady(water);
    } catch (error) {
      const host = this._host;
      this._host = null;
      if (createdWater) await createdWater.destroy().catch(() => {});
      if (host) await host.destroy().catch(() => {});
      if (this._lease === lease) {
        lease.release();
        this._lease = null;
      }
      this._rejectReady(error);
    }
  }
}

class TerrainProjectHeightSampler {
  constructor(private readonly _assets: readonly TerrainProjectAsset[]) {}

  sampleHeightInterpolated(worldX: number, worldZ: number): number | undefined {
    for (const asset of this._assets) {
      const document = asset.document;
      const descriptor = document.descriptor;
      const localX = (worldX - descriptor.worldPosition[0]) / descriptor.worldSize[0];
      const localZ = (worldZ - descriptor.worldPosition[2]) / descriptor.worldSize[2];
      if (localX < 0 || localX > 1 || localZ < 0 || localZ > 1) continue;
      const [width, height] = document.manifest.heightmap.sampleSize;
      const sampleX = localX * (width - 1);
      const sampleZ = localZ * (height - 1);
      const x0 = Math.floor(sampleX);
      const z0 = Math.floor(sampleZ);
      const x1 = Math.min(width - 1, x0 + 1);
      const z1 = Math.min(height - 1, z0 + 1);
      const tx = sampleX - x0;
      const tz = sampleZ - z0;
      const top = mix(
        document.heightmap[terrainRasterIndex(x0, z0, width)],
        document.heightmap[terrainRasterIndex(x1, z0, width)],
        tx
      );
      const bottom = mix(
        document.heightmap[terrainRasterIndex(x0, z1, width)],
        document.heightmap[terrainRasterIndex(x1, z1, width)],
        tx
      );
      const normalized = mix(top, bottom, tz) / 65535;
      const range = document.manifest.heightmap;
      return descriptor.worldPosition[1] + range.minMetres + normalized * (range.maxMetres - range.minMetres);
    }
    return undefined;
  }
}

function createWaterLayout(
  config: TerrainWaterRuntimeConfig,
  sourceKinds: {
    schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1;
    bathymetry: WaterBathymetrySourceKind.ShoreDistanceProfile;
    shoreSdf: WaterShoreSdfSourceKind.WetMask;
  }
): GrasslandsTerrainWaterLayoutSpec {
  return Object.freeze({
    position: Object.freeze([config.position[0], config.position[1], config.position[2]] as const),
    sizeXZ: Object.freeze([config.sizeXZ[0], config.sizeXZ[1]] as const),
    region: Object.freeze({
      resolution: Object.freeze([config.resolution[0], config.resolution[1]] as const),
      wetThreshold: config.wetThreshold,
      closeIsolatedHoles: true,
      componentPolicy: "largest" as const,
      maximumRepairRatio: 0.01
    }),
    spatialFields: Object.freeze({
      schemaVersion: sourceKinds.schemaVersion,
      bathymetry: Object.freeze({
        schemaVersion: sourceKinds.schemaVersion,
        kind: sourceKinds.bathymetry,
        edgeDepth: 0.1,
        channelDepth: 1.5,
        deepBandMeters: 14.5,
        profileExponent: 1.5,
        maximumDepth: 1.5
      }),
      shoreSdf: Object.freeze({
        schemaVersion: sourceKinds.schemaVersion,
        kind: sourceKinds.shoreSdf
      })
    })
  });
}

function validateFiniteTuple(value: readonly number[], length: number, name: string): void {
  if (!Array.isArray(value) || value.length !== length || value.some((entry) => !Number.isFinite(entry))) {
    throw new TypeError(`Terrain water ${name} must contain ${length} finite numbers`);
  }
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
