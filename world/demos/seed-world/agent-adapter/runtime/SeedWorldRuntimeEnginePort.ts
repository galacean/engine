import { SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1 } from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldWaterRuntimeBridgeV1";
import type { SeedWorldRef, SeedWorldWaterColorRgb } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { createSeedWorldEngineDraft } from "../SeedWorldEngineDraft.ts";
import {
  type Camera,
  type WeatherCloudState,
  type WeatherLightningState,
  type WeatherPrecipitationState,
  type WeatherSkyLightingState,
  type WeatherWindState,
  type WeatherState,
  Vector3,
  WeatherPresets
} from "@galacean/engine";
import type { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  TERRAIN_SEASON_DEFAULT_COMPOSITIONS,
  type WorldEnvironmentRuntime
} from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import type { TerrainLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import {
  captureTerrainIBLRevisionBarrier,
  hasPublishedTerrainIBLRevision
} from "@galacean/engine-environment/terrain/lighting/TerrainIBLRevisionBarrier";
import type { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import {
  sampleSeedWorldHeight,
  sampleSeedWorldPopulation,
  SEED_WORLD_HEIGHT_RANGE,
  seedWorldOriginX, seedWorldOriginZ,
  type SeedWorldFields
} from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import { SeedWorldLandCover, type SeedWorldPoint } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import type { SeedWorldRuntimePlan as SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldRuntimePlan";
import type { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import type { SeedWorldWaterRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldWaterRuntime";
import type { SeedWorldHydrologyArtifactV1 } from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldHydrologyArtifact";
import type {
  SeedWorldAtmosphereInput,
  SeedWorldAuthoringSnapshot,
  SeedWorldCameraMode,
  SeedWorldEnginePort,
  SeedWorldEnvironmentUpdateInput,
  SeedWorldLightningInput,
  SeedWorldLiveState,
  SeedWorldMountCommandInput,
  SeedWorldMountCommandResult,
  SeedWorldObject,
  SeedWorldObjectKind,
  SeedWorldObjectOrderField,
  SeedWorldObjectQueryInput,
  SeedWorldObjectQueryResult,
  SeedWorldPointOrderField,
  SeedWorldPointQueryFilter,
  SeedWorldPointQueryInput,
  SeedWorldPrecipitationInput,
  SeedWorldRegionKind,
  SeedWorldResourceMutation,
  SeedWorldResolvedSpatialTarget,
  SeedWorldSeason,
  SeedWorldSpatialAnchor,
  SeedWorldSpatialTarget,
  SeedWorldTerrainPatchConstraints,
  SeedWorldWeatherPreset,
  SeedWorldWindInput
} from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";

const IBL_WAIT_TIMEOUT_MILLISECONDS = 70_000;
const ENVIRONMENT_TRANSITION_GRACE_MILLISECONDS = 5_000;

/** Required scene water facts; optional level controls exist only for supported backend bodies. */
export type SeedWorldRuntimeWater = Pick<SeedWorldWaterRuntime, "queryAuthoredSurface"> & {
  readonly colorAuthoring: Pick<SeedWorldWaterRuntime["colorAuthoring"], "read" | "update" | "snapshot"> & {
    clear(bodyId: string, signal: AbortSignal): Promise<void>;
  };
} & Partial<
    Pick<
      SeedWorldWaterRuntime,
      "getAuthoredWaterLevelReadback" | "getLakeWaterLevelReadbacks" | "getOceanWaterLevelReadback"
    >
  > & {
    /** Complete published Water query; false is authoritative when this port exists. */
    querySurface?: SeedWorldWaterRuntime["queryAuthoredSurface"];
    getDiagnostics(): Pick<
      ReturnType<SeedWorldWaterRuntime["getDiagnostics"]>,
      "ready" | "visible" | "bodyCount" | "chunkCount" | "hostRevision"
    > & { host: ReturnType<SeedWorldWaterRuntime["getDiagnostics"]>["host"] | null };
  };

export interface SeedWorldRuntimeContext {
  readonly plan: SeedWorldPlan;
  readonly fields: SeedWorldFields;
  readonly world: SeedWorldTerrainRuntime;
  readonly cameraMode: SeedWorldCameraMode;
  readonly camera: Camera;
  readonly navigation: TerrainNavigationRuntime;
  readonly orbit: OrbitControl;
  readonly lighting: TerrainLightingRuntime;
  readonly environment: WorldEnvironmentRuntime;
  readonly water: SeedWorldRuntimeWater;
  readonly hydrologyArtifact?: SeedWorldHydrologyArtifactV1;
}

export interface SeedWorldRuntimeEnginePortOptions {
  readonly readAdditionalObjects?: (revision: number) => readonly SeedWorldObject[];
  readonly querySubjectCapsules?: NonNullable<SeedWorldEnginePort["querySubjectCapsules"]>;
  readonly querySubjectSegments?: NonNullable<SeedWorldEnginePort["querySubjectSegments"]>;
  readonly readVegetationAssets?: SeedWorldEnginePort["readVegetationAssets"];
  /** Dispatches gameplay intent through the mounted scene host. */
  readonly commandMount?: (
    input: Readonly<SeedWorldMountCommandInput>,
    signal: AbortSignal
  ) => Promise<SeedWorldMountCommandResult> | SeedWorldMountCommandResult;
  readonly readContext: () => SeedWorldRuntimeContext | null;
  /** A published spatial plan may own water independently of legacy Hydrology V1. */
  readonly queryWaterRegions?: (kind: "ocean" | "lake" | "river", limit: number) => unknown;
  readonly resolveWaterColorBodyId?: (ref: Readonly<SeedWorldRef>) => string | undefined;
  readonly isDestroyed: () => boolean;
  readonly sampleNavigationHeight: (
    plan: SeedWorldPlan,
    fields: SeedWorldFields,
    x: number,
    z: number
  ) => number | undefined;
  readonly setStatus?: (message: string) => void;
  readonly onWorldAppearanceChanged?: () => Promise<void>;
  readonly runWorldAppearanceMutation?: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly readAuthoringSnapshot: () => SeedWorldAuthoringSnapshot;
  readonly mutateWorldResource: (
    input: Readonly<SeedWorldResourceMutation>,
    signal: AbortSignal
  ) => Promise<unknown> | unknown;
  readonly mutateWorldResources: (
    inputs: readonly Readonly<SeedWorldResourceMutation>[],
    signal: AbortSignal
  ) => Promise<unknown> | unknown;
}

/** Concrete World Engine gateway. Agent concepts do not cross this boundary into the runtime. */
export class SeedWorldRuntimeEnginePort implements SeedWorldEnginePort {
  readVegetationAssets() {
    this._requireContext();
    return this._options.readVegetationAssets?.();
  }
  private _catalogWorld: SeedWorldRuntimeContext["world"] | undefined;
  private _catalogRevision = -1;
  private _catalogTreeAppearanceRevision = -1;
  private _catalog: ReadonlyMap<string, SeedWorldObject> = new Map();

  constructor(private readonly _options: SeedWorldRuntimeEnginePortOptions) {}
  createSpatialQueryPort(read: Parameters<NonNullable<SeedWorldEnginePort["createSpatialQueryPort"]>>[0], revision: () => number) {
    const draft = new SeedWorldRuntimeEnginePort({ ...this._options,
      queryWaterRegions: (kind, limit) => read().queryWaterRegions?.(kind, limit) ?? this.queryWorldRegions(kind, limit),
      readAuthoringSnapshot: () => ({ ...this._options.readAuthoringSnapshot(), activeRevision: revision(), draftRevision: revision() }),
      readContext: () => {
        const live = this._options.readContext();
        if (!live) return null;
        const snapshot = read();
        const water = new Proxy(live.water, { get(target, property) {
          if (property === "querySurface" || property === "queryAuthoredSurface") return snapshot.queryWater;
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        } });
        return { ...live, plan: snapshot.plan, fields: snapshot.fields, water };
      }
    });
    return { queryWorldPoints: draft.queryWorldPoints.bind(draft), queryWorldRegions: draft.queryWorldRegions.bind(draft),
      resolveSpatialTarget: draft.resolveSpatialTarget.bind(draft), readTerrainPatchConstraints: draft.readTerrainPatchConstraints.bind(draft) };
  }
  querySubjectCapsules(capsules:readonly import("@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort").SeedWorldSurfaceCapsule[]) {
    if(!this._options.readContext()||this._options.isDestroyed())return undefined;
    return this._options.querySubjectCapsules?.(capsules);
  }
  querySubjectSegments(segments:readonly import("@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort").SeedWorldSurfaceSegment[]) {
    if(!this._options.readContext()||this._options.isDestroyed())return undefined;
    return this._options.querySubjectSegments?.(segments);
  }

  readEditorDefaults(): import("@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort").SeedWorldEditorSettings {
    const state = this.readWorldState();
    if (!state) throw new Error("World is not ready");
    return {
      waterColors: [], camera: structuredClone(state.camera),
      environment: {timeHours: state.lighting.timeHours, season: state.environment.season,
        atmosphere: {skyColorRgb: state.environment.skyColorRgb ?? null},
        weatherChannels: structuredClone(this._requireContext().environment.weatherSystem.getTargetSnapshot()),
        transitionDuration: 0, waitForIbl: false}
    };
  }

  beginEdit(executionId: string, settings?: import("@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort").SeedWorldEditorSettings) {
    let weather: WeatherState | undefined;
    return createSeedWorldEngineDraft(this, {
      environment: (state, input) => {
        weather ??= this._requireContext().environment.weatherSystem.getTargetSnapshot();
        const projected = this._projectEnvironmentEdit(state, input, weather);
        weather = projected.weather;
        return projected;
      },
      teleport: input => this._previewTeleport(input),
      restoreCamera: snapshot => {
        const { camera, navigation, orbit } = this._requireContext();
        const current = camera.entity.transform.worldPosition;
        const distance = Vector3.distance(current, orbit.target);
        const [x, y, z] = snapshot.position, [fx, fy, fz] = snapshot.forward;
        if (snapshot.navigation) {
          navigation.setEyeHeight(snapshot.navigation.eyeHeight);
          navigation.setVerticalOffset(snapshot.navigation.verticalOffset);
        }
        camera.entity.transform.setWorldPosition(x, y, z);
        camera.entity.transform.lookAt(new Vector3(x + fx * 36, y + fy * 36, z + fz * 36));
        if (snapshot.mode === "orbit") orbit.target.set(x + fx * distance, y + fy * distance, z + fz * distance);
        navigation.synchronizeView();
      },
      validateMount: () => {
        this._requireContext();
        if (!this._options.commandMount) throw new Error("Mount runtime is unavailable");
      }
    }, executionId, settings);
  }

  private _projectEnvironmentEdit(state: SeedWorldLiveState, input: SeedWorldEnvironmentUpdateInput, current: WeatherState) {
    const { lighting, environment } = this._requireContext();
    if (input.waitForIbl) requireIblBaking(lighting);
    const windState = environment.getSnapshot().wind;
    const baseSpeed = windState.baseSpeedMps;
    const weather = structuredClone(current);
    const channels: Partial<WeatherState> = {};
    const set = <K extends keyof WeatherState>(key: K, value: WeatherState[K]) => {
      Object.assign(weather, { [key]: structuredClone(value) });
      Object.assign(channels, { [key]: structuredClone(value) });
    };
    // Run exactly the same channel setters as activation against detached data.
    applyEnvironmentChannels({
      getSnapshot: () => ({ weather, wind: windState }),
      setSeason: season => {
        const defaults = TERRAIN_SEASON_DEFAULT_COMPOSITIONS[season];
        set("cloud", WeatherPresets.cloud[defaults.cloud]);
        set("skyLighting", WeatherPresets.skyLighting[defaults.skyLighting]);
        set("precipitation", WeatherPresets.precipitation[defaults.precipitation]);
      },
      setWeatherState: value => {
        for (const key of Object.keys(value) as (keyof WeatherState)[]) set(key, value[key]);
      },
      setCloud: value => set("cloud", value), setSkyLighting: value => set("skyLighting", value),
      setPrecipitation: value => set("precipitation", value), setWind: value => set("wind", value),
      setLightning: value => set("lightning", value)
    }, input);
    const previous = state.environment;
    const targetTime = input.timeHours === undefined ? undefined : lighting.system.profile.createState(input.timeHours / 24);
    const skyColor = input.atmosphere?.skyColorRgb;
    const channelNames = Object.keys(channels) as (keyof WeatherState)[];
    const forward: SeedWorldEnvironmentUpdateInput = {
      transitionDuration: input.transitionDuration, waitForIbl: input.waitForIbl,
      ...(targetTime ? { timeHours: targetTime.timeHours, ...(input.fromTimeHours === undefined ? {} : { fromTimeHours: input.fromTimeHours }) } : {}),
      ...(input.season === undefined ? {} : { season: input.season }),
      ...(skyColor === undefined ? {} : { atmosphere: { skyColorRgb: skyColor } }),
      ...(channelNames.length ? { weatherChannels: channels } : {})
    };
    const previousTargets: Partial<SeedWorldEnvironmentUpdateInput> = {
      ...(targetTime ? { timeHours: state.lighting.timeHours } : {}),
      ...(input.season === undefined ? {} : { season: previous.season }),
      ...(skyColor === undefined ? {} : { atmosphere: { skyColorRgb: previous.skyColorRgb ?? null } }),
      ...(channelNames.length ? { weatherChannels: Object.fromEntries(channelNames.map(key => [key, structuredClone(current[key])])) } : {})
    };
    const rainIntensity = weather.precipitation.rainRate, snowIntensity = weather.precipitation.snowRate;
    return { forward, previous: previousTargets, weather, state: {
      ...state,
      lighting: { ...state.lighting, ...(targetTime ? { timeHours: targetTime.timeHours, phase: targetTime.phase } : {}) },
      environment: {
        ...previous,
        season: input.season ?? previous.season,
        seasonTransitionProgress: input.season === undefined ? previous.seasonTransitionProgress : 1,
        skyColorRgb: skyColor === undefined ? previous.skyColorRgb : skyColor,
        rainIntensity, snowIntensity,
        precipitation: snowIntensity > 0 ? `snow:${snowIntensity.toFixed(2)}` : rainIntensity > 0 ? `rain:${rainIntensity.toFixed(2)}` : "none",
        cloudCoverage: weather.cloud.cloudCoverage,
        fogIntensity: clamp01((weather.skyLighting.fogDensityMultiplier - 1) / 7),
        windSpeed: baseSpeed * weather.wind.forceMultiplier, windIntensity: clamp01(weather.wind.forceMultiplier / 2.4),
        windDirectionDegrees: wrapWindHeading(windHeading(windState.baseDirection) - weather.wind.directionOffsetDegrees),
        windGustiness: clamp01(weather.wind.gustStrength / 0.6), windTurbulence: weather.wind.turbulence,
        lightningFrequency: clamp01(weather.lightning.frequency), lightningIntensity: clamp01(weather.lightning.strength / 4)
      }
    } };
  }

  private _previewTeleport(input: Readonly<{ x: number; z: number; heightOffset: number }>) {
    const { plan, fields, cameraMode, camera, orbit, navigation } = this._requireContext();
    const surface = this._options.sampleNavigationHeight(plan, fields, input.x, input.z);
    if (surface === undefined) throw new RangeError("传送坐标位于 Seed World 边界之外");
    const previous = camera.entity.transform.worldPosition;
    const cameraPosition: [number, number, number] = cameraMode === "orbit"
      ? [input.x + previous.x - orbit.target.x, surface + previous.y - orbit.target.y, input.z + previous.z - orbit.target.z]
      : [input.x, surface + input.heightOffset, input.z];
    return { mode: cameraMode, requested: { ...input }, navigationSurfaceHeight: surface, cameraPosition,
      ...(cameraMode !== "orbit" && navigation?.groundCollision && !navigation.locomotionOwner
        ? { navigation: { eyeHeight: input.heightOffset, verticalOffset: 0 } } : {}),
      orbitTarget: cameraMode === "orbit" ? [input.x, surface, input.z] : [orbit.target.x, orbit.target.y, orbit.target.z] };
  }

  projectPlanningTrees: NonNullable<SeedWorldEnginePort["projectPlanningTrees"]> = (instances, ground, size, revision, patch) => {
    const context = this._requireContext();
    return context.world.population.readPlanningTreeInstances(instances, ground, size, patch).map(({ instance, tree }) => ({
      worldId: `seed-world-${context.plan.rootSeed}`, worldRevision: revision, objectId: instance.id, objectKind: "tree" as const,
      position: tree.position, footprintMetres: treeQueryFootprint(tree.bounds),
      source: instance.authoringBrushId ? { kind: "authoring" as const, sourceId: instance.authoringBrushId }
        : { kind: "population" as const, sourceId: instance.sourceCellId },
      properties: { prototypeFamily: instance.prototypeFamily, assetRecipeId: instance.assetRecipeId,
        treeSpeciesProfileKey: instance.treeSpeciesProfileKey, treeCohortProfileKey: instance.treeCohortProfileKey,
        treeShape: tree.treeShape, treeRecipeId: tree.recipeId, treeRecipeLabel: tree.recipeLabel,
        treeEffectIndex: tree.effectIndex, bounds: tree.bounds, scale: tree.scale, yawRadians: tree.yawRadians }
    }));
  };

  projectTreeVariationObject(object: SeedWorldObject, controls: import("@galacean/engine-vegetation/world/SeedWorldTreeShapeControls").SeedWorldTreeShapePatch): SeedWorldObject {
    const context = this._requireContext();
    const instance = context.world.population.getExactPopulationInstances().find(instance => instance.id === object.objectId);
    if (!instance) throw new Error("Tree shape target has no published instance");
    const next = context.world.population.readProceduralTreeInstance(instance, object.position, controls);
    return { ...object, footprintMetres: treeQueryFootprint(next.bounds), properties: { ...object.properties, treeShape: next.treeShape, treeRecipeId: next.recipeId,
      treeRecipeLabel: next.recipeLabel, treeEffectIndex: next.effectIndex, bounds: next.bounds, scale: next.scale, yawRadians: next.yawRadians } };
  }

  previewTreeVariationEdit(recipeId: string, variationIndex: number, controls: import("@galacean/engine-vegetation/world/SeedWorldTreeShapeControls").SeedWorldTreeShapePatch) {
    const context = this._requireContext();
    const objects = this._readObjectCatalog(context, this._options.readAuthoringSnapshot().activeRevision);
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    let count = 0;
    for (const instance of context.world.population.getExactPopulationInstances()) {
      const object = objects.get(instance.id);
      if (object?.properties.treeRecipeId !== recipeId || object.properties.treeEffectIndex !== variationIndex + 1) continue;
      const next = context.world.population.readProceduralTreeInstance(instance, object.position, controls).bounds;
      const current = object.properties.bounds as { minimum: readonly number[]; maximum: readonly number[] };
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis]!, current.minimum[axis]!, next.minimum[axis]!);
        maximum[axis] = Math.max(maximum[axis]!, current.maximum[axis]!, next.maximum[axis]!);
      }
      count++;
    }
    if (count === 0) throw new Error("Shared tree effect has no current instances");
    return Object.freeze({ minimum: Object.freeze(minimum as [number, number, number]), maximum: Object.freeze(maximum as [number, number, number]) });
  }

  readWaterColor(ref: Readonly<SeedWorldRef>): SeedWorldWaterColorRgb | undefined {
    const bodyId = this._waterColorBodyId(ref);
    return bodyId ? this._requireContext().water.colorAuthoring.read(bodyId) : undefined;
  }

  async updateWaterColor(ref: Readonly<SeedWorldRef>, color: SeedWorldWaterColorRgb, signal: AbortSignal) {
    const bodyId = this._waterColorBodyId(ref);
    if (!bodyId) throw new Error("NOT_EDITABLE: water asset has no rendered color target");
    const update = async () => {
      const resolved = await this._requireContext().water.colorAuthoring.update(bodyId, color, signal);
      await this._options.onWorldAppearanceChanged?.();
      return resolved;
    };
    return this._options.runWorldAppearanceMutation ? this._options.runWorldAppearanceMutation(update) : update();
  }

  async replaceWaterColors(colors: import("@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort").SeedWorldEditorSettings["waterColors"], signal: AbortSignal): Promise<void> {
    const desired = new Map(colors.map(({ref, color}) => {
      const id = this._waterColorBodyId(ref);
      if (!id) throw new Error("NOT_EDITABLE: water asset has no rendered color target");
      return [id, color] as const;
    }));
    const update = async () => {
      const authoring = this._requireContext().water.colorAuthoring;
      let changed = false;
      const current = new Map(authoring.snapshot().map(item => [item.bodyId, item.colorRgb]));
      for (const bodyId of current.keys()) if (!desired.has(bodyId)) {
        await authoring.clear(bodyId, signal); changed = true;
      }
      for (const [id, color] of desired) if (JSON.stringify(current.get(id)) !== JSON.stringify(color) || JSON.stringify(authoring.read(id)) !== JSON.stringify(color)) {
        await authoring.update(id, color, signal); changed = true;
      }
      if (changed) await this._options.onWorldAppearanceChanged?.();
    };
    if (this._options.runWorldAppearanceMutation) await this._options.runWorldAppearanceMutation(update);
    else await update();
  }

  private _waterColorBodyId(ref: Readonly<SeedWorldRef>): string | undefined {
    if (ref.domain !== "water") return undefined;
    if (this._options.resolveWaterColorBodyId) return this._options.resolveWaterColorBodyId(ref);
    if (ref.source === "natural") {
      const prefix = `natural:${ref.kind}:`;
      if (!ref.id.startsWith(prefix) || (ref.kind !== "lake" && ref.kind !== "ocean")) return undefined;
      const id = ref.id.slice(prefix.length);
      const exists = this._requireContext().hydrologyArtifact?.waterBodyCatalog.some(
        (body) => body.bodyId === id && body.waterType === ref.kind
      );
      return exists ? (ref.kind === "ocean" ? SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1 : id) : undefined;
    }
    const resource = this._options.readAuthoringSnapshot().resources.find((item) =>
      item.resourceId === ref.id && (item.resourceType === "water-body" || item.resourceType === "river") && item.properties.kind === ref.kind
    );
    if (!resource) return undefined;
    return resource.resourceType === "river" ? `seed-world-authored-river:${ref.id}` : `seed-world-authored-water-basin:${ref.id}`;
  }

  readWorldState(): SeedWorldLiveState | null {
    const context = this._options.readContext();
    if (!context) return null;
    const { plan, fields, world, cameraMode, camera, lighting, environment, water } = context;
    const cameraPosition = camera.entity.transform.worldPosition;
    const cameraForward = camera.entity.transform.worldForward;
    const lightingSnapshot = lighting.getSnapshot();
    const environmentSnapshot = environment.getSnapshot();
    const waterDiagnostics = water.getDiagnostics();
    const authoredRiverCount = this._options
      .readAuthoringSnapshot()
      .resources.filter(({ resourceType }) => resourceType === "river").length;
    const precipitation = environmentSnapshot.weather.precipitation;
    const precipitationLabel =
      precipitation.snowRate > 0
        ? `snow:${precipitation.snowRate.toFixed(2)}`
        : precipitation.rainRate > 0
          ? `rain:${precipitation.rainRate.toFixed(2)}`
          : "none";
    return {
      world: {
        rootSeed: plan.rootSeed,
        sizeMetres: fields.sizeMetres,
        origin: [seedWorldOriginX(fields), seedWorldOriginZ(fields)]
      },
      plan: {
        summitCount: plan.summits.length,
        riverReachCount: fields.riverCurves.length + authoredRiverCount,
        roadCount: plan.roads.length,
        poiCount: plan.pois.length
      },
      camera: {
        mode: cameraMode,
        position: [cameraPosition.x, cameraPosition.y, cameraPosition.z],
        forward: [cameraForward.x, cameraForward.y, cameraForward.z],
        ...(context.navigation
          ? {
              navigation: { eyeHeight: context.navigation.eyeHeight, verticalOffset: context.navigation.verticalOffset }
            }
          : {})
      },
      population: {
        treeAppearanceRevision: world.population.treeAppearanceRevision ?? 0,
        residentCellCount: world.population.residentCellCount,
        residentAcceptedCounts: { ...world.population.residentAcceptedCounts },
        submittedCounts: { ...world.population.submittedCounts }
      },
      decorations: {
        rocks: (world.stones?.placementCount ?? 0),
        smallRocks: (world.smallRocks?.placementCount ?? 0),
        mushrooms: world.mushrooms.placementCount,
        lotus: world.lotus.placementCount
      },
      water: {
        colors: (waterDiagnostics.host?.bodies ?? []).map(({ bodyId }) => ({
          bodyId,
          colorRgb: water.colorAuthoring.read(bodyId) ?? null
        })),
        ready: waterDiagnostics.ready,
        visible: waterDiagnostics.visible,
        bodyCount: waterDiagnostics.bodyCount,
        chunkCount: waterDiagnostics.chunkCount,
        hostRevision: waterDiagnostics.hostRevision
      },
      lighting: {
        timeHours: canonicalSemanticNumber(lightingSnapshot.timeHours),
        phase: lightingSnapshot.phase,
        playing: lightingSnapshot.playing,
        iblPhase: lightingSnapshot.iblBake.phase,
        iblProgress: lightingSnapshot.iblBake.progress,
        iblPublishedRevision: lightingSnapshot.iblBake.publishedRevision,
        iblBakingEnabled: lightingSnapshot.iblBakingEnabled
      },
      environment: {
        skyColorRgb: lightingSnapshot.skyColorRgb ?? null,
        season: environmentSnapshot.season.id,
        seasonTransitionProgress: environmentSnapshot.season.transitionProgress,
        precipitation: precipitationLabel,
        rainIntensity: precipitation.rainRate,
        snowIntensity: precipitation.snowRate,
        cloudCoverage: environmentSnapshot.weather.cloud.cloudCoverage,
        fogIntensity: clamp01((environmentSnapshot.weather.skyLighting.fogDensityMultiplier - 1) / 7),
        // wind.speedMps is the instantaneous gust sample. The public API
        // promises sustained wind speed, which is the configured baseline
        // multiplied by the completed weather forcing.
        windSpeed: canonicalSemanticNumber(
          environmentSnapshot.wind.baseSpeedMps * environmentSnapshot.weather.wind.forceMultiplier
        ),
        windIntensity: clamp01(environmentSnapshot.weather.wind.forceMultiplier / 2.4),
        windDirectionDegrees: windHeading(environmentSnapshot.wind.direction),
        windGustiness: clamp01(environmentSnapshot.weather.wind.gustStrength / 0.6),
        windTurbulence: clamp01(environmentSnapshot.weather.wind.turbulence),
        lightningFrequency: clamp01(environmentSnapshot.weather.lightning.frequency),
        lightningIntensity: clamp01(environmentSnapshot.weather.lightning.strength / 4)
      }
    };
  }

  readAuthoringSnapshot(): SeedWorldAuthoringSnapshot {
    return this._options.readAuthoringSnapshot();
  }

  readAuthoredWaterLevel(resourceId: string) {
    const readback = this._requireContext().water.getAuthoredWaterLevelReadback?.(resourceId);
    return readback
      ? Object.freeze({
          canonicalWaterLevelMetres: readback.canonicalWaterLevelMetres,
          minimumWaterLevelMetres: readback.minimumWaterLevelMetres,
          maximumWaterLevelMetres: readback.maximumWaterLevelMetres,
          waterLevelMetres: readback.effectiveWaterLevelMetres
        })
      : null;
  }

  queryWorldPoints(input: Readonly<SeedWorldPointQueryInput>): unknown {
    const { plan, fields, water } = this._requireContext();
    if (input.mode === "search") return searchWorldPoints(plan, fields, water, input);
    const { positions, sampleDistance } = input;
    const directions = [
      [0, -1, "north"],
      [1, -1, "north_east"],
      [1, 0, "east"],
      [1, 1, "south_east"],
      [0, 1, "south"],
      [-1, 1, "south_west"],
      [-1, 0, "west"],
      [-1, -1, "north_west"]
    ] as const;
    const samples = positions.map(({ x, z }) => {
      const population = sampleSeedWorldPopulation(plan, fields, x, z);
      if (!population) return Object.freeze({ x, z, insideWorld: false });
      const waterSample = sampleRuntimeWater(water, population.water, x, z);
      const authoredWater = waterSample.surface;
      const neighbors = directions.map(([dx, dz, direction]) => {
        const height = sampleSeedWorldHeight(fields, x + dx * sampleDistance, z + dz * sampleDistance);
        return Object.freeze({
          direction,
          height: height ?? null,
          heightDelta: height === undefined ? null : height - population.height
        });
      });
      return Object.freeze({
        x,
        z,
        insideWorld: true,
        height: population.height,
        slope: population.slope,
        curvature: population.curvature,
        flow: population.flow,
        moisture: population.moisture,
        landCover: landCoverName(population.landCover),
        wetlandWeight: population.wetlandWeight,
        water: waterSample.water,
        ...(authoredWater?.surfaceElevationMetres !== undefined
          ? { waterSurfaceElevationMetres: authoredWater.surfaceElevationMetres }
          : {}),
        riverDistanceMetres: Math.min(
          population.riverDistanceMetres,
          authoredWater?.nearestRiverDistanceMetres ?? Number.POSITIVE_INFINITY
        ),
        roadDistanceMetres: population.roadDistanceMetres,
        neighbors: Object.freeze(neighbors)
      });
    });
    return Object.freeze({ sampleDistance, samples: Object.freeze(samples) });
  }

  queryWorldRegions(kind: SeedWorldRegionKind, limit: number): unknown {
    const { plan, fields, water } = this._requireContext();
    if ((kind === "ocean" || kind === "lake" || kind === "river") && this._options.queryWaterRegions)
      return this._options.queryWaterRegions(kind, limit);
    const toPosition = (point: SeedWorldPoint) => pointToWorld(point, fields.sizeMetres, fields);
    switch (kind) {
      case "summit":
        return Object.freeze({
          kind,
          features: Object.freeze(
            plan.summits
              .slice(0, limit)
              .map((summit, index) =>
                Object.freeze({ id: `summit-${index}`, position: toPosition(summit), elevation: summit.elevation })
              )
          )
        });
      case "river":
        return Object.freeze({
          kind,
          features: Object.freeze(
            fields.riverCurves.slice(0, limit).map((river) => {
              const first = river.controls[0]!;
              const middle = river.controls[Math.floor(river.controls.length * 0.5)]!;
              const last = river.controls.at(-1)!;
              const deepest = maximumItem(river.controls, (point) => point.depthMetres)!;
              const surfacePosition = riverSurfacePosition(middle, fields);
              return Object.freeze({
                id: river.id,
                riverKind: river.id.includes("-trunk-") ? "trunk" : "tributary",
                pointCount: river.controls.length,
                source: toPosition(first),
                middle: toPosition(middle),
                surfacePosition,
                surfaceElevationMetres: surfacePosition[1],
                outlet: toPosition(last),
                maximumWidthMetres: maximumOf(river.controls, (point) => point.widthMetres),
                maximumDepthMetres: deepest.depthMetres,
                deepestPoint: Object.freeze({
                  position: toPosition(deepest),
                  bedElevationMetres: deepest.bedElevationMetres,
                  depthMetres: deepest.depthMetres,
                  widthMetres: deepest.widthMetres
                })
              });
            })
          )
        });
      case "ocean":
      case "lake": {
        const { hydrologyArtifact } = this._requireContext();
        if (!hydrologyArtifact) return Object.freeze({ kind, features: Object.freeze([]) });
        const lakeLevels = new Map((water.getLakeWaterLevelReadbacks?.() ?? []).map((readback) => [readback.bodyId, readback]));
        const oceanLevel = water.getOceanWaterLevelReadback?.();
        const worldMinimumX = hydrologyArtifact.lakeBasinSupport.transform.worldMinXMillimetres / 1_000;
        const worldMinimumZ = hydrologyArtifact.lakeBasinSupport.transform.worldMinZMillimetres / 1_000;
        return Object.freeze({
          kind,
          features: Object.freeze(
            hydrologyArtifact.waterBodyCatalog.flatMap((body, index) => {
              if (body.waterType !== kind) return [];
              const surfaceElevationMetres = (body.uniformSurfaceHeightMillimetres ?? 0) / 1_000;
              const waterLevel =
                kind === "lake"
                  ? lakeLevels.get(body.bodyId)
                  : oceanLevel
                    ? Object.freeze({
                        canonicalWaterLevelMetres: oceanLevel.defaultWaterLevelMetres,
                        minimumWaterLevelMetres: oceanLevel.minimumWaterLevelMetres,
                        maximumWaterLevelMetres: oceanLevel.maximumWaterLevelMetres,
                        effectiveWaterLevelMetres: oceanLevel.effectiveWaterLevelMetres
                      })
                    : undefined;
              const effectiveSurfaceElevationMetres = waterLevel?.effectiveWaterLevelMetres ?? surfaceElevationMetres;
              const lakeBounds = kind === "lake" ? hydrologyArtifact.lakeBasinSupport.boundsMillimetres(index + 1) : undefined;
              const minimumX = lakeBounds ? worldMinimumX + lakeBounds.minX / 1_000 : -fields.sizeMetres * 0.5;
              const maximumX = lakeBounds ? worldMinimumX + lakeBounds.maxX / 1_000 : fields.sizeMetres * 0.5;
              const minimumZ = lakeBounds ? worldMinimumZ + lakeBounds.minZ / 1_000 : -fields.sizeMetres * 0.5;
              const maximumZ = lakeBounds ? worldMinimumZ + lakeBounds.maxZ / 1_000 : fields.sizeMetres * 0.5;
              return [Object.freeze({
                id: body.bodyId,
                position: Object.freeze([
                  (minimumX + maximumX) * 0.5,
                  effectiveSurfaceElevationMetres,
                  (minimumZ + maximumZ) * 0.5
                ]),
                surfaceElevationMetres: effectiveSurfaceElevationMetres,
                ...(waterLevel
                  ? {
                      canonicalWaterLevelMetres: waterLevel.canonicalWaterLevelMetres,
                      minimumWaterLevelMetres: waterLevel.minimumWaterLevelMetres,
                      maximumWaterLevelMetres: waterLevel.maximumWaterLevelMetres,
                      waterLevelMetres: waterLevel.effectiveWaterLevelMetres
                    }
                  : {}),
                bounds: Object.freeze({
                  minimum: Object.freeze([minimumX, effectiveSurfaceElevationMetres, minimumZ]),
                  maximum: Object.freeze([maximumX, effectiveSurfaceElevationMetres, maximumZ])
                })
              })];
            }).slice(0, limit)
          )
        });
      }
      case "road":
        return Object.freeze({
          kind,
          features: Object.freeze(
            plan.roads.slice(0, limit).map((road) =>
              Object.freeze({
                id: road.id,
                fromPoiId: road.fromPoiId,
                toPoiId: road.toPoiId,
                pointCount: road.points.length,
                bridgeCount: road.bridgeIntervals.length,
                start: toPosition(road.points[0]!),
                end: toPosition(road.points.at(-1)!)
              })
            )
          )
        });
      case "bridge":
        return Object.freeze({
          kind,
          features: Object.freeze(
            plan.roads.flatMap((road) =>
              road.bridgeIntervals.map((interval, index) => {
                const middleArcMetres = (interval.startArcMetres + interval.endArcMetres) * 0.5;
                return Object.freeze({
                  id: `${road.id}:${index}`,
                  roadId: road.id,
                  startArcMetres: interval.startArcMetres,
                  endArcMetres: interval.endArcMetres,
                  lengthMetres: interval.endArcMetres - interval.startArcMetres,
                  position: toPosition(roadPointAtArc(road.points, middleArcMetres, fields.sizeMetres))
                });
              })
            ).slice(0, limit)
          )
        });
      case "grassland":
      case "flower-field": {
        const category = kind === "grassland" ? "grass" : "flower";
        return Object.freeze({
          kind,
          features: Object.freeze(
            plan.detailBrushOperations
              .filter((operation) => operation.distribution === "habitat-fill" && operation.category === category)
              .slice(0, limit)
              .map((operation) => Object.freeze({
                id: operation.id,
                distribution: operation.distribution,
                density: operation.targetDensityPerSquareMetre,
                seed: operation.seed
              }))
          )
        });
      }
      case "poi":
        return Object.freeze({
          kind,
          features: Object.freeze(
            plan.pois
              .slice(0, limit)
              .map((poi) => Object.freeze({ id: poi.id, poiKind: poi.kind, position: toPosition(poi.position) }))
          )
        });
    }
  }

  queryWorldObjects(input: Readonly<SeedWorldObjectQueryInput>): SeedWorldObjectQueryResult {
    const context = this._requireContext();
    const revision = this._options.readAuthoringSnapshot().activeRevision;
    const catalog = this._readObjectCatalog(context, revision);
    const kinds = new Set(input.kinds);
    const anchor = input.spatial ? resolveCatalogAnchor(context, catalog, input.spatial.anchor) : undefined;
    const maximumDistanceMetres = input.spatial?.maximumDistanceMetres ?? context.fields.sizeMetres;
    const maximumViewAngleDegrees = input.spatial?.maximumViewAngleDegrees ?? 45;
    const matches: Array<SeedWorldObject & { distanceMetres?: number; viewAngleDegrees?: number }> = [];
    for (const object of catalog.values()) {
      if (!kinds.has(object.objectKind)) continue;
      if (input.spatial?.anchor.kind === "object" && input.spatial.anchor.objectId === object.objectId) continue;
      let distanceMetres: number | undefined;
      let viewAngleDegrees: number | undefined;
      if (input.spatial && anchor) {
        distanceMetres = horizontalDistance(anchor.position, object.position);
        if (distanceMetres > maximumDistanceMetres) continue;
        if (input.spatial.anchor.kind === "viewer") {
          viewAngleDegrees = horizontalViewAngleDegrees(anchor.forward!, anchor.position, object.position);
        }
        if (input.spatial.relation === "in-front-of") {
          if (input.spatial.anchor.kind !== "viewer") {
            throw new Error("in-front-of 物体查询目前需要 viewer 锚点");
          }
          if (viewAngleDegrees! > maximumViewAngleDegrees) continue;
        }
      }
      matches.push(Object.freeze({ ...object, distanceMetres, viewAngleDegrees }));
    }
    matches.sort((left, right) => compareWorldObjects(left, right, input.orderBy));
    return Object.freeze({
      worldId: `seed-world-${context.plan.rootSeed}`,
      worldRevision: revision,
      inspectedObjectCount: catalog.size,
      objects: Object.freeze(matches.slice(0, input.limit))
    });
  }

  getWorldObject(objectId: string): SeedWorldObject {
    const context = this._requireContext();
    const revision = this._options.readAuthoringSnapshot().activeRevision;
    const object = this._readObjectCatalog(context, revision).get(objectId);
    if (!object) throw new Error(`World Object '${objectId}' does not exist in revision ${revision}`);
    return object;
  }

  resolveSpatialTarget(target: Readonly<SeedWorldSpatialTarget>): SeedWorldResolvedSpatialTarget {
    const context = this._requireContext();
    const revision = this._options.readAuthoringSnapshot().activeRevision;
    if (target.expectedWorldRevision !== undefined && target.expectedWorldRevision !== revision) {
      throw new Error(
        `Spatial target expected world revision ${target.expectedWorldRevision}, but current revision is ${revision}`
      );
    }
    const catalog = this._readObjectCatalog(context, revision);
    const anchor = resolveCatalogAnchor(context, catalog, target.anchor);
    let x = anchor.position[0];
    let z = anchor.position[2];
    let geometry: "point" | "area" = "point";
    let radiusMetres: number | undefined;
    switch (target.relation.kind) {
      case "at":
        break;
      case "around":
        geometry = "area";
        radiusMetres = target.relation.radiusMetres;
        break;
      case "in-front-of": {
        if (target.anchor.kind !== "viewer") throw new Error("in-front-of 解析目前需要 viewer 锚点");
        const forward = normalizeHorizontal(anchor.forward!);
        x += forward[0] * target.relation.distanceMetres;
        z += forward[1] * target.relation.distanceMetres;
        break;
      }
      case "near": {
        const direction = directionFromAnchorTowardViewer(context, anchor.position);
        x += direction[0] * target.relation.preferredDistanceMetres;
        z += direction[1] * target.relation.preferredDistanceMetres;
        break;
      }
      case "offset": {
        const forward =
          target.relation.frame === "viewer" ? normalizeHorizontal(viewerForward(context)) : ([0, -1] as const);
        const right = [-forward[1], forward[0]] as const;
        x += forward[0] * target.relation.forwardMetres + right[0] * target.relation.rightMetres;
        z += forward[1] * target.relation.forwardMetres + right[1] * target.relation.rightMetres;
        break;
      }
    }
    const surfaceHeight = this._options.sampleNavigationHeight(context.plan, context.fields, x, z);
    if (surfaceHeight === undefined) throw new RangeError("Spatial target resolves outside the Seed World boundary");
    return Object.freeze({
      geometry,
      position: Object.freeze([x, surfaceHeight, z] as const),
      radiusMetres,
      anchor: Object.freeze({
        kind: target.anchor.kind,
        object: target.anchor.kind === "object" ? objectRef(catalog.get(target.anchor.objectId)!) : undefined
      }),
      relation: Object.freeze(structuredClone(target.relation)),
      worldRevision: revision
    });
  }

  readTerrainPatchConstraints(): SeedWorldTerrainPatchConstraints {
    const fields = this._requireContext().fields;
    const heightSampleSpacingMetres = fields.sizeMetres / (fields.heightResolution - 1);
    return Object.freeze({
      heightSampleSpacingMetres,
      minimumRadiusMetres: heightSampleSpacingMetres * Math.SQRT2 * 2
    });
  }

  /**
   * Forwards an intent to the scene's mount module.
   * @param input - Requested mount behavior.
   * @param signal - Cancellation before dispatch.
   * @returns A receipt for the accepted command.
   */
  commandMount(
    input: Readonly<SeedWorldMountCommandInput>,
    signal: AbortSignal
  ): Promise<SeedWorldMountCommandResult> | SeedWorldMountCommandResult {
    signal.throwIfAborted();
    if (this._options.isDestroyed() || !this._options.commandMount) throw new Error("Mount system is unavailable");
    return this._options.commandMount(input, signal);
  }

  teleport(input: Readonly<{ x: number; z: number; heightOffset: number }>): unknown {
    const { plan, fields, cameraMode, camera, navigation, orbit } = this._requireContext();
    const surface = this._options.sampleNavigationHeight(plan, fields, input.x, input.z);
    if (surface === undefined) throw new RangeError("传送坐标位于 Seed World 边界之外");
    if (cameraMode === "orbit") {
      const cameraPosition = camera.entity.transform.worldPosition;
      const offset = new Vector3(
        cameraPosition.x - orbit.target.x,
        cameraPosition.y - orbit.target.y,
        cameraPosition.z - orbit.target.z
      );
      orbit.target.set(input.x, surface, input.z);
      camera.entity.transform.setWorldPosition(input.x + offset.x, surface + offset.y, input.z + offset.z);
      camera.entity.transform.lookAt(orbit.target);
      navigation.synchronizeView();
    } else {
      const forward = camera.entity.transform.worldForward.clone();
      const eyeY = surface + input.heightOffset;
      camera.entity.transform.setWorldPosition(input.x, eyeY, input.z);
      if (navigation.groundCollision && !navigation.locomotionOwner) {
        // Ground contact runs every frame: persist the requested clearance in
        // its owner instead of returning a camera height that lasts one frame.
        navigation.setVerticalOffset(0);
        navigation.setEyeHeight(input.heightOffset);
      }
      camera.entity.transform.lookAt(
        new Vector3(input.x + forward.x * 36, eyeY + forward.y * 36, input.z + forward.z * 36)
      );
      navigation.synchronizeView();
    }
    const position = camera.entity.transform.worldPosition;
    this._options.setStatus?.(`AI teleport (${Math.round(input.x)}, ${surface.toFixed(1)}, ${Math.round(input.z)})`);
    return Object.freeze({
      mode: cameraMode,
      requested: Object.freeze({ ...input }),
      navigationSurfaceHeight: surface,
      cameraPosition: Object.freeze([position.x, position.y, position.z] as const),
      orbitTarget: Object.freeze([orbit.target.x, orbit.target.y, orbit.target.z] as const)
    });
  }

  async updateEnvironment(input: Readonly<SeedWorldEnvironmentUpdateInput>, signal: AbortSignal): Promise<unknown> {
    const { environment, lighting } = this._requireContext();
    throwIfAborted(signal);
    if (input.waitForIbl) requireIblBaking(lighting);
    environment.setTransitionDuration(input.transitionDuration);
    applyEnvironmentChannels(environment, input);
    if (input.atmosphere?.skyColorRgb !== undefined) lighting.setSkyColor(input.atmosphere.skyColorRgb);

    const transitionController = new AbortController();
    const onAbort = () => transitionController.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) transitionController.abort();
    try {
      const transitions: Promise<void>[] = [];
      if (input.timeHours !== undefined) {
        // The shared transition includes target-cloud/IBL preparation. Do not start a shorter weather
        // timeout while the visible environment is deliberately held at A.
        await lighting.transitionTime(
          input.timeHours, input.transitionDuration, transitionController.signal, input.fromTimeHours
        );
      }
      if (input.weatherPreset !== undefined) {
        transitions.push(this._waitForEnvironmentTransition(environment, "weather", input.transitionDuration, transitionController.signal));
      } else {
        const channels = resolveEnvironmentChannels(input);
        if (channels.length > 0) {
          transitions.push(this._waitForWeatherChannels(environment, channels, input.transitionDuration, transitionController.signal));
        }
      }
      if (input.season !== undefined) {
        transitions.push(this._waitForEnvironmentTransition(environment, "season", input.transitionDuration, transitionController.signal));
      }
      await Promise.all(transitions);
      if (input.waitForIbl) await this._waitForIbl(lighting, signal);
      throwIfAborted(signal);
      return Object.freeze({ requested: freezeJsonObject(input), state: this.readWorldState() });
    } finally {
      transitionController.abort();
      signal.removeEventListener("abort", onAbort);
    }
  }

  mutateWorldResource(input: Readonly<SeedWorldResourceMutation>, signal: AbortSignal): Promise<unknown> | unknown {
    this._requireContext();
    throwIfAborted(signal);
    return this._options.mutateWorldResource(input, signal);
  }

  mutateWorldResources(
    inputs: readonly Readonly<SeedWorldResourceMutation>[],
    signal: AbortSignal
  ): Promise<unknown> | unknown {
    this._requireContext();
    throwIfAborted(signal);
    return this._options.mutateWorldResources(inputs, signal);
  }

  private _readObjectCatalog(context: SeedWorldRuntimeContext, revision: number): ReadonlyMap<string, SeedWorldObject> {
    const appearanceRevision = context.world.population.treeAppearanceRevision ?? 0;
    if (this._catalogWorld !== context.world || this._catalogRevision !== revision || this._catalogTreeAppearanceRevision !== appearanceRevision) {
      const authoring = this._options.readAuthoringSnapshot();
      const removedObjectIds = new Set(authoring.removedObjectIds);
      const authoredVegetationFeatureIds = new Set(
        authoring.resources
          .filter(({ resourceType }) => resourceType === "vegetation-brush")
          .map(({ resourceId }) => resourceId)
      );
      const catalog = new Map(buildWorldObjectCatalog(context, revision, removedObjectIds, authoredVegetationFeatureIds));
      for (const object of this._options.readAdditionalObjects?.(revision) ?? [])
        if (!removedObjectIds.has(object.objectId)) addCatalogObject(catalog, object);
      this._catalog = catalog;
      this._catalogWorld = context.world;
      this._catalogRevision = revision;
      this._catalogTreeAppearanceRevision = appearanceRevision;
    }
    return this._catalog;
  }

  private _requireContext(): SeedWorldRuntimeContext {
    const context = this._options.readContext();
    if (!context) throw new Error("Seed World 3D runtime is not ready");
    return context;
  }

  private async _waitForEnvironmentTransition(
    environment: WorldEnvironmentRuntime,
    target: "weather" | "season",
    transitionDuration: number,
    signal: AbortSignal
  ): Promise<void> {
    const deadline = performance.now() + transitionDuration * 1_000 + ENVIRONMENT_TRANSITION_GRACE_MILLISECONDS;
    while (true) {
      throwIfAborted(signal);
      if (this._options.isDestroyed()) throw new Error("Seed World runtime was destroyed");
      const snapshot = environment.getSnapshot();
      const complete =
        target === "season"
          ? snapshot.season.transitionProgress >= 1
          : Object.values(snapshot.transitionProgress).every((progress) => progress >= 1);
      if (complete) return;
      await waitForAnimationFrame(signal, deadline, "等待 Seed World 环境过渡超时");
    }
  }

  private async _waitForWeatherChannels(
    environment: WorldEnvironmentRuntime,
    channels: readonly ("skyLighting" | "cloud" | "precipitation" | "wind" | "lightning")[],
    transitionDuration: number,
    signal: AbortSignal
  ): Promise<void> {
    const deadline = performance.now() + transitionDuration * 1_000 + ENVIRONMENT_TRANSITION_GRACE_MILLISECONDS;
    while (true) {
      throwIfAborted(signal);
      if (this._options.isDestroyed()) throw new Error("Seed World runtime was destroyed");
      const progress = environment.getSnapshot().transitionProgress;
      if (channels.every((channel) => progress[channel] >= 1)) return;
      await waitForAnimationFrame(signal, deadline, "等待 Seed World 环境通道过渡超时");
    }
  }

  private async _waitForIbl(lighting: TerrainLightingRuntime, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    let snapshot = lighting.getSnapshot();
    requireIblBaking(lighting);
    const barrierRevision = captureTerrainIBLRevisionBarrier(snapshot.iblBake);
    const deadline = performance.now() + IBL_WAIT_TIMEOUT_MILLISECONDS;
    while (!hasPublishedTerrainIBLRevision(snapshot.iblBake, barrierRevision)) {
      await waitForAnimationFrame(signal, deadline, "等待 Seed World IBL 发布超时");
      snapshot = lighting.getSnapshot();
      if (!snapshot.iblBakingEnabled) throw new Error("等待环境光照期间 Realtime IBL 烘焙被暂停");
    }
  }
}

function canonicalSemanticNumber(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function roadPointAtArc(
  points: readonly SeedWorldPoint[],
  targetArcMetres: number,
  sizeMetres: number
): SeedWorldPoint {
  if (points.length === 0) throw new Error("Road has no points");
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const length = Math.hypot(current.x - previous.x, current.y - previous.y) * sizeMetres;
    if (traversed + length >= targetArcMetres) {
      const t = length <= 1e-6 ? 0 : (targetArcMetres - traversed) / length;
      return Object.freeze({ x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t });
    }
    traversed += length;
  }
  return points.at(-1)!;
}

type CatalogObjectWithMetrics = SeedWorldObject & {
  readonly distanceMetres?: number;
  readonly viewAngleDegrees?: number;
};

type CatalogAnchor = Readonly<{
  position: readonly [number, number, number];
  forward?: readonly [number, number, number];
}>;

/** Public occupancy is the current world-space envelope, not the producer's original placement dimensions. */
function treeQueryFootprint(bounds: { minimum: readonly number[]; maximum: readonly number[] }): readonly [number, number] {
  return Object.freeze([bounds.maximum[0] - bounds.minimum[0], bounds.maximum[2] - bounds.minimum[2]]);
}

function buildWorldObjectCatalog(
  context: SeedWorldRuntimeContext,
  worldRevision: number,
  removedObjectIds: ReadonlySet<string>,
  authoredVegetationFeatureIds: ReadonlySet<string>
): ReadonlyMap<string, SeedWorldObject> {
  const objects = new Map<string, SeedWorldObject>();
  const worldId = `seed-world-${context.plan.rootSeed}`;
  for (const instance of context.world.population.getExactPopulationInstances()) {
    if (removedObjectIds.has(instance.id)) continue;
    if (instance.category !== "tree" && instance.category !== "shrub") continue;
    const x = instance.normalizedPosition.x * context.fields.sizeMetres + seedWorldOriginX(context.fields);
    const z = instance.normalizedPosition.y * context.fields.sizeMetres + seedWorldOriginZ(context.fields);
    const y = sampleSeedWorldHeight(context.fields, x, z);
    if (y === undefined) continue;
    const authoringOwnerId = instance.authoringBrushId && authoredVegetationFeatureIds.has(instance.authoringBrushId)
      ? instance.authoringBrushId : undefined;
    const tree = instance.category === "tree" ? context.world.population.readProceduralTreeInstance?.(instance, [x, y, z]) : undefined;
    addCatalogObject(
      objects,
      Object.freeze({
        worldId,
        objectId: instance.id,
        objectKind: instance.category,
        worldRevision,
        position: tree?.position ?? Object.freeze([x, y, z] as const),
        footprintMetres: tree ? treeQueryFootprint(tree.bounds) : Object.freeze([...instance.footprintMetres] as [number, number]),
        source: authoringOwnerId
          ? Object.freeze({ kind: "authoring" as const, sourceId: authoringOwnerId })
          : Object.freeze({ kind: "population" as const, sourceId: instance.sourceCellId }),
        properties: Object.freeze({
          prototypeFamily: instance.prototypeFamily,
          assetRecipeId: instance.assetRecipeId,
          treeSpeciesProfileKey: instance.treeSpeciesProfileKey,
          treeCohortProfileKey: instance.treeCohortProfileKey,
          yawRadians: tree?.yawRadians ?? instance.yawRadians,
          scale: tree?.scale ?? Object.freeze([...instance.scale]),
          ...(tree ? { treeShape: tree.treeShape, treeRecipeId: tree.recipeId, treeRecipeLabel: tree.recipeLabel, treeEffectIndex: tree.effectIndex, bounds: tree.bounds } : {})
        })
      })
    );
  }
  for (const entry of context.world.exactPrefabs.exactInstances) {
    if (removedObjectIds.has(entry.id)) continue;
    const objectKind = exactEntryObjectKind(entry.category);
    if (!objectKind) continue;
    const minimum = entry.bounds.min;
    const maximum = entry.bounds.max;
    addCatalogObject(
      objects,
      Object.freeze({
        worldId,
        objectId: entry.id,
        objectKind,
        worldRevision,
        position: Object.freeze([
          (minimum.x + maximum.x) * 0.5,
          (minimum.y + maximum.y) * 0.5,
          (minimum.z + maximum.z) * 0.5
        ] as const),
        footprintMetres: Object.freeze([
          Math.max(0.01, maximum.x - minimum.x),
          Math.max(0.01, maximum.z - minimum.z)
        ] as const),
        source: Object.freeze({ kind: "decoration" as const, sourceId: entry.category }),
        properties: Object.freeze({
          bounds: Object.freeze({
            minimum: Object.freeze([minimum.x, minimum.y, minimum.z] as const),
            maximum: Object.freeze([maximum.x, maximum.y, maximum.z] as const)
          })
        })
      })
    );
  }
  return objects;
}

function addCatalogObject(objects: Map<string, SeedWorldObject>, object: SeedWorldObject): void {
  if (objects.has(object.objectId)) throw new Error(`Duplicate WorldObjectId '${object.objectId}'`);
  objects.set(object.objectId, object);
}

function exactEntryObjectKind(category: string): SeedWorldObjectKind | undefined {
  switch (category) {
    case "rock":
    case "small-rock":
    case "mushroom":
    case "lotus":
      return category;
    default:
      return undefined;
  }
}

function resolveCatalogAnchor(
  context: SeedWorldRuntimeContext,
  catalog: ReadonlyMap<string, SeedWorldObject>,
  anchor: SeedWorldSpatialAnchor
): CatalogAnchor {
  switch (anchor.kind) {
    case "viewer": {
      const position = context.camera.entity.transform.worldPosition;
      const forward = context.camera.entity.transform.worldForward;
      return Object.freeze({
        position: Object.freeze([position.x, position.y, position.z] as const),
        forward: Object.freeze([forward.x, forward.y, forward.z] as const)
      });
    }
    case "object": {
      const object = catalog.get(anchor.objectId);
      if (!object) throw new Error(`World Object '${anchor.objectId}' does not exist in the current revision`);
      return Object.freeze({ position: object.position });
    }
    case "position": {
      const y = sampleSeedWorldHeight(context.fields, anchor.x, anchor.z);
      if (y === undefined) throw new RangeError("Spatial anchor lies outside the Seed World boundary");
      return Object.freeze({ position: Object.freeze([anchor.x, y, anchor.z] as const) });
    }
  }
}

function objectRef(object: SeedWorldObject) {
  return Object.freeze({
    worldId: object.worldId,
    objectId: object.objectId,
    objectKind: object.objectKind,
    worldRevision: object.worldRevision
  });
}

function viewerForward(context: SeedWorldRuntimeContext): readonly [number, number, number] {
  const forward = context.camera.entity.transform.worldForward;
  return [forward.x, forward.y, forward.z];
}

function directionFromAnchorTowardViewer(
  context: SeedWorldRuntimeContext,
  anchorPosition: readonly [number, number, number]
): readonly [number, number] {
  const viewer = context.camera.entity.transform.worldPosition;
  const dx = viewer.x - anchorPosition[0];
  const dz = viewer.z - anchorPosition[2];
  const length = Math.hypot(dx, dz);
  return length > 1e-6 ? [dx / length, dz / length] : normalizeHorizontal(viewerForward(context));
}

function normalizeHorizontal(direction: readonly [number, number, number]): readonly [number, number] {
  const length = Math.hypot(direction[0], direction[2]);
  if (length <= 1e-6) throw new Error("Viewer forward direction has no horizontal component");
  return [direction[0] / length, direction[2] / length];
}

function horizontalDistance(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

function horizontalViewAngleDegrees(
  forward3d: readonly [number, number, number],
  origin: readonly [number, number, number],
  target: readonly [number, number, number]
): number {
  const forward = normalizeHorizontal(forward3d);
  const dx = target[0] - origin[0];
  const dz = target[2] - origin[2];
  const length = Math.hypot(dx, dz);
  if (length <= 1e-6) return 0;
  const dot = Math.max(-1, Math.min(1, forward[0] * (dx / length) + forward[1] * (dz / length)));
  return (Math.acos(dot) * 180) / Math.PI;
}

function compareWorldObjects(
  left: CatalogObjectWithMetrics,
  right: CatalogObjectWithMetrics,
  orderBy: readonly Readonly<{ field: SeedWorldObjectOrderField; direction: "asc" | "desc" }>[]
): number {
  for (const order of orderBy) {
    const leftValue = worldObjectOrderValue(left, order.field);
    const rightValue = worldObjectOrderValue(right, order.field);
    if (leftValue === rightValue) continue;
    return (leftValue - rightValue) * (order.direction === "asc" ? 1 : -1);
  }
  return left.objectId.localeCompare(right.objectId);
}

function worldObjectOrderValue(object: CatalogObjectWithMetrics, field: SeedWorldObjectOrderField): number {
  switch (field) {
    case "distance":
      return object.distanceMetres ?? Number.POSITIVE_INFINITY;
    case "viewAngle":
      return object.viewAngleDegrees ?? Number.POSITIVE_INFINITY;
    case "elevation":
      return object.position[1];
  }
}

type SearchablePoint = Readonly<{
  x: number;
  z: number;
  position: readonly [number, number, number];
  elevation: number;
  slope: number;
  curvature: number;
  flow: number;
  moisture: number;
  landCover: "grassland" | "forest" | "wetland";
  wetlandWeight: number;
  water: boolean;
  riverDistanceMetres: number;
  roadDistanceMetres: number;
  distanceMetres?: number;
}>;

function searchWorldPoints(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  water: Pick<SeedWorldRuntimeWater, "queryAuthoredSurface" | "querySurface"> | undefined,
  input: Extract<SeedWorldPointQueryInput, { mode: "search" }>
): unknown {
  const elevationOnly =
    input.nearestTo === undefined &&
    input.orderBy[0]?.field === "elevation" &&
    Object.keys(input.where).every((key) => key === "minimumElevation" || key === "maximumElevation");
  if (elevationOnly) return searchExactElevationPoints(plan, fields, water, input);

  // Keep a general semantic query bounded on the main thread. The returned spacing
  // makes the resolution explicit instead of pretending a sampled query was exact.
  const effectiveSpacingMetres = Math.max(input.spacingMetres, fields.sizeMetres / 255);
  const originX = seedWorldOriginX(fields), originZ = seedWorldOriginZ(fields);
  const points: SearchablePoint[] = [];
  for (let z = originZ; z <= originZ + fields.sizeMetres; z += effectiveSpacingMetres) {
    for (let x = originX; x <= originX + fields.sizeMetres; x += effectiveSpacingMetres) {
      const point = sampleSearchablePoint(plan, fields, water, x, z, input.nearestTo);
      if (point && matchesPointFilter(point, input.where)) points.push(point);
    }
  }
  points.sort((left, right) => comparePoints(left, right, input.orderBy));
  return Object.freeze({
    mode: "search",
    strategy: "bounded-semantic-grid",
    requestedSpacingMetres: input.spacingMetres,
    effectiveSpacingMetres,
    matchedPointCount: points.length,
    points: Object.freeze(points.slice(0, input.limit))
  });
}

function searchExactElevationPoints(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  water: Pick<SeedWorldRuntimeWater, "queryAuthoredSurface" | "querySurface"> | undefined,
  input: Extract<SeedWorldPointQueryInput, { mode: "search" }>
): unknown {
  const direction = input.orderBy[0]!.direction;
  const candidates: Array<{ index: number; encodedHeight: number }> = [];
  const minimumEncoded = encodeHeightBound(fields, input.where.minimumElevation, Number.NEGATIVE_INFINITY);
  const maximumEncoded = encodeHeightBound(fields, input.where.maximumElevation, Number.POSITIVE_INFINITY);
  for (let index = 0; index < fields.heightSamples.length; index++) {
    const encodedHeight = fields.heightSamples[index]!;
    if (encodedHeight < minimumEncoded || encodedHeight > maximumEncoded) continue;
    pushBoundedElevationCandidate(candidates, { index, encodedHeight }, input.limit, direction);
  }
  candidates.sort((left, right) =>
    direction === "desc" ? right.encodedHeight - left.encodedHeight : left.encodedHeight - right.encodedHeight
  );
  const denominator = fields.heightResolution - 1;
  const points = candidates.map(({ index }) => {
    const xIndex = index % fields.heightResolution;
    const zIndex = Math.floor(index / fields.heightResolution);
    const x = (xIndex / denominator) * fields.sizeMetres + seedWorldOriginX(fields);
    const z = (zIndex / denominator) * fields.sizeMetres + seedWorldOriginZ(fields);
    // Exact elevation search keeps terrain position/elevation and ordering.
    // Its water classification still comes from the same published query.
    const point = sampleSearchablePoint(plan, fields, undefined, x, z)!;
    return Object.freeze({ ...point, water: sampleRuntimeWater(water, point.water, x, z).water });
  });
  return Object.freeze({
    mode: "search",
    strategy: "authoritative-height-lattice",
    inspectedPointCount: fields.heightSamples.length,
    effectiveSpacingMetres: fields.sizeMetres / denominator,
    matchedPointCount: candidates.length,
    points: Object.freeze(points)
  });
}

function pushBoundedElevationCandidate(
  candidates: Array<{ index: number; encodedHeight: number }>,
  candidate: { index: number; encodedHeight: number },
  limit: number,
  direction: "asc" | "desc"
): void {
  if (candidates.length < limit) {
    candidates.push(candidate);
    siftElevationCandidateUp(candidates, candidates.length - 1, direction);
    return;
  }
  const worst = candidates[0]!.encodedHeight;
  const better = direction === "desc" ? candidate.encodedHeight > worst : candidate.encodedHeight < worst;
  if (!better) return;
  candidates[0] = candidate;
  siftElevationCandidateDown(candidates, 0, direction);
}

function siftElevationCandidateUp(
  candidates: Array<{ index: number; encodedHeight: number }>,
  start: number,
  direction: "asc" | "desc"
): void {
  let index = start;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!isWorseElevationCandidate(candidates[index]!, candidates[parent]!, direction)) return;
    [candidates[index], candidates[parent]] = [candidates[parent]!, candidates[index]!];
    index = parent;
  }
}

function siftElevationCandidateDown(
  candidates: Array<{ index: number; encodedHeight: number }>,
  start: number,
  direction: "asc" | "desc"
): void {
  let index = start;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let worst = index;
    if (left < candidates.length && isWorseElevationCandidate(candidates[left]!, candidates[worst]!, direction)) {
      worst = left;
    }
    if (right < candidates.length && isWorseElevationCandidate(candidates[right]!, candidates[worst]!, direction)) {
      worst = right;
    }
    if (worst === index) return;
    [candidates[index], candidates[worst]] = [candidates[worst]!, candidates[index]!];
    index = worst;
  }
}

function isWorseElevationCandidate(
  left: { encodedHeight: number },
  right: { encodedHeight: number },
  direction: "asc" | "desc"
): boolean {
  return direction === "desc" ? left.encodedHeight < right.encodedHeight : left.encodedHeight > right.encodedHeight;
}

function encodeHeightBound(fields: SeedWorldFields, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const offset = fields.heightDecode?.offset ?? SEED_WORLD_HEIGHT_RANGE.minimum;
  const scale = fields.heightDecode?.scale ?? (SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum);
  const normalized = (value - offset) / scale;
  return Math.round(normalized * 0xffff);
}

/** Shared selection for point sampling and semantic search, preserving legacy hosts. */
function sampleRuntimeWater(
  runtime: Pick<SeedWorldRuntimeWater, "queryAuthoredSurface" | "querySurface"> | undefined,
  populationWater: boolean,
  x: number,
  z: number
) {
  if (runtime?.querySurface) {
    const surface = runtime.querySurface(x, z);
    return { surface, water: surface.water };
  }
  const surface = runtime?.queryAuthoredSurface(x, z);
  return { surface, water: populationWater || surface?.water === true };
}

function sampleSearchablePoint(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  waterRuntime: Pick<SeedWorldRuntimeWater, "queryAuthoredSurface" | "querySurface"> | undefined,
  x: number,
  z: number,
  nearestTo?: Readonly<{ x: number; z: number }>
): SearchablePoint | undefined {
  const population = sampleSeedWorldPopulation(plan, fields, x, z);
  if (!population) return undefined;
  const waterSample = sampleRuntimeWater(waterRuntime, population.water, x, z);
  const authoredWater = waterSample.surface;
  const elevation = authoredWater?.surfaceElevationMetres ?? population.height;
  return Object.freeze({
    x,
    z,
    position: Object.freeze([x, elevation, z] as const),
    elevation,
    slope: population.slope,
    curvature: population.curvature,
    flow: population.flow,
    moisture: population.moisture,
    landCover: landCoverName(population.landCover),
    wetlandWeight: population.wetlandWeight,
    water: waterSample.water,
    riverDistanceMetres: Math.min(
      population.riverDistanceMetres,
      authoredWater?.nearestRiverDistanceMetres ?? Number.POSITIVE_INFINITY
    ),
    roadDistanceMetres: population.roadDistanceMetres,
    distanceMetres: nearestTo ? Math.hypot(x - nearestTo.x, z - nearestTo.z) : undefined
  });
}

function matchesPointFilter(point: SearchablePoint, filter: Readonly<SeedWorldPointQueryFilter>): boolean {
  return !(
    (filter.minimumElevation !== undefined && point.elevation < filter.minimumElevation) ||
    (filter.maximumElevation !== undefined && point.elevation > filter.maximumElevation) ||
    (filter.minimumSlope !== undefined && point.slope < filter.minimumSlope) ||
    (filter.maximumSlope !== undefined && point.slope > filter.maximumSlope) ||
    (filter.minimumMoisture !== undefined && point.moisture < filter.minimumMoisture) ||
    (filter.maximumMoisture !== undefined && point.moisture > filter.maximumMoisture) ||
    (filter.maximumRiverDistance !== undefined && point.riverDistanceMetres > filter.maximumRiverDistance) ||
    (filter.maximumRoadDistance !== undefined && point.roadDistanceMetres > filter.maximumRoadDistance) ||
    (filter.landCover !== undefined && !filter.landCover.includes(point.landCover)) ||
    (filter.water !== undefined && point.water !== filter.water)
  );
}

function comparePoints(
  left: SearchablePoint,
  right: SearchablePoint,
  orderBy: readonly Readonly<{ field: SeedWorldPointOrderField; direction: "asc" | "desc" }>[]
): number {
  for (const order of orderBy) {
    const leftValue = pointOrderValue(left, order.field);
    const rightValue = pointOrderValue(right, order.field);
    if (leftValue === rightValue) continue;
    return (leftValue - rightValue) * (order.direction === "asc" ? 1 : -1);
  }
  return left.x - right.x || left.z - right.z;
}

function pointOrderValue(point: SearchablePoint, field: SeedWorldPointOrderField): number {
  switch (field) {
    case "elevation":
      return point.elevation;
    case "slope":
      return point.slope;
    case "moisture":
      return point.moisture;
    case "riverDistance":
      return point.riverDistanceMetres;
    case "roadDistance":
      return point.roadDistanceMetres;
    case "distance":
      return point.distanceMetres ?? Number.POSITIVE_INFINITY;
  }
}

type EnvironmentChannel = "skyLighting" | "cloud" | "precipitation" | "wind" | "lightning";

function resolveEnvironmentChannels(input: Readonly<SeedWorldEnvironmentUpdateInput>): EnvironmentChannel[] {
  const channels: EnvironmentChannel[] = Object.keys(input.weatherChannels ?? {}) as EnvironmentChannel[];
  if (input.wind) channels.push("wind");
  if (input.season !== undefined || input.precipitation) channels.push("precipitation");
  if (input.season !== undefined || input.atmosphere?.cloudiness !== undefined) channels.push("cloud");
  if (input.season !== undefined || input.atmosphere?.fogIntensity !== undefined) channels.push("skyLighting");
  if (input.lightning) channels.push("lightning");
  return channels;
}

type WeatherEditTarget = Pick<WorldEnvironmentRuntime,
  "setSeason" | "setWeatherState" | "setWind" | "setCloud" | "setSkyLighting" | "setPrecipitation" | "setLightning"> & {
  getSnapshot(): { weather: WeatherState; wind: { baseSpeedMps: number; baseDirection: readonly [number, number, number] } };
};

function applyEnvironmentChannels(environment: WeatherEditTarget, input: Readonly<SeedWorldEnvironmentUpdateInput>): void {
  const preset = input.weatherPreset === undefined ? undefined : resolveSeedWorldWeatherPreset(input.weatherPreset);
  const seasonDefaults = input.season === undefined ? undefined : TERRAIN_SEASON_DEFAULT_COMPOSITIONS[input.season];
  if (input.season !== undefined) environment.setSeason(input.season);
  // Explicit weather is more specific than the season's default composition.
  if (preset) environment.setWeatherState(preset);
  if (input.wind) applyWind(environment, input.wind, preset?.wind);
  if (input.precipitation) {
    applyPrecipitation(
      environment,
      input.precipitation,
      preset?.precipitation ?? (seasonDefaults && WeatherPresets.precipitation[seasonDefaults.precipitation])
    );
  }
  if (input.atmosphere) {
    applyAtmosphere(
      environment,
      input.atmosphere,
      preset?.cloud ?? (seasonDefaults && WeatherPresets.cloud[seasonDefaults.cloud]),
      preset?.skyLighting ?? (seasonDefaults && WeatherPresets.skyLighting[seasonDefaults.skyLighting])
    );
  }
  if (input.lightning) applyLightning(environment, input.lightning, preset?.lightning);
  const exact = input.weatherChannels;
  if (exact?.cloud) environment.setCloud(exact.cloud);
  if (exact?.skyLighting) environment.setSkyLighting(exact.skyLighting);
  if (exact?.precipitation) environment.setPrecipitation(exact.precipitation);
  if (exact?.wind) environment.setWind(exact.wind);
  if (exact?.lightning) environment.setLightning(exact.lightning);
}

/** Clockwise heading of the direction the wind blows TOWARD: -Z=0, +X=90. */
function windHeading(direction: readonly number[]): number {
  return wrapWindHeading(Math.atan2(direction[0]!, -direction[2]!) * 180 / Math.PI);
}
function wrapWindHeading(degrees: number): number {
  const result = ((degrees + 180) % 360 + 360) % 360 - 180;
  return Object.is(result, -0) ? 0 : result;
}

function applyWind(
  environment: WeatherEditTarget,
  input: SeedWorldWindInput,
  preset?: Readonly<WeatherWindState>
): void {
  const snapshot = environment.getSnapshot();
  const fallback = preset ?? snapshot.weather.wind;
  const baseSpeedMetresPerSecond = snapshot.wind.baseSpeedMps;
  let forceMultiplier = fallback.forceMultiplier;
  if (input.speedMetresPerSecond !== undefined) {
    if (baseSpeedMetresPerSecond <= Number.EPSILON && input.speedMetresPerSecond > 0) {
      throw new Error("Seed World physical wind baseline is zero; a positive wind speed cannot be applied");
    }
    forceMultiplier = baseSpeedMetresPerSecond <= Number.EPSILON
      ? 0
      : input.speedMetresPerSecond / baseSpeedMetresPerSecond;
  }
  environment.setWind({
    forceMultiplier,
    directionOffsetDegrees: input.directionDegrees === undefined ? fallback.directionOffsetDegrees
      : wrapWindHeading(windHeading(snapshot.wind.baseDirection) - input.directionDegrees),
    gustStrength: input.gustiness === undefined ? fallback.gustStrength : input.gustiness * 0.6,
    turbulence: input.turbulence ?? fallback.turbulence
  });
}

function applyPrecipitation(
  environment: WeatherEditTarget,
  input: SeedWorldPrecipitationInput,
  preset?: Readonly<WeatherPrecipitationState>
): void {
  const fallback = preset ?? environment.getSnapshot().weather.precipitation;
  const rainIntensity = input.rainIntensity ?? fallback.rainRate;
  const snowIntensity = input.snowIntensity ?? fallback.snowRate;
  const snowDominant = snowIntensity > rainIntensity;
  environment.setPrecipitation({
    rainRate: rainIntensity,
    snowRate: snowIntensity,
    temperatureCelsius: snowDominant ? -5 : rainIntensity > 0 ? 11 : fallback.temperatureCelsius,
    relativeHumidity: Math.max(0.38, rainIntensity, snowIntensity, fallback.relativeHumidity)
  });
}

function applyAtmosphere(
  environment: WeatherEditTarget,
  input: SeedWorldAtmosphereInput,
  presetCloud?: Readonly<WeatherCloudState>,
  presetSkyLighting?: Readonly<WeatherSkyLightingState>
): void {
  if (input.cloudiness === undefined && input.fogIntensity === undefined) return;
  const snapshot = environment.getSnapshot().weather;
  if (input.cloudiness !== undefined) {
    environment.setCloud({
      ...(presetCloud ?? snapshot.cloud),
      cloudCoverage: input.cloudiness,
      cloudDensityMultiplier: 0.8 + input.cloudiness * 0.6,
      cloudTransmittance: 1 - input.cloudiness * 0.85,
      skyOcclusion: input.cloudiness * 0.9
    });
  }
  if (input.fogIntensity !== undefined) {
    environment.setSkyLighting({
      ...(presetSkyLighting ?? snapshot.skyLighting),
      fogDensityMultiplier: 1 + input.fogIntensity * 7
    });
  }
}

function applyLightning(
  environment: WeatherEditTarget,
  input: SeedWorldLightningInput,
  preset?: Readonly<WeatherLightningState>
): void {
  const fallback = preset ?? environment.getSnapshot().weather.lightning;
  environment.setLightning({
    frequency: input.frequency ?? fallback.frequency,
    strength: input.intensity === undefined ? fallback.strength : input.intensity * 4
  });
}

export function resolveSeedWorldWeatherPreset(preset: SeedWorldWeatherPreset) {
  switch (preset) {
    case "cloudy":
      return {
        skyLighting: WeatherPresets.skyLighting.overcast,
        cloud: WeatherPresets.cloud.overcast,
        precipitation: WeatherPresets.precipitation.none,
        wind: WeatherPresets.wind.breeze,
        lightning: WeatherPresets.lightning.none
      };
    case "rain":
      return {
        skyLighting: WeatherPresets.skyLighting.overcast,
        cloud: WeatherPresets.cloud.overcast,
        precipitation: WeatherPresets.precipitation.rain,
        wind: WeatherPresets.wind.windy,
        lightning: WeatherPresets.lightning.none
      };
    case "storm":
      return {
        skyLighting: WeatherPresets.skyLighting.storm,
        cloud: WeatherPresets.cloud.dense,
        precipitation: WeatherPresets.precipitation.heavyRain,
        wind: WeatherPresets.wind.gale,
        lightning: WeatherPresets.lightning.thunderstorm
      };
    case "snow":
      return {
        skyLighting: WeatherPresets.skyLighting.overcast,
        cloud: WeatherPresets.cloud.overcast,
        precipitation: WeatherPresets.precipitation.snow,
        wind: WeatherPresets.wind.breeze,
        lightning: WeatherPresets.lightning.none
      };
    case "fog":
      return {
        skyLighting: WeatherPresets.skyLighting.fog,
        cloud: WeatherPresets.cloud.scattered,
        precipitation: WeatherPresets.precipitation.none,
        wind: WeatherPresets.wind.calm,
        lightning: WeatherPresets.lightning.none
      };
    default:
      return {
        skyLighting: WeatherPresets.skyLighting.clear,
        cloud: WeatherPresets.cloud.clear,
        precipitation: WeatherPresets.precipitation.none,
        wind: WeatherPresets.wind.breeze,
        lightning: WeatherPresets.lightning.none
      };
  }
}

function pointToWorld(
  point: SeedWorldPoint,
  sizeMetres: number,
  fields: SeedWorldFields
): readonly [number, number, number] {
  const x = point.x * sizeMetres + seedWorldOriginX(fields);
  const z = point.y * sizeMetres + seedWorldOriginZ(fields);
  return Object.freeze([x, sampleSeedWorldHeight(fields, x, z) ?? 0, z]);
}

function riverSurfacePosition(
  point: Readonly<{ x: number; y: number; bedElevationMetres: number; depthMetres: number }>,
  fields: SeedWorldFields
): readonly [number, number, number] {
  return Object.freeze([
    point.x * fields.sizeMetres + seedWorldOriginX(fields),
    point.bedElevationMetres + point.depthMetres,
    point.y * fields.sizeMetres + seedWorldOriginZ(fields)
  ] as const);
}

function landCoverName(value: SeedWorldLandCover): "grassland" | "forest" | "wetland" {
  switch (value) {
    case SeedWorldLandCover.Forest:
      return "forest";
    case SeedWorldLandCover.Wetland:
      return "wetland";
    default:
      return "grassland";
  }
}

function maximumOf<T>(values: readonly T[], select: (value: T) => number): number {
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) maximum = Math.max(maximum, select(value));
  return Number.isFinite(maximum) ? maximum : 0;
}

function maximumItem<T>(values: readonly T[], select: (value: T) => number): T | undefined {
  let result: T | undefined;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const score = select(value);
    if (score <= maximum) continue;
    result = value;
    maximum = score;
  }
  return result;
}

function requireIblBaking(lighting: TerrainLightingRuntime): void {
  if (!lighting.getSnapshot().iblBakingEnabled) {
    throw new Error("Realtime IBL 烘焙已暂停，无法等待新的环境光照发布");
  }
}

function waitForAnimationFrame(signal: AbortSignal, deadline: number, timeoutMessage: string): Promise<void> {
  throwIfAborted(signal);
  const remaining = deadline - performance.now();
  if (remaining <= 0) return Promise.reject(new Error(timeoutMessage));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(createAbortError()));
    const frameId = requestAnimationFrame(() => finish(resolve));
    const timeoutId = setTimeout(() => finish(() => reject(new Error(timeoutMessage))), remaining);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw createAbortError();
}

function createAbortError(): DOMException {
  return new DOMException("Agent task cancelled", "AbortError");
}

function freezeJsonObject(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.freeze(JSON.parse(JSON.stringify(value)) as Record<string, unknown>);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
