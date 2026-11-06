import { WaterMutationRollbackError } from "./WaterMutationFailure";
/**
 * Transactional resource-to-runtime activation.
 *
 * This module intentionally contains no water algorithms and creates no meshes,
 * materials, queries, or spatial fields itself.
 */
import type { WaterBodyAsset } from "../../authoring/body/WaterBodyAsset";
import type { ResolvedWaterBodyInstance } from "../../authoring/body/ResolvedWaterBodyInstance";
import {
  createWaterBodyInstance,
  WATER_BODY_INSTANCE_SCHEMA_VERSION,
  type WaterBodyInstance,
  type WaterInteractionRequestV1,
  type WaterPlanarTransformV1
} from "../../authoring/body/WaterBodyInstance";
import {
  WaterBodySourceKind,
  type WaterBodyRuntimeVariant,
  type WaterBodySourceV1
} from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterBodyDiagnostic } from "../../authoring/body/WaterBodySchemaDecoder";
import type { WaterCompiledResource, WaterCompiledResourceReadPort } from "../../compiler/body/WaterCompiledResource";
import { createWaterCompiledDataSnapshot } from "../../compiler/body/WaterCompiledResource";
import type { WaterResourceMemoryMetrics } from "../resources/WaterResourceMetrics";
import type {
  CameraWaterFeatureBroker,
  WaterCameraFeatureRequest,
  WaterCameraFeatureRequestLease
} from "../optics/CameraWaterFeatureBroker";
import type {
  WaterReflectionBindingLifecycle,
  WaterReflectionCameraOwnership,
  WaterReflectionCameraOwnershipState
} from "../optics/WaterReflectionBindingLifecycle";
import type {
  WaterBackendDevelopmentContext,
  WaterBackendReflectionContext,
  WaterBackendRuntime,
  WaterCameraVisibilityProvider,
  WaterTerrainOcclusionProvider,
  WaterBackendUpdateField,
  WaterBackendUpdateMode,
  WaterBodyBackend
} from "./WaterBackendRegistry";
import { WaterBackendRegistry } from "./WaterBackendRegistry";
import { WaterBodyAssetRegistry } from "./WaterBodyAssetRegistry";
import { WaterBodyProviderRegistry } from "./WaterBodyProviderRegistry";
import type { WaterBodyRuntime } from "./WaterBodyRuntime";
import { createWaterRuntimeInterfacesView, type WaterRuntimeInterfaces } from "./WaterRuntimeInterfaces";
import { createImmutableWaterSnapshot } from "../../authoring/identity/WaterImmutableSnapshot";
import { createWaterRevision, nextWaterRevision } from "../../authoring/identity/WaterIdentity";
import type { WaterLookAuthoringPort } from "../state/WaterLookAuthoringPort";
import {
  DEFAULT_WATER_ENVIRONMENT_SNAPSHOT,
  type WaterEnvironmentSnapshot
} from "../../authoring/environment/WaterEnvironmentSnapshot";
import type { WaterLookAuthoringSnapshot } from "../../authoring/surface/WaterLookAuthoringSnapshot";
import { hashStableValue } from "../../compiler/shared/determinism";
import { resolveEffectiveWaterRuntimeSnapshot } from "../state/WaterEffectiveStateResolver";
import type { EffectiveWaterRuntimeSnapshot } from "../state/EffectiveWaterRuntimeSnapshot";
import { createWaterRuntimeAvailabilitySnapshot } from "../state/WaterRuntimeAvailabilitySnapshot";
import { planWaterRuntimeUpdate } from "../state/WaterRuntimeUpdatePlan";
import { createNegotiatedWaterBodyRuntime, type WaterBodyCapabilityNegotiation } from "./WaterBodyConsumerRuntime";
import type { WaterWorldInteractionChannels, WaterWorldRegistration } from "./WaterWorld";
import { WaterWorld } from "./WaterWorld";
import { deriveWaterCameraFeatureRequest } from "../optics/WaterCameraFeatureDerivation";
import {
  WaterRuntimeResourceRegistry,
  type WaterRuntimeResourceLease
} from "../resources/WaterRuntimeResourceRegistry";
import { resolveWaterBodyCapabilityRequirements } from "./WaterBodyRuntimeSemantics";
import { WaterCompileCache, type WaterCompiledResourceLease } from "./WaterCompileCache";
import { WaterActivationTransaction, type WaterActivationGeneration } from "./WaterActivationTransaction";
import { WaterRuntimeLeaseCoordinator } from "./WaterRuntimeLeaseCoordinator";
import { WaterRuntimeInspectionStore, type WaterBodyActivationInspection } from "./WaterRuntimeInspectionStore";
export type { WaterBodyActivationInspection, WaterBodySpatialFieldInspection } from "./WaterRuntimeInspectionStore";

function applyCameraRequestOverrides(
  request: WaterCameraFeatureRequest | undefined,
  overrides: WaterBackendRuntime["cameraRequestOverrides"]
): WaterCameraFeatureRequest | undefined {
  return request && overrides ? Object.freeze({ ...request, ...overrides }) : request;
}

export enum WaterBodyLoaderErrorCode {
  AuthoringRegistryUnavailable = "WATER_BODY_LOADER_AUTHORING_REGISTRY_UNAVAILABLE",
  InvalidInstance = "WATER_BODY_LOADER_INVALID_INSTANCE",
  ProviderRegistryUnavailable = "WATER_BODY_LOADER_PROVIDER_REGISTRY_UNAVAILABLE",
  ResourceRegistryUnavailable = "WATER_BODY_LOADER_RESOURCE_REGISTRY_UNAVAILABLE",
  RuntimeIdentityMismatch = "WATER_BODY_LOADER_RUNTIME_IDENTITY_MISMATCH",
  RuntimePriorityMismatch = "WATER_BODY_LOADER_RUNTIME_PRIORITY_MISMATCH",
  RuntimeSpatialFieldIdentityMismatch = "WATER_BODY_LOADER_RUNTIME_SPATIAL_FIELD_IDENTITY_MISMATCH",
  CapabilityRequirementUnsatisfied = "WATER_BODY_LOADER_CAPABILITY_REQUIREMENT_UNSATISFIED",
  HandleInactive = "WATER_BODY_LOADER_HANDLE_INACTIVE",
  UpdateUnavailable = "WATER_BODY_LOADER_UPDATE_UNAVAILABLE",
  ReplacementInProgress = "WATER_BODY_LOADER_REPLACEMENT_IN_PROGRESS",
  ReplacementIdentityMismatch = "WATER_BODY_LOADER_REPLACEMENT_IDENTITY_MISMATCH",
  InteractionUnavailable = "WATER_BODY_LOADER_INTERACTION_UNAVAILABLE",
  InvalidInteractionUpdate = "WATER_BODY_LOADER_INVALID_INTERACTION_UPDATE",
  BackendUpdatePolicyUnavailable = "WATER_BODY_LOADER_BACKEND_UPDATE_POLICY_UNAVAILABLE",
  BackendUpdateUnsupported = "WATER_BODY_LOADER_BACKEND_UPDATE_UNSUPPORTED",
  BackendCompileIdentityMismatch = "WATER_BODY_LOADER_BACKEND_COMPILE_IDENTITY_MISMATCH",
  CompileCacheBudgetExceeded = "WATER_BODY_LOADER_COMPILE_CACHE_BUDGET_EXCEEDED"
}

export class WaterBodyLoaderError extends Error {
  constructor(
    readonly code: WaterBodyLoaderErrorCode,
    readonly path: string,
    message: string,
    readonly diagnostics: readonly WaterBodyDiagnostic[] = Object.freeze([])
  ) {
    super(message);
    this.name = "WaterBodyLoaderError";
  }
}

/** Public runtime metadata plus narrow Query/Surface/Spatial/Interaction ports. */
export type WaterBodyRuntimeReadPort = Readonly<
  Pick<
    WaterBodyRuntime,
    | "id"
    | "resolvedBackendId"
    | "kind"
    | "representation"
    | "sourceKind"
    | "capabilities"
    | "opticalProfile"
    | "priority"
    | "enabled"
  > &
    WaterRuntimeInterfaces
>;

export interface WaterBodyActivationHandle {
  readonly body: WaterBodyRuntimeReadPort;
  /** Current immutable instance, shared with the committed runtime state. */
  readonly instance: Readonly<WaterBodyInstance> | undefined;
  /** Current resolved rendering state; reading it does not build a diagnostic snapshot. */
  readonly effectiveState: Readonly<EffectiveWaterRuntimeSnapshot> | undefined;
  readonly resource?: WaterCompiledResourceReadPort;
  readonly development?: WaterBackendDevelopmentContext;
  readonly active: boolean;
  readonly visible: boolean;
  readonly queryEnabled: boolean;
  readonly buoyancyEnabled: boolean;
  readonly wakeEnabled: boolean;
  inspect(): Readonly<WaterBodyActivationInspection>;
  setVisible(visible: boolean): void;
  setQueryEnabled(enabled: boolean): void;
  setBuoyancyEnabled(enabled: boolean): void;
  setWakeEnabled(enabled: boolean): void;
  /** Applies the current World-level terrain-occlusion result to finite Water chunks. */
  refreshTerrainOcclusion?(provider?: WaterTerrainOcclusionProvider): void;
  /** Publishes current source-Camera frustum demand before reflection resolves. */
  refreshCameraVisibility?(provider: WaterCameraVisibilityProvider): void;
  /** Pulls the latest per-camera reflection binding into the active renderer. */
  refreshReflectionBinding(): void;
  /** Re-resolves the unchanged instance against the active shared Look revision. */
  refreshAuthoring(options?: WaterBodyReplacementOptions): Promise<void>;
  /** Re-resolves the effective state against the latest Environment snapshot. */
  refreshEnvironment(options?: WaterBodyReplacementOptions): Promise<void>;
  prepareAuthoringRefresh?(
    look: Readonly<WaterLookAuthoringSnapshot>,
    options?: WaterBodyReplacementOptions
  ): Promise<PreparedWaterBodyEffectiveRefresh>;
  prepareEnvironmentRefresh?(
    environment: Readonly<WaterEnvironmentSnapshot>,
    options?: WaterBodyReplacementOptions
  ): Promise<PreparedWaterBodyEffectiveRefresh>;
  update(update: Readonly<WaterBodyActivationUpdate>, options?: WaterBodyReplacementOptions): Promise<void>;
  replaceInstance(source: unknown, options?: WaterBodyReplacementOptions): Promise<void>;
  /**
   * Fully prepares a same-id replacement without changing the active body.
   * Scene transactions use this to make every fallible compile/upload step
   * complete before the generation is published.
   */
  prepareInstanceReplacement?(
    source: unknown,
    options?: WaterBodyReplacementOptions
  ): Promise<PreparedWaterBodyReplacement>;
  destroy(): Promise<void>;
}

function createWaterBodyRuntimeReadPort(read: () => WaterBodyRuntime): WaterBodyRuntimeReadPort {
  const port = Object.create(null) as Record<PropertyKey, unknown>;
  let publishedBody: WaterBodyRuntime | undefined;
  let publishedInterfaces: WaterRuntimeInterfaces | undefined;
  const readInterfaces = (): WaterRuntimeInterfaces => {
    const current = read();
    if (publishedBody !== current || !publishedInterfaces) {
      publishedBody = current;
      publishedInterfaces = createWaterRuntimeInterfacesView(read);
    }
    return publishedInterfaces;
  };
  for (const key of [
    "id",
    "resolvedBackendId",
    "kind",
    "representation",
    "sourceKind",
    "capabilities",
    "opticalProfile",
    "priority",
    "enabled"
  ] as const) {
    Object.defineProperty(port, key, {
      enumerable: true,
      get: () => createImmutableWaterSnapshot(read()[key])
    });
  }
  for (const key of [
    "surface",
    "surfaceFeatures",
    "spatialField",
    "localField",
    "volume",
    "simulation",
    "interactionSink",
    "bounds",
    "exclusionBounds",
    "metrics"
  ] as const) {
    Object.defineProperty(port, key, {
      enumerable: true,
      get: () => readInterfaces()[key]
    });
  }
  return Object.freeze(port) as WaterBodyRuntimeReadPort;
}

export interface PreparedWaterBodyReplacement {
  readonly active: boolean;
  /** Publishes the already-prepared runtime. Publication begins synchronously. */
  commit(): void;
  /** Retires the previous generation after every participant has published. */
  finalize(): Promise<void>;
  /** Restores the exact previous generation after this participant published. */
  revert(): Promise<void>;
  /** Releases the staged runtime while leaving the active body untouched. */
  rollback(): Promise<void>;
}

export interface PreparedWaterBodyEffectiveRefresh {
  readonly active: boolean;
  commit(): void;
  finalize(): Promise<void>;
  revert(): Promise<void>;
  rollback(): Promise<void>;
}

export interface PreparedWaterBodyInstanceActivation {
  readonly bodyId: string;
  readonly active: boolean;
  /** Publishes the already-prepared initial activation synchronously. */
  commit(): WaterBodyActivationHandle;
  /** Releases the staged runtime without registering it in WaterWorld. */
  rollback(): Promise<void>;
}

/** Minimum command/query surface used by development tooling; no resource owner is exposed. */
export interface WaterDevelopmentHandle {
  readonly active: boolean;
  readonly visible: boolean;
  readonly queryEnabled: boolean;
  readonly buoyancyEnabled: boolean;
  readonly wakeEnabled: boolean;
  readonly body: Pick<WaterBodyRuntimeReadPort, "interactionSink" | "capabilities" | "metrics">;
  readonly instance: WaterBodyActivationHandle["instance"];
  readonly effectiveState: WaterBodyActivationHandle["effectiveState"];
  setVisible(visible: boolean): void;
  setQueryEnabled(enabled: boolean): void;
  setBuoyancyEnabled(enabled: boolean): void;
  setWakeEnabled(enabled: boolean): void;
  replaceInstance(source: unknown): Promise<void>;
}

export interface WaterDevelopmentTarget {
  readonly handle: WaterDevelopmentHandle;
  readonly bodyId: string;
  readonly backendId: string;
  readonly bodyKind: WaterBodyRuntime["kind"];
  readonly representation: WaterBodyRuntime["representation"];
  readonly sourceKind: WaterBodyRuntime["sourceKind"];
  readonly development?: WaterBackendDevelopmentContext;
  readonly lookAuthoring?: WaterLookAuthoringPort;
  readonly variants: readonly WaterBodyRuntimeVariant[];
}

export interface WaterDevelopmentObserver {
  attach(target: WaterDevelopmentTarget): void;
  replace(previous: WaterDevelopmentTarget, next: WaterDevelopmentTarget): void;
  detach(target: WaterDevelopmentTarget): void;
  reportError?(target: WaterDevelopmentTarget, error: unknown): void;
  destroy?(): void;
}

/** Read-only discovery port for DevTools; activation and registry mutation remain Host-private. */
export interface WaterDevelopmentTargetSource {
  readonly metrics: Readonly<WaterBodyLoaderMetrics>;
  observeDevelopmentTargets(observer: WaterDevelopmentObserver): () => void;
}

export interface WaterBodyActivationUpdate {
  readonly visible?: boolean;
  readonly queryEnabled?: boolean;
  readonly buoyancyEnabled?: boolean;
  readonly wakeEnabled?: boolean;
  readonly lookPresetId?: string;
  /** Full planar transform snapshot; partial patches are intentionally unsupported. */
  readonly transform?: WaterPlanarTransformV1;
  readonly qualityPlanId?: string;
  readonly priority?: number;
}

export interface PreparedWaterBodyActivation {
  readonly body: WaterBodyRuntime;
  readonly resource?: WaterCompiledResource;
  readonly cameraRequest?: WaterCameraFeatureRequest;
  readonly registerInWorld?: boolean;
  readonly interaction?: WaterInteractionRequestV1;
  readonly visible?: boolean;
  setVisible?(visible: boolean): void;
  /** Prepared Demo controllers expose synchronous detach on activation failure. */
  destroyRuntime?(): void;
}

interface WaterBodyActivationCommit extends Omit<PreparedWaterBodyActivation, "destroyRuntime"> {
  destroyRuntime?(): void | Promise<void>;
}

export interface WaterBodyLoadOptions {
  readonly signal?: AbortSignal;
  readonly runtimeContext?: unknown;
  readonly providerContext?: unknown;
  /** Host/authoring-layer development port; never transported through a Backend runtime context. */
  readonly developmentRuntime?: unknown;
  readonly registerInWorld?: boolean;
}

export interface WaterBodyInstanceLoadOptions {
  readonly signal?: AbortSignal;
  readonly runtimeContext?: unknown;
  /** Scene-owned objects used only by a registered detached-source provider. */
  readonly providerContext?: unknown;
  /** Host/authoring-layer development port; never transported through a Backend runtime context. */
  readonly developmentRuntime?: unknown;
  /** Scene transaction-local Asset that is not yet published in the active registry. */
  readonly assetOverride?: Readonly<WaterBodyAsset>;
}

export type WaterBodyReplacementOptions = WaterBodyInstanceLoadOptions;

export interface WaterBodyLoaderOptions {
  readonly registry: WaterBackendRegistry;
  readonly world: WaterWorld;
  /**
   * One broker per camera that renders this WaterWorld.
   * A single broker remains accepted for existing single-camera scenes.
   */
  readonly cameraFeatures?: CameraWaterFeatureBroker | readonly CameraWaterFeatureBroker[];
  readonly assets?: WaterBodyAssetRegistry;
  readonly providers?: WaterBodyProviderRegistry;
  readonly resources?: WaterRuntimeResourceRegistry;
  readonly reflection?: WaterBackendReflectionContext;
  /** Host-owned shared Look transaction port exposed to development clients. */
  readonly createLookAuthoringPort?: (lookId: string) => WaterLookAuthoringPort;
  /** Change-driven Scene facts; Engine objects and per-frame clocks are excluded. */
  readonly readEnvironmentSnapshot?: () => Readonly<WaterEnvironmentSnapshot>;
  /** Bounded editor/runtime compile cache. */
  readonly compileCacheEntryLimit?: number;
  /** Maximum retained immutable compiled bytes. */
  readonly compileCacheBudgetBytes?: number;
}

export interface WaterBodyLoaderMetrics {
  readonly activeBodyCount: number;
  readonly cachedResourceCount: number;
  readonly compileCount: number;
  readonly cacheHitCount: number;
  readonly cacheMissCount: number;
  readonly failedActivationCount: number;
  readonly cacheEvictionCount: number;
  readonly compileCacheEntryLimit: number;
  readonly compileCacheBudgetBytes: number;
  readonly cachedResourceMemory: WaterResourceMemoryMetrics;
}

interface MutableActivationState {
  registration?: WaterWorldRegistration;
  cameraLeases: WaterCameraFeatureRequestLease[];
  runtime?: WaterBackendRuntime;
  resource?: WaterCompiledResource;
  compiledLease?: WaterCompiledResourceLease;
  resourceLeases: WaterRuntimeResourceLease[];
  resolvedInstance?: ResolvedWaterBodyInstance;
  effectiveSnapshot?: Readonly<EffectiveWaterRuntimeSnapshot>;
  runtimeContext?: unknown;
  providerContext?: unknown;
  developmentRuntime?: unknown;
  capabilityNegotiation?: WaterBodyCapabilityNegotiation;
  stagedRuntime?: boolean;
}

interface MutableCommittedActivation {
  state: MutableActivationState;
  prepared: WaterBodyActivationCommit;
  visible: boolean;
  interaction: WaterWorldInteractionChannels;
  revision: number;
  lastUpdateMode?: WaterBackendUpdateMode;
  replacing: boolean;
  readonly replacementTransaction: WaterActivationTransaction;
  readonly replacementPromises: Set<Promise<unknown>>;
  readonly preparedEffectiveRefreshes: Set<PreparedWaterBodyEffectiveRefresh>;
  /** Serializes backend-owned in-place mutations so a superseded generation can never publish or roll back over its successor. */
  runtimeUpdateTail: Promise<void>;
}

interface WaterBodyReplacementPublication {
  finalize(): Promise<void>;
  revert(): Promise<void>;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Water body activation was aborted.", "AbortError");
}

function isWaterBodyInstanceSource(value: unknown): value is WaterBodyInstance {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    (value as Readonly<{ schemaVersion?: unknown }>).schemaVersion === WATER_BODY_INSTANCE_SCHEMA_VERSION
  );
}

function defaultCacheKey(asset: WaterBodyAsset<WaterBodySourceV1>, backendId: string): string {
  return `${asset.schemaVersion}:${backendId}:${asset.representation.domain}:${asset.representation.macroSurface}:${asset.representationDataHash ?? "none"}:${asset.source.kind}:${asset.sourceHash}`;
}

function capabilityRequirements(resolved: Readonly<ResolvedWaterBodyInstance>) {
  return resolveWaterBodyCapabilityRequirements(resolved);
}

function freezeInteraction(interaction: WaterWorldInteractionChannels): WaterWorldInteractionChannels {
  return Object.freeze({
    query: interaction.query,
    buoyancy: interaction.buoyancy,
    wake: interaction.wake
  });
}

function interactionEquals(left: WaterWorldInteractionChannels, right: WaterWorldInteractionChannels): boolean {
  return left.query === right.query && left.buoyancy === right.buoyancy && left.wake === right.wake;
}

function planarTransformEquals(left: WaterPlanarTransformV1, right: WaterPlanarTransformV1): boolean {
  return (
    left.position[0] === right.position[0] &&
    left.position[1] === right.position[1] &&
    left.position[2] === right.position[2] &&
    left.yawDegrees === right.yawDegrees &&
    left.scaleXZ[0] === right.scaleXZ[0] &&
    left.scaleXZ[1] === right.scaleXZ[1]
  );
}

function canUpdateLookInPlace(previous: ResolvedWaterBodyInstance, next: ResolvedWaterBodyInstance): boolean {
  if (
    previous.asset.id !== next.asset.id ||
    previous.asset.sourceHash !== next.asset.sourceHash ||
    previous.asset.representationDataHash !== next.asset.representationDataHash ||
    previous.asset.kind !== next.asset.kind ||
    previous.asset.representation.domain !== next.asset.representation.domain ||
    previous.asset.representation.macroSurface !== next.asset.representation.macroSurface ||
    previous.instance.lookPresetId !== next.instance.lookPresetId ||
    previous.renderContract.variantKey !== next.renderContract.variantKey ||
    previous.renderContract.reflectionIntent.contentHash !== next.renderContract.reflectionIntent.contentHash ||
    previous.renderContract.renderState.contentHash !== next.renderContract.renderState.contentHash ||
    previous.qualityPlan.id !== next.qualityPlan.id ||
    previous.resources.length !== next.resources.length
  ) {
    return false;
  }
  for (let index = 0; index < previous.resources.length; index++) {
    const left = previous.resources[index];
    const right = next.resources[index];
    if (
      left.id !== right.id ||
      left.kind !== right.kind ||
      left.contentHash !== right.contentHash ||
      left.ownership !== right.ownership ||
      left.fallbackPolicy !== right.fallbackPolicy
    ) {
      return false;
    }
  }
  const previousCamera = deriveWaterCameraFeatureRequest(previous, { ssrEligible: false });
  const nextCamera = deriveWaterCameraFeatureRequest(next, { ssrEligible: false });
  if (
    previousCamera?.depthTexture !== nextCamera?.depthTexture ||
    previousCamera?.opaqueTexture !== nextCamera?.opaqueTexture ||
    previousCamera?.reflection !== nextCamera?.reflection ||
    previousCamera?.caustics !== nextCamera?.caustics ||
    previousCamera?.quality !== nextCamera?.quality ||
    previousCamera?.opaqueDownsampling !== nextCamera?.opaqueDownsampling
  ) {
    return false;
  }
  return true;
}

function resolvePreparedInteraction(prepared: PreparedWaterBodyActivation): WaterWorldInteractionChannels {
  return freezeInteraction(
    prepared.interaction ?? {
      query: prepared.registerInWorld !== false,
      buoyancy: false,
      wake: false
    }
  );
}

export class WaterBodyLoader {
  private readonly _registry: WaterBackendRegistry;
  private readonly _world: WaterWorld;
  private readonly _cameraFeatures: readonly CameraWaterFeatureBroker[];
  private readonly _assets?: WaterBodyAssetRegistry;
  private readonly _providers?: WaterBodyProviderRegistry;
  private readonly _resources?: WaterRuntimeResourceRegistry;
  private readonly _reflection?: WaterBackendReflectionContext;
  private readonly _createLookAuthoringPort?: WaterBodyLoaderOptions["createLookAuthoringPort"];
  private readonly _readEnvironmentSnapshot: () => Readonly<WaterEnvironmentSnapshot>;
  private readonly _compileCache: WaterCompileCache;
  private readonly _leaseCoordinator: WaterRuntimeLeaseCoordinator;
  private readonly _inspectionStore = new WaterRuntimeInspectionStore();
  private readonly _lifetimeAbort = new AbortController();
  private readonly _inFlightLoads = new Set<Promise<unknown>>();
  private readonly _preparedInitialActivations = new Set<PreparedWaterBodyInstanceActivation>();
  private readonly _retiredCleanup = new Set<Promise<void>>();
  private readonly _active = new Set<WaterBodyActivationHandle>();
  private readonly _committed = new Set<MutableCommittedActivation>();
  private _withdrawn = false;
  private readonly _developmentObservers = new Set<WaterDevelopmentObserver>();
  private readonly _developmentTargets = new Map<WaterBodyActivationHandle, WaterDevelopmentTarget>();
  private _nextCompileGenerationId = 1;
  private _failedActivationCount = 0;
  private _destroyed = false;

  constructor(options: WaterBodyLoaderOptions) {
    this._registry = options.registry;
    this._world = options.world;
    const cameraFeatures = options.cameraFeatures;
    this._cameraFeatures = Object.freeze(
      cameraFeatures === undefined
        ? []
        : [...new Set(Array.isArray(cameraFeatures) ? cameraFeatures : [cameraFeatures])]
    );
    this._assets = options.assets;
    this._providers = options.providers;
    this._resources = options.resources;
    this._reflection = options.reflection;
    this._createLookAuthoringPort = options.createLookAuthoringPort;
    this._readEnvironmentSnapshot = options.readEnvironmentSnapshot ?? (() => DEFAULT_WATER_ENVIRONMENT_SNAPSHOT);
    this._compileCache = new WaterCompileCache({
      entryLimit: options.compileCacheEntryLimit ?? 32,
      budgetBytes: options.compileCacheBudgetBytes ?? 256 * 1024 * 1024
    });
    this._leaseCoordinator = new WaterRuntimeLeaseCoordinator(this._cameraFeatures, this._resources);
  }

  get metrics(): WaterBodyLoaderMetrics {
    const cache = this._compileCache.metrics;
    return Object.freeze({
      activeBodyCount: this._active.size,
      cachedResourceCount: cache.cachedResourceCount,
      compileCount: cache.compileCount,
      cacheHitCount: cache.cacheHitCount,
      cacheMissCount: cache.cacheMissCount,
      failedActivationCount: this._failedActivationCount,
      cacheEvictionCount: cache.cacheEvictionCount,
      compileCacheEntryLimit: cache.entryLimit,
      compileCacheBudgetBytes: cache.budgetBytes,
      cachedResourceMemory: cache.cachedResourceMemory
    });
  }

  observeDevelopmentTargets(observer: WaterDevelopmentObserver): () => void {
    this._assertAvailable();
    if (this._developmentObservers.has(observer)) {
      return () => this._removeDevelopmentObserver(observer);
    }
    this._developmentObservers.add(observer);
    for (const handle of this._active) {
      const target = this._getDevelopmentTarget(handle);
      this._invokeDevelopmentObserver(observer, () => observer.attach(target));
    }
    return () => this._removeDevelopmentObserver(observer);
  }

  loadInstance(source: unknown, options: WaterBodyInstanceLoadOptions = {}): Promise<WaterBodyActivationHandle> {
    this._assertAvailable();
    const operation = this._loadInstance(source, {
      ...options,
      signal: this._combineWithLifetimeSignal(options.signal)
    });
    return this._trackOperation(operation);
  }

  prepareInstance(
    source: unknown,
    options: WaterBodyInstanceLoadOptions = {}
  ): Promise<PreparedWaterBodyInstanceActivation> {
    this._assertAvailable();
    return this._trackOperation(
      this._prepareInstanceActivation(source, {
        ...options,
        signal: this._combineWithLifetimeSignal(options.signal)
      })
    );
  }

  private _trackOperation<T>(operation: Promise<T>): Promise<T> {
    this._inFlightLoads.add(operation);
    void operation.then(
      () => this._inFlightLoads.delete(operation),
      () => this._inFlightLoads.delete(operation)
    );
    return operation;
  }

  private async _loadInstance(
    source: unknown,
    options: WaterBodyInstanceLoadOptions
  ): Promise<WaterBodyActivationHandle> {
    const prepared = await this._prepareInstanceActivation(source, options, false);
    try {
      return prepared.commit();
    } catch (error) {
      this._failedActivationCount++;
      await prepared.rollback();
      throw error;
    }
  }

  private _resolveInstance(
    source: unknown,
    label: string,
    assetOverride?: Readonly<WaterBodyAsset>
  ): ResolvedWaterBodyInstance {
    if (!this._assets) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.AuthoringRegistryUnavailable,
        "$",
        `${label} resolution requires an authoring asset registry.`
      );
    }
    try {
      if (!isWaterBodyInstanceSource(source)) {
        throw new WaterBodyLoaderError(
          WaterBodyLoaderErrorCode.InvalidInstance,
          "$.schemaVersion",
          `${label} must use the authoritative WaterBody instance schema version 2.`
        );
      }
      const resolved = this._assets.resolve(createWaterBodyInstance(source), undefined, assetOverride);
      this._registry.requireBackend(resolved.asset);
      return resolved;
    } catch (error) {
      if (error instanceof WaterBodyLoaderError) throw error;
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.InvalidInstance,
        "$",
        error instanceof Error ? error.message : `${label} is invalid.`
      );
    }
  }

  private async _prepareInstanceActivation(
    source: unknown,
    options: WaterBodyInstanceLoadOptions,
    stageRuntime = true
  ): Promise<PreparedWaterBodyInstanceActivation> {
    if (!this._assets) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.AuthoringRegistryUnavailable,
        "$",
        "WaterBodyLoader.loadInstance() requires an authoring asset registry."
      );
    }
    const resolved = this._resolveInstance(source, "WaterBody instance", options.assetOverride);
    let sourceOverride: { readonly value: unknown } | undefined;
    if (resolved.asset.source.kind === WaterBodySourceKind.TerrainRegion) {
      if (!this._providers) {
        throw new WaterBodyLoaderError(
          WaterBodyLoaderErrorCode.ProviderRegistryUnavailable,
          "$.asset.source.providerId",
          "Terrain-region WaterBody sources require a registered provider registry."
        );
      }
      sourceOverride = {
        value: await this._providers.resolve(resolved.asset.source, {
          resolved,
          providerContext: options.providerContext,
          signal: options.signal
        })
      };
    }
    const candidate = await this._prepareActivation(
      resolved.asset,
      {
        signal: options.signal,
        runtimeContext: options.runtimeContext,
        providerContext: options.providerContext,
        developmentRuntime: options.developmentRuntime,
        registerInWorld: resolved.instance.interaction.query
      },
      resolved,
      sourceOverride,
      stageRuntime
    );
    let active = true;
    let preparedActivation!: PreparedWaterBodyInstanceActivation;
    preparedActivation = Object.freeze({
      bodyId: candidate.prepared.body.id,
      get active() {
        return active;
      },
      commit: () => {
        if (!active) throw new Error(`Prepared Water body '${candidate.prepared.body.id}' is inactive.`);
        this._assertAvailable();
        active = false;
        this._preparedInitialActivations.delete(preparedActivation);
        return this._commitActivation(candidate.prepared, candidate.state);
      },
      rollback: async () => {
        if (!active) return;
        active = false;
        this._preparedInitialActivations.delete(preparedActivation);
        await this._rollback(candidate.state);
      }
    });
    this._preparedInitialActivations.add(preparedActivation);
    return preparedActivation;
  }

  private async _prepareActivation(
    asset: WaterBodyAsset<WaterBodySourceV1>,
    options: WaterBodyLoadOptions,
    resolvedInstance: ResolvedWaterBodyInstance,
    sourceOverride?: { readonly value: unknown },
    stageRuntime = false
  ): Promise<{
    readonly state: MutableActivationState;
    readonly prepared: WaterBodyActivationCommit;
  }> {
    const state: MutableActivationState = {
      cameraLeases: [],
      resourceLeases: [],
      resolvedInstance,
      runtimeContext: options.runtimeContext,
      providerContext: options.providerContext,
      developmentRuntime: options.developmentRuntime,
      stagedRuntime: stageRuntime
    };
    try {
      this._assertAvailable();
      throwIfAborted(options.signal);
      const backend = this._registry.requireBackend(asset);
      this._assertBackendCameraCount(backend, resolvedInstance.instance.id);
      const resolvedSource =
        sourceOverride !== undefined
          ? sourceOverride.value
          : backend.resolveAsset
            ? await backend.resolveAsset(asset, {
                authoringVersion: 2,
                signal: options.signal,
                resolvedInstance
              })
            : asset.source;
      this._assertAvailable();
      throwIfAborted(options.signal);
      state.compiledLease = await this._acquireCompiledResource(
        asset,
        resolvedSource,
        backend,
        options.signal,
        resolvedInstance
      );
      const resource = state.compiledLease.resource;
      state.resource = resource;
      state.effectiveSnapshot = this._resolveEffectiveSnapshot(resolvedInstance, resource, 0);
      this._assertAvailable();
      throwIfAborted(options.signal);

      if (resolvedInstance?.resources.length) {
        if (!this._resources) {
          throw new WaterBodyLoaderError(
            WaterBodyLoaderErrorCode.ResourceRegistryUnavailable,
            "$.resources",
            "Resolved WaterBody resources require a runtime resource registry."
          );
        }
        await this._leaseCoordinator.acquireRuntimeResourcesInto(state.resourceLeases, resolvedInstance.resources, {
          signal: options.signal,
          runtimeContext: options.runtimeContext
        });
      }
      const runtime = await backend.createRuntime(resource, {
        authoringVersion: 2,
        runtimeContext: options.runtimeContext,
        signal: options.signal,
        effectiveSnapshot: state.effectiveSnapshot,
        resourceLeases: Object.freeze([...state.resourceLeases]),
        reflection: this._reflection,
        activationMode: stageRuntime ? "replacement-staging" : "initial"
      });
      state.runtime = runtime;
      this._assertAvailable();
      throwIfAborted(options.signal);
      this._validateResolvedRuntime(runtime.body, resolvedInstance, backend.id);
      this._validateSpatialFieldIdentity(runtime.body, resource);
      let consumerBody = runtime.body;
      const negotiated = createNegotiatedWaterBodyRuntime(runtime.body, capabilityRequirements(resolvedInstance));
      consumerBody = negotiated.body;
      state.capabilityNegotiation = negotiated.negotiation;
      if (runtime.reflection) {
        this._attachReflectionCameraOwnership(
          runtime.reflection,
          state,
          resolvedInstance,
          runtime.cameraRequestOverrides
        );
      }
      await this._synchronizeInitialEffectiveSnapshot(state, resolvedInstance, resource);
      const cameraRequest = runtime.reflection
        ? undefined
        : applyCameraRequestOverrides(
            deriveWaterCameraFeatureRequest(resolvedInstance, {
              cameraProvidersAvailable: this._cameraFeatures.length > 0,
              ssrEligible: false
            }),
            runtime.cameraRequestOverrides
          );
      this._validateInteraction(consumerBody, resolvedInstance.instance.interaction);
      if (resolvedInstance.instance.visible && !runtime.setVisible) {
        throw new WaterBodyLoaderError(
          WaterBodyLoaderErrorCode.UpdateUnavailable,
          "$.visible",
          `Water body '${consumerBody.id}' does not expose renderer visibility control.`
        );
      }
      return {
        state,
        prepared: {
          body: consumerBody,
          resource,
          cameraRequest,
          registerInWorld: options.registerInWorld,
          interaction: resolvedInstance.instance.interaction,
          visible: resolvedInstance.instance.visible,
          setVisible: runtime.setVisible,
          destroyRuntime: () => runtime.destroy()
        }
      };
    } catch (error) {
      this._failedActivationCount++;
      try {
        await this._rollback(state);
      } catch (rollbackError) {
        throw new WaterMutationRollbackError(
          [error, rollbackError],
          "WaterBody activation failed and rollback reported an additional error."
        );
      }
      throw error;
    }
  }

  clearCompileCache(): void {
    this._compileCache.clear();
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    this.abortPendingOperations();
    const pendingCompiles = this._compileCache.abortPending();
    let firstError: unknown;
    await Promise.allSettled([...this._inFlightLoads, ...pendingCompiles, ...this._retiredCleanup]);
    const preparedCleanup = await Promise.allSettled(
      [...this._preparedInitialActivations].map((prepared) => prepared.rollback())
    );
    for (const result of preparedCleanup) {
      if (result.status === "rejected") firstError ??= result.reason;
    }
    const handles = [...this._active];
    for (const handle of handles) {
      try {
        await handle.destroy();
      } catch (error) {
        firstError ??= error;
      }
    }
    for (const observer of this._developmentObservers) {
      this._invokeDevelopmentObserver(observer, () => observer.destroy?.());
    }
    this._developmentObservers.clear();
    this._developmentTargets.clear();
    this.clearCompileCache();
    if (firstError) throw firstError;
  }

  /** Terminal withdrawal bypasses editing locks and never rolls gameplay routes back on failure. */
  withdrawRuntime(): void {
    this._withdrawn = true;
    const errors: unknown[] = [];
    for (const current of this._committed) {
      current.prepared.body.enabled = false;
      current.interaction = freezeInteraction({ query: false, buoyancy: false, wake: false });
      current.visible = false;
      for (const release of [
        () => {
          current.state.registration?.destroy();
          current.state.registration = undefined;
        },
        () => current.prepared.setVisible?.(false),
        () => this._releaseCameraLeases(current.state)
      ]) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      this._updateResolvedVisibility(current, false);
      this._updateResolvedInteraction(current, current.interaction);
      this._synchronizeEffectiveInstanceSnapshot(current);
    }
    this.abortPendingOperations();
    if (errors.length) throw new AggregateError(errors, "Water runtime withdrawal failed.");
  }

  /** Cancels all current and future backend operations before lifecycle drain. */
  abortPendingOperations(): void {
    if (!this._lifetimeAbort.signal.aborted) this._lifetimeAbort.abort();
    this._compileCache.abortPending();
  }

  private async _acquireCompiledResource(
    asset: WaterBodyAsset<WaterBodySourceV1>,
    resolvedSource: unknown,
    backend: WaterBodyBackend,
    signal: AbortSignal | undefined,
    resolvedInstance: ResolvedWaterBodyInstance
  ): Promise<WaterCompiledResourceLease> {
    const identityContext = { signal, resolvedInstance };
    const backendKey = backend.getCompileKey?.(asset, resolvedSource, identityContext);
    if (backendKey !== undefined && backendKey.trim().length === 0) {
      throw new Error(`Water backend '${backend.id}' returned an empty compile key.`);
    }
    const expectedSourceHash = backend.getSourceHash?.(asset, resolvedSource, identityContext) ?? asset.sourceHash;
    if (expectedSourceHash.trim().length === 0) {
      throw new Error(`Water backend '${backend.id}' returned an empty source hash.`);
    }
    const key =
      backendKey === undefined
        ? defaultCacheKey(asset, backend.id)
        : `${defaultCacheKey(asset, backend.id)}:${backendKey}`;
    return this._compileCache.acquire({
      key,
      signal,
      compile: (compileSignal) =>
        backend.compile(resolvedSource, {
          authoringVersion: 2,
          asset,
          signal: compileSignal,
          resolvedInstance,
          generationId: this._nextCompileGenerationId++
        }),
      validate: (resource) => this._validateCompiledResource(asset, backend.id, resource, expectedSourceHash),
      createBudgetExceededError: (resourceBytes, budgetBytes) =>
        new WaterBodyLoaderError(
          WaterBodyLoaderErrorCode.CompileCacheBudgetExceeded,
          "$.source",
          `Water compiled resource requires ${resourceBytes} bytes, exceeding cache budget ${budgetBytes}.`
        )
    });
  }

  private _resolveEffectiveSnapshot(
    resolved: Readonly<ResolvedWaterBodyInstance>,
    resource: Readonly<WaterCompiledResource>,
    revision: number,
    reflection?: WaterReflectionBindingLifecycle,
    environmentOverride?: Readonly<WaterEnvironmentSnapshot>,
    previousEffective?: Readonly<EffectiveWaterRuntimeSnapshot>
  ): Readonly<EffectiveWaterRuntimeSnapshot> {
    const environment = environmentOverride ?? this._readEnvironmentSnapshot();
    const resolvedReflectionSource = reflection?.resolvedMode ?? "analytic";
    const availabilityFacts = Object.freeze({
      reflectionBindingRevision: reflection?.appliedBindingRevision ?? 0,
      sceneColor: this._cameraFeatures.length > 0 && resolved.qualityPlan.sceneFields !== "local-only",
      sceneDepth: this._cameraFeatures.length > 0 && resolved.qualityPlan.sceneFields === "scene-color-depth",
      environmentReflection: resolvedReflectionSource === "environment",
      screenSpaceReflection: resolvedReflectionSource === "ssr",
      resolvedReflectionSource
    });
    const previousAvailability = previousEffective?.runtimeAvailability;
    const availabilityChanged =
      !previousAvailability ||
      previousAvailability.sceneColor !== availabilityFacts.sceneColor ||
      previousAvailability.sceneDepth !== availabilityFacts.sceneDepth ||
      previousAvailability.environmentReflection !== availabilityFacts.environmentReflection ||
      previousAvailability.screenSpaceReflection !== availabilityFacts.screenSpaceReflection ||
      previousAvailability.resolvedReflectionSource !== availabilityFacts.resolvedReflectionSource;
    const availability = createWaterRuntimeAvailabilitySnapshot({
      ...availabilityFacts,
      revision: previousAvailability ? previousAvailability.revision + (availabilityChanged ? 1 : 0) : 0
    });
    return resolveEffectiveWaterRuntimeSnapshot({
      revision,
      resolved,
      physicalSurfaceHash: resource.identity.physicalSurfaceHash,
      compiledResourceHash: hashStableValue(resource.identity),
      environment,
      runtimeAvailability: availability
    });
  }

  private async _synchronizeInitialEffectiveSnapshot(
    state: MutableActivationState,
    resolved: Readonly<ResolvedWaterBodyInstance>,
    resource: Readonly<WaterCompiledResource>,
    environmentOverride?: Readonly<WaterEnvironmentSnapshot>
  ): Promise<void> {
    const previous = state.effectiveSnapshot;
    if (!previous) return;
    const next = this._resolveEffectiveSnapshot(
      resolved,
      resource,
      previous.revision + 1,
      state.runtime?.reflection,
      environmentOverride,
      previous
    );
    if (next.contentHash === previous.contentHash) {
      if (next.reflectionBindingRevision !== previous.reflectionBindingRevision) {
        state.effectiveSnapshot = next;
      }
      return;
    }
    await state.runtime?.updateEffectiveState?.(next);
    state.effectiveSnapshot = next;
  }

  private _synchronizeEffectiveReflectionSnapshot(
    current: MutableCommittedActivation,
    advanceActivationRevision = true
  ): void {
    const state = current.state;
    const resolved = state.resolvedInstance;
    const resource = state.resource;
    const previous = state.effectiveSnapshot;
    if (!resolved || !resource || !previous) return;
    const reflection = state.runtime?.reflection;
    const reflectionBindingRevision = reflection?.appliedBindingRevision ?? 0;
    const resolvedReflectionSource = reflection?.resolvedMode ?? "analytic";
    const reflectionSourceUnchanged =
      previous.runtimeAvailability.resolvedReflectionSource === resolvedReflectionSource;
    if (previous.reflectionBindingRevision === reflectionBindingRevision && reflectionSourceUnchanged) {
      return;
    }
    const environment = this._readEnvironmentSnapshot();
    if (reflectionSourceUnchanged && previous.environmentRevision === environment.revision) {
      // Binding publication advances independently of Water semantics, such as during an IBL blend
      const bindingRevision = createWaterRevision<"water-reflection-binding">(reflectionBindingRevision);
      state.effectiveSnapshot = Object.freeze({
        ...previous,
        revision: nextWaterRevision(previous.revision),
        reflectionBindingRevision: bindingRevision,
        runtimeAvailability: Object.freeze({
          ...previous.runtimeAvailability,
          reflectionBindingRevision: bindingRevision
        })
      });
      return;
    }
    const next = this._resolveEffectiveSnapshot(
      resolved,
      resource,
      previous.revision + 1,
      reflection,
      environment,
      previous
    );
    if (
      next.contentHash === previous.contentHash &&
      next.reflectionBindingRevision === previous.reflectionBindingRevision
    ) {
      return;
    }
    const semanticContentChanged = next.contentHash !== previous.contentHash;
    state.effectiveSnapshot = next;
    if (semanticContentChanged && advanceActivationRevision) current.revision++;
    if (semanticContentChanged) current.lastUpdateMode = "runtime-update";
  }

  /** Publishes Instance semantics and Effective state as one synchronous mutation. */
  private _synchronizeEffectiveInstanceSnapshot(current: MutableCommittedActivation): void {
    const state = current.state;
    const resolved = state.resolvedInstance;
    const resource = state.resource;
    const previous = state.effectiveSnapshot;
    if (!resolved || !resource || !previous) return;
    const next = this._resolveEffectiveSnapshot(
      resolved,
      resource,
      previous.revision + 1,
      state.runtime?.reflection,
      undefined,
      previous
    );
    if (
      next.contentHash === previous.contentHash &&
      next.reflectionBindingRevision === previous.reflectionBindingRevision
    ) {
      return;
    }
    try {
      state.runtime?.updateEffectiveState?.(next);
      state.effectiveSnapshot = next;
      current.lastUpdateMode = "runtime-update";
    } catch (error) {
      state.effectiveSnapshot = previous;
      try {
        state.runtime?.updateEffectiveState?.(previous);
      } catch (rollbackError) {
        throw new WaterMutationRollbackError(
          [error, rollbackError],
          "WaterBody Instance EffectiveSnapshot update failed and rollback reported an additional error."
        );
      }
      throw error;
    }
  }

  private _validateCompiledResource(
    asset: WaterBodyAsset<WaterBodySourceV1>,
    resolvedBackendId: string,
    resource: WaterCompiledResource,
    expectedSourceHash: string
  ): void {
    if (resource.isDisposed || resource.disposeRequested) {
      throw new Error(`Water backend '${resolvedBackendId}' returned a disposed resource.`);
    }
    if (resource.identity.resolvedBackendId !== resolvedBackendId) {
      throw new Error(
        `Water backend '${resolvedBackendId}' returned resource '${resource.identity.resolvedBackendId}'.`
      );
    }
    if (
      resource.identity.representation.domain !== asset.representation.domain ||
      resource.identity.representation.macroSurface !== asset.representation.macroSurface ||
      resource.identity.sourceKind !== asset.source.kind
    ) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.BackendCompileIdentityMismatch,
        "$.representation",
        `Water backend '${resolvedBackendId}' returned a compiled route that does not match the resolved asset.`
      );
    }
    if (resource.identity.sourceHash !== expectedSourceHash) {
      throw new Error("Water resource sourceHash does not match the resolved source.");
    }
    if (resource.identity.sourceId.trim().length === 0) {
      throw new Error(`Water backend '${resolvedBackendId}' returned an empty resource sourceId.`);
    }
    if (resource.identity.compiledHash.trim().length === 0) {
      throw new Error(`Water backend '${resolvedBackendId}' returned an empty resource compiledHash.`);
    }
    if (resource.identity.physicalSurfaceHash.trim().length === 0) {
      throw new Error(`Water backend '${resolvedBackendId}' returned an empty physicalSurfaceHash.`);
    }
    if (!Number.isInteger(resource.identity.schemaVersion) || resource.identity.schemaVersion <= 0) {
      throw new Error(`Water backend '${resolvedBackendId}' returned an invalid resource schemaVersion.`);
    }
  }

  private _validateResolvedRuntime(
    body: WaterBodyRuntime,
    resolved: ResolvedWaterBodyInstance,
    resolvedBackendId: string
  ): void {
    const instance = resolved.instance;
    if (
      body.id !== instance.id ||
      body.resolvedBackendId !== resolvedBackendId ||
      body.kind !== resolved.asset.kind ||
      body.representation.domain !== resolved.asset.representation.domain ||
      body.representation.macroSurface !== resolved.asset.representation.macroSurface ||
      body.sourceKind !== resolved.asset.source.kind
    ) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.RuntimeIdentityMismatch,
        "$.id",
        `Water backend returned a runtime route that does not match instance '${instance.id}'.`
      );
    }
    if (body.priority !== instance.priority) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.RuntimePriorityMismatch,
        "$.priority",
        `Water backend returned priority ${body.priority}, expected ${instance.priority}.`
      );
    }
    const requirements = capabilityRequirements(resolved);
    const checks = [
      ["localBathymetry", requirements.localBathymetry, body.capabilities.localBathymetry],
      ["shoreSdf", requirements.shoreSdf, body.capabilities.shoreSdf],
      ["current", requirements.current, body.capabilities.localCurrent]
    ] as const;
    for (const [name, requirement, available] of checks) {
      if (requirement === "required" && !available) {
        throw new WaterBodyLoaderError(
          WaterBodyLoaderErrorCode.CapabilityRequirementUnsatisfied,
          `$.requirements.${name}`,
          `Runtime '${body.id}' does not expose required capability '${name}'.`
        );
      }
    }
  }

  private _validateSpatialFieldIdentity(body: WaterBodyRuntime, resource: WaterCompiledResource): void {
    if (!Object.prototype.hasOwnProperty.call(resource, "spatialFieldIdentity")) {
      return;
    }
    const expected = resource.spatialFieldIdentity;
    const provider = body.spatialField;
    if (!expected && !provider) return;
    if (!expected || !provider) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.RuntimeSpatialFieldIdentityMismatch,
        "$.asset.source",
        `Runtime '${body.id}' Spatial Field presence does not match its compiled resource.`
      );
    }
    const actual = provider.metadata;
    if (
      actual.sourceSchemaVersion !== expected.sourceSchemaVersion ||
      actual.sourceHash !== expected.sourceHash ||
      actual.compiledHash !== expected.compiledHash
    ) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.RuntimeSpatialFieldIdentityMismatch,
        "$.asset.source",
        `Runtime '${body.id}' Spatial Field identity does not match its compiled resource.`
      );
    }
    const gpuBinding = provider.gpuBinding;
    if (
      gpuBinding &&
      (gpuBinding.sourceHash !== actual.sourceHash || gpuBinding.compiledHash !== actual.compiledHash)
    ) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.RuntimeSpatialFieldIdentityMismatch,
        "$.asset.source",
        `Runtime '${body.id}' GPU Spatial Field binding identity does not match its Provider.`
      );
    }
  }

  private _validateInteraction(body: WaterBodyRuntime, interaction: WaterWorldInteractionChannels): void {
    if (!interaction.query && (interaction.buoyancy || interaction.wake)) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.InvalidInteractionUpdate,
        "$.interaction.query",
        "Buoyancy and wake interaction require query routing."
      );
    }
    if (interaction.wake && !body.interactionSink) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.InteractionUnavailable,
        "$.interaction.wake",
        `Water body '${body.id}' does not expose a wake interaction sink.`
      );
    }
  }

  private _commitActivation(
    prepared: WaterBodyActivationCommit,
    state: MutableActivationState
  ): WaterBodyActivationHandle {
    const interaction = resolvePreparedInteraction(prepared);
    this._validateInteraction(prepared.body, interaction);
    const current: MutableCommittedActivation = {
      state,
      prepared,
      visible: prepared.visible ?? true,
      interaction,
      revision: 0,
      replacing: false,
      replacementTransaction: new WaterActivationTransaction(),
      replacementPromises: new Set(),
      preparedEffectiveRefreshes: new Set(),
      runtimeUpdateTail: Promise.resolve()
    };
    try {
      prepared.body.enabled = current.interaction.query;
      if (prepared.cameraRequest && current.visible) {
        state.cameraLeases = this._acquireCameraLeases(prepared.body.id, prepared.cameraRequest);
      }
      if (current.interaction.query) {
        state.registration = this._world.register(prepared.body, current.interaction);
      }
      prepared.setVisible?.(current.visible);
      if (state.stagedRuntime) {
        state.runtime?.commitReplacement?.();
        state.runtime?.refreshReflectionBinding?.();
        this._synchronizeEffectiveReflectionSnapshot(current, false);
      }
    } catch (error) {
      this._failedActivationCount++;
      const rollbackErrors: unknown[] = [];
      try {
        state.registration?.destroy();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      state.registration = undefined;
      try {
        this._releaseCameraLeases(state);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      prepared.body.enabled = false;
      try {
        prepared.setVisible?.(false);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      const cleanup = this._rollback(state).catch((rollbackError) => {
        console.error("[water-body-loader] failed activation cleanup failed", rollbackError);
      });
      this._retiredCleanup.add(cleanup);
      void cleanup.finally(() => this._retiredCleanup.delete(cleanup));
      if (rollbackErrors.length > 0) {
        throw new WaterMutationRollbackError(
          [error, ...rollbackErrors],
          "WaterBody activation publication rollback failed."
        );
      }
      throw error;
    }

    let active = true;
    let destroyPromise: Promise<void> | undefined;
    let handle: WaterBodyActivationHandle;
    const requireActive = (): void => {
      if (!active) {
        throw new WaterBodyLoaderError(
          WaterBodyLoaderErrorCode.HandleInactive,
          "$",
          `Water body '${current.prepared.body.id}' is no longer active.`
        );
      }
    };
    const requireMutable = (): void => {
      this._assertAvailable();
      requireActive();
      if (current.replacing) {
        throw new WaterBodyLoaderError(
          WaterBodyLoaderErrorCode.ReplacementInProgress,
          "$",
          `Water body '${current.prepared.body.id}' already has an update in progress.`
        );
      }
    };
    const beginUpdate = (
      signal: AbortSignal | undefined,
      operation: (generation: WaterActivationGeneration) => Promise<void>
    ): Promise<void> => {
      requireMutable();
      const generation = current.replacementTransaction.begin(signal);
      current.replacing = true;
      let promise: Promise<void>;
      promise = operation(generation).finally(() => {
        generation.finish();
        current.replacementPromises.delete(promise);
        current.replacing = current.replacementPromises.size > 0 || current.replacementTransaction.active;
      });
      current.replacementPromises.add(promise);
      return promise;
    };
    let publishedResource: WaterCompiledResource | undefined;
    let publishedResourcePort: WaterCompiledResourceReadPort | undefined;
    let publishedResourceDataSnapshot: unknown;
    const readResource = (): WaterCompiledResourceReadPort | undefined => {
      const resource = current.state.resource;
      if (!resource) return undefined;
      if (publishedResource === resource && publishedResourcePort) return publishedResourcePort;
      publishedResourceDataSnapshot = undefined;
      const requireCurrent = (): WaterCompiledResource => {
        requireActive();
        if (current.state.resource !== resource) {
          throw new Error(`Water body '${current.prepared.body.id}' resource view belongs to a retired generation.`);
        }
        return resource;
      };
      const port = Object.create(null) as Record<PropertyKey, unknown>;
      for (const key of [
        "identity",
        "spatialFieldIdentity",
        "data",
        "memory",
        "referenceCount",
        "isDisposed",
        "disposeRequested"
      ] as const) {
        Object.defineProperty(port, key, {
          enumerable: true,
          get: () => {
            const currentResource = requireCurrent();
            if (key !== "data") return currentResource[key];
            return (publishedResourceDataSnapshot ??= createWaterCompiledDataSnapshot(currentResource.data));
          }
        });
      }
      publishedResource = resource;
      publishedResourcePort = Object.freeze(port) as WaterCompiledResourceReadPort;
      return publishedResourcePort;
    };
    const bodyReadPort = createWaterBodyRuntimeReadPort(() => {
      requireActive();
      return current.prepared.body;
    });
    handle = Object.freeze({
      get body() {
        return bodyReadPort;
      },
      get instance() {
        return current.state.resolvedInstance?.instance;
      },
      get effectiveState() {
        return current.state.effectiveSnapshot;
      },
      get resource() {
        return readResource();
      },
      get development() {
        const backendDevelopment = current.state.runtime?.development;
        if (current.state.developmentRuntime === undefined) return backendDevelopment;
        return Object.freeze({
          ...backendDevelopment,
          backendId: backendDevelopment?.backendId ?? current.prepared.body.resolvedBackendId,
          runtime: current.state.developmentRuntime
        });
      },
      get active() {
        return active;
      },
      get visible() {
        return current.visible;
      },
      get queryEnabled() {
        return current.interaction.query;
      },
      get buoyancyEnabled() {
        return current.interaction.buoyancy;
      },
      get wakeEnabled() {
        return current.interaction.wake;
      },
      inspect: () => this._inspectActivation(current, active),
      setVisible: (nextVisible: boolean) => {
        requireActive();
        if (current.visible === nextVisible) return;
        requireMutable();
        const previousVisible = current.visible;
        this._setVisibility(current, nextVisible);
        if (current.visible !== previousVisible) {
          current.revision++;
        }
      },
      setQueryEnabled: (enabled: boolean) => {
        requireMutable();
        if (
          this._setInteraction(
            current,
            freezeInteraction({
              ...current.interaction,
              query: enabled
            })
          )
        ) {
          current.revision++;
        }
      },
      setBuoyancyEnabled: (enabled: boolean) => {
        requireMutable();
        if (
          this._setInteraction(
            current,
            freezeInteraction({
              ...current.interaction,
              buoyancy: enabled
            })
          )
        ) {
          current.revision++;
        }
      },
      setWakeEnabled: (enabled: boolean) => {
        requireMutable();
        if (
          this._setInteraction(
            current,
            freezeInteraction({
              ...current.interaction,
              wake: enabled
            })
          )
        ) {
          current.revision++;
        }
      },
      refreshCameraVisibility: (provider: WaterCameraVisibilityProvider) => {
        // Current Camera visibility is sampled before the shared reflection service
        // resolves this frame, while replacement staging keeps the committed runtime live.
        requireActive();
        current.state.runtime?.refreshCameraVisibility?.(provider);
      },
      refreshTerrainOcclusion: (provider?: WaterTerrainOcclusionProvider) => {
        requireActive();
        current.state.runtime?.refreshTerrainOcclusion?.(provider);
      },
      refreshReflectionBinding: () => {
        // Replacement staging leaves the committed runtime active. A render
        // tick may safely refresh that binding while the new runtime prepares.
        requireActive();
        current.state.runtime?.refreshReflectionBinding?.();
        this._synchronizeEffectiveReflectionSnapshot(current);
      },
      refreshAuthoring: (options: WaterBodyReplacementOptions = {}) =>
        beginUpdate(this._combineWithLifetimeSignal(options.signal), (generation) => {
          const operation = () =>
            this._refreshActivationAuthoring(
              current,
              { ...options, signal: generation.signal },
              () => active,
              generation
            );
          return this._developmentObservers.size === 0 ? operation() : this._runDevelopmentUpdate(handle, operation);
        }),
      refreshEnvironment: (options: WaterBodyReplacementOptions = {}) =>
        beginUpdate(this._combineWithLifetimeSignal(options.signal), (generation) => {
          const operation = () =>
            this._refreshActivationEnvironment(
              current,
              { ...options, signal: generation.signal },
              () => active,
              generation
            );
          return this._developmentObservers.size === 0 ? operation() : this._runDevelopmentUpdate(handle, operation);
        }),
      prepareAuthoringRefresh: async (
        look: Readonly<WaterLookAuthoringSnapshot>,
        options: WaterBodyReplacementOptions = {}
      ) => {
        requireMutable();
        if (!this._assets || !current.state.resolvedInstance) {
          throw new WaterBodyLoaderError(
            WaterBodyLoaderErrorCode.AuthoringRegistryUnavailable,
            "$",
            "Prepared Water Look refresh requires a committed authoring registry."
          );
        }
        const operationSignal = this._combineWithLifetimeSignal(options.signal);
        const nextResolved = this._assets.resolve(current.state.resolvedInstance.instance, look);
        const prepared = await this._prepareExplicitEffectiveRefresh(
          current,
          nextResolved,
          { ...options, signal: operationSignal },
          () => active
        );
        return this._wrapPreparedDevelopmentRefresh(handle, prepared);
      },
      prepareEnvironmentRefresh: async (
        environment: Readonly<WaterEnvironmentSnapshot>,
        options: WaterBodyReplacementOptions = {}
      ) => {
        requireMutable();
        const resolved = current.state.resolvedInstance;
        if (!resolved) {
          throw new WaterBodyLoaderError(
            WaterBodyLoaderErrorCode.UpdateUnavailable,
            "$",
            "Prepared Water Environment refresh requires a committed instance."
          );
        }
        const prepared = await this._prepareExplicitEffectiveRefresh(
          current,
          resolved,
          { ...options, signal: this._combineWithLifetimeSignal(options.signal) },
          () => active,
          environment
        );
        return this._wrapPreparedDevelopmentRefresh(handle, prepared);
      },
      update: (update: Readonly<WaterBodyActivationUpdate>, options: WaterBodyReplacementOptions = {}) =>
        beginUpdate(this._combineWithLifetimeSignal(options.signal), (generation) => {
          const operation = () =>
            this._updateActivation(
              current,
              update,
              { ...options, signal: generation.signal },
              () => active,
              generation
            );
          return this._developmentObservers.size === 0 ? operation() : this._runDevelopmentUpdate(handle, operation);
        }),
      replaceInstance: (source: unknown, options: WaterBodyReplacementOptions = {}) =>
        beginUpdate(this._combineWithLifetimeSignal(options.signal), (generation) => {
          const operation = () =>
            this._replaceActivation(
              current,
              source,
              { ...options, signal: generation.signal },
              () => active,
              generation
            );
          return this._developmentObservers.size === 0 ? operation() : this._runDevelopmentUpdate(handle, operation);
        }),
      prepareInstanceReplacement: async (source: unknown, options: WaterBodyReplacementOptions = {}) => {
        requireMutable();
        const operationSignal = this._combineWithLifetimeSignal(options.signal);
        const generation = current.replacementTransaction.begin(operationSignal);
        current.replacing = true;
        let next: Awaited<ReturnType<WaterBodyLoader["_prepareReplacement"]>>;
        let prepared = false;
        const preparation = this._prepareReplacement(current, source, {
          ...options,
          signal: generation.signal
        });
        current.replacementPromises.add(preparation);
        try {
          next = await preparation;
          prepared = true;
          generation.assertCurrent();
          if (!active) {
            throw new WaterBodyLoaderError(
              WaterBodyLoaderErrorCode.HandleInactive,
              "$",
              `Water body '${current.prepared.body.id}' was destroyed while replacement was preparing.`
            );
          }
        } catch (error) {
          let rollbackError: unknown;
          if (prepared) {
            try {
              await this._rollback(next!.state);
            } catch (caught) {
              rollbackError = caught;
            }
          }
          generation.finish();
          current.replacementPromises.delete(preparation);
          current.replacing = current.replacementPromises.size > 0 || current.replacementTransaction.active;
          if (rollbackError) {
            throw new WaterMutationRollbackError(
              [error, rollbackError],
              "Prepared WaterBody replacement was rejected and rollback reported an additional error."
            );
          }
          throw error;
        }
        current.replacementPromises.delete(preparation);
        let staged = true;
        let publication: WaterBodyReplacementPublication | undefined;
        let cleanupPromise: Promise<void> | undefined;
        let publicationSettled = false;
        const finish = (): void => {
          generation.signal.removeEventListener("abort", onSuperseded);
          generation.finish();
          current.replacing = current.replacementPromises.size > 0 || current.replacementTransaction.active;
        };
        const rollback = (): Promise<void> => {
          if (!staged) return cleanupPromise ?? Promise.resolve();
          staged = false;
          cleanupPromise = this._rollback(next.state);
          current.replacementPromises.add(cleanupPromise);
          void cleanupPromise
            .finally(() => {
              current.replacementPromises.delete(cleanupPromise!);
              finish();
            })
            .catch(() => {});
          return cleanupPromise;
        };
        const onSuperseded = (): void => {
          if (!publication) {
            void rollback().catch(() => {});
            return;
          }
          if (publicationSettled) return;
          publicationSettled = true;
          const cleanup = publication.revert();
          current.replacementPromises.add(cleanup);
          void cleanup
            .finally(() => {
              current.replacementPromises.delete(cleanup);
              finish();
            })
            .catch(() => {});
        };
        generation.signal.addEventListener("abort", onSuperseded, { once: true });
        return Object.freeze({
          get active() {
            return staged;
          },
          commit: () => {
            if (!staged) throw new Error(`Prepared Water body '${current.prepared.body.id}' is inactive.`);
            generation.assertCurrent();
            staged = false;
            try {
              publication = this._commitReplacement(current, next);
              this._refreshDevelopmentTarget(handle);
            } catch (error) {
              // _commitReplacement restores the prior visible/query generation
              // synchronously and owns retirement of the rejected staged state.
              // Release this preparation lease as well, so a failed BodySet
              // publication cannot strand the active handle in "replacing".
              publicationSettled = true;
              finish();
              throw error;
            }
          },
          finalize: async () => {
            if (!publication) throw new Error(`Prepared Water body '${current.prepared.body.id}' is not published.`);
            if (publicationSettled) return;
            publicationSettled = true;
            generation.signal.removeEventListener("abort", onSuperseded);
            try {
              await publication.finalize();
            } finally {
              finish();
            }
          },
          revert: async () => {
            if (!publication) return rollback();
            if (publicationSettled) return;
            publicationSettled = true;
            generation.signal.removeEventListener("abort", onSuperseded);
            try {
              await publication.revert();
              this._refreshDevelopmentTarget(handle);
            } finally {
              finish();
            }
          },
          rollback
        });
      },
      destroy: () => {
        if (destroyPromise) return destroyPromise;
        destroyPromise = (async () => {
          if (!active) return;
          active = false;
          this._notifyDevelopmentDetach(handle);
          this._active.delete(handle);
          this._committed.delete(current);
          current.prepared.body.enabled = false;
          current.replacementTransaction.cancel();
          current.state.registration?.destroy();
          current.state.registration = undefined;
          this._releaseCameraLeases(current.state);
          const preparedRefreshCleanup = [...current.preparedEffectiveRefreshes].map((prepared) =>
            prepared.active ? prepared.rollback() : prepared.revert()
          );
          await Promise.allSettled(preparedRefreshCleanup);
          await Promise.allSettled([...current.replacementPromises]);
          await this._rollback(current.state);
        })();
        return destroyPromise;
      }
    });
    this._active.add(handle);
    this._committed.add(current);
    this._notifyDevelopmentAttach(handle);
    return handle;
  }

  private async _runDevelopmentUpdate(
    handle: WaterBodyActivationHandle,
    operation: () => Promise<void>
  ): Promise<void> {
    try {
      await operation();
      this._refreshDevelopmentTarget(handle);
    } catch (error) {
      const target = this._developmentTargets.get(handle);
      if (target) {
        for (const observer of this._developmentObservers) {
          this._invokeDevelopmentObserver(observer, () => observer.reportError?.(target, error));
        }
      }
      throw error;
    }
  }

  private _getDevelopmentTarget(handle: WaterBodyActivationHandle): WaterDevelopmentTarget {
    const existing = this._developmentTargets.get(handle);
    if (existing) return existing;
    const instance = handle.instance;
    const target = Object.freeze({
      handle,
      bodyId: handle.body.id,
      backendId: handle.body.resolvedBackendId,
      bodyKind: handle.body.kind,
      representation: handle.body.representation,
      sourceKind: handle.body.sourceKind,
      development: handle.development,
      lookAuthoring: instance ? this._createLookAuthoringPort?.(instance.lookPresetId) : undefined,
      variants: instance ? (this._assets?.getRuntimeVariants(instance.assetId) ?? Object.freeze([])) : Object.freeze([])
    });
    this._developmentTargets.set(handle, target);
    return target;
  }

  private _notifyDevelopmentAttach(handle: WaterBodyActivationHandle): void {
    if (this._developmentObservers.size === 0) return;
    const target = this._getDevelopmentTarget(handle);
    for (const observer of this._developmentObservers) {
      this._invokeDevelopmentObserver(observer, () => observer.attach(target));
    }
  }

  private _refreshDevelopmentTarget(handle: WaterBodyActivationHandle): void {
    if (this._developmentObservers.size === 0) return;
    const previous = this._developmentTargets.get(handle);
    if (!previous) {
      this._notifyDevelopmentAttach(handle);
      return;
    }
    if (
      previous.development === handle.development &&
      previous.backendId === handle.body.resolvedBackendId &&
      previous.bodyKind === handle.body.kind
    )
      return;
    this._developmentTargets.delete(handle);
    const next = this._getDevelopmentTarget(handle);
    for (const observer of this._developmentObservers) {
      this._invokeDevelopmentObserver(observer, () => observer.replace(previous, next));
    }
  }

  private _notifyDevelopmentDetach(handle: WaterBodyActivationHandle): void {
    const target = this._developmentTargets.get(handle);
    if (!target) return;
    this._developmentTargets.delete(handle);
    for (const observer of this._developmentObservers) {
      this._invokeDevelopmentObserver(observer, () => observer.detach(target));
    }
  }

  private _removeDevelopmentObserver(observer: WaterDevelopmentObserver): void {
    if (!this._developmentObservers.delete(observer)) return;
    for (const target of this._developmentTargets.values()) {
      this._invokeDevelopmentObserver(observer, () => observer.detach(target));
    }
    if (this._developmentObservers.size === 0) this._developmentTargets.clear();
  }

  private _invokeDevelopmentObserver(observer: WaterDevelopmentObserver, operation: () => void): void {
    try {
      operation();
    } catch (error) {
      console.error("[water-development] observer failed.", error);
    }
  }

  private _inspectActivation(
    current: MutableCommittedActivation,
    active: boolean
  ): Readonly<WaterBodyActivationInspection> {
    return this._inspectionStore.capture({
      active,
      visible: current.visible,
      interaction: current.interaction,
      revision: current.revision,
      lastUpdateMode: current.lastUpdateMode,
      body: current.prepared.body,
      registration: current.state.registration,
      resolvedInstance: current.state.resolvedInstance,
      effectiveSnapshot: current.state.effectiveSnapshot,
      resource: current.state.resource,
      resourceLeases: current.state.resourceLeases,
      cameraLeases: current.state.cameraLeases,
      runtime: current.state.runtime,
      capabilityNegotiation: current.state.capabilityNegotiation
    });
  }

  private _setVisibility(current: MutableCommittedActivation, nextVisible: boolean): void {
    if (nextVisible === current.visible) return;
    const prepared = current.prepared;
    const state = current.state;
    if (!prepared.setVisible) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.UpdateUnavailable,
        "$.visible",
        `Water body '${prepared.body.id}' does not expose renderer visibility control.`
      );
    }
    const previousVisible = current.visible;
    const previousResolvedInstance = state.resolvedInstance;
    const previousEffectiveSnapshot = state.effectiveSnapshot;
    const previousCameraLeases = [...state.cameraLeases];
    const reflectionOwnsCameraLeases = state.runtime?.reflection !== undefined;
    let nextCameraLeases: WaterCameraFeatureRequestLease[] = [];
    let rendererTransitionAttempted = false;
    try {
      if (nextVisible && prepared.cameraRequest) {
        nextCameraLeases = this._acquireCameraLeases(prepared.body.id, prepared.cameraRequest);
      }
      rendererTransitionAttempted = true;
      prepared.setVisible(nextVisible);
      if (!reflectionOwnsCameraLeases) {
        if (nextVisible) state.cameraLeases = nextCameraLeases;
        else this._releaseCameraLeases(state);
      }
      current.visible = nextVisible;
      this._updateResolvedVisibility(current, nextVisible);
      this._synchronizeEffectiveInstanceSnapshot(current);
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      current.visible = previousVisible;
      state.resolvedInstance = previousResolvedInstance;
      state.effectiveSnapshot = previousEffectiveSnapshot;

      if (rendererTransitionAttempted) {
        try {
          prepared.setVisible(previousVisible);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }

      if (!reflectionOwnsCameraLeases && nextVisible) {
        state.cameraLeases = previousCameraLeases;
        for (let index = nextCameraLeases.length - 1; index >= 0; index--) {
          try {
            nextCameraLeases[index].destroy();
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
      } else if (!reflectionOwnsCameraLeases && !nextVisible) {
        const previousLeasesRemainActive =
          state.cameraLeases.length === previousCameraLeases.length &&
          state.cameraLeases.every((lease, index) => lease === previousCameraLeases[index] && lease.active);
        if (!previousLeasesRemainActive) {
          for (let index = state.cameraLeases.length - 1; index >= 0; index--) {
            try {
              state.cameraLeases[index].destroy();
            } catch (rollbackError) {
              rollbackErrors.push(rollbackError);
            }
          }
          state.cameraLeases = [];
          if (prepared.cameraRequest && previousVisible) {
            try {
              state.cameraLeases = this._acquireCameraLeases(prepared.body.id, prepared.cameraRequest);
            } catch (rollbackError) {
              rollbackErrors.push(rollbackError);
            }
          }
        }
      }

      if (rollbackErrors.length > 0) {
        throw new WaterMutationRollbackError(
          [error, ...rollbackErrors],
          "WaterBody visibility update failed and rollback reported additional errors."
        );
      }
      throw error;
    }
  }

  private _setInteraction(
    current: MutableCommittedActivation,
    nextInteraction: WaterWorldInteractionChannels
  ): boolean {
    const previousInteraction = current.interaction;
    if (interactionEquals(previousInteraction, nextInteraction)) {
      return false;
    }
    const body = current.prepared.body;
    this._validateInteraction(body, nextInteraction);
    const previousRegistration = current.state.registration;
    const previousResolvedInstance = current.state.resolvedInstance;
    const previousEffectiveSnapshot = current.state.effectiveSnapshot;
    let createdRegistration: WaterWorldRegistration | undefined;
    let registrationReplaced = false;
    let previousRegistrationDetached = false;
    try {
      if (previousRegistration && nextInteraction.query) {
        previousRegistration.replace(body, nextInteraction);
        registrationReplaced = true;
      } else if (previousRegistration) {
        previousRegistration.destroy();
        current.state.registration = undefined;
        previousRegistrationDetached = true;
      } else if (nextInteraction.query) {
        createdRegistration = this._world.register(body, nextInteraction);
        current.state.registration = createdRegistration;
      }
      body.enabled = nextInteraction.query;
      current.interaction = nextInteraction;
      this._updateResolvedInteraction(current, nextInteraction);
      this._synchronizeEffectiveInstanceSnapshot(current);
      return true;
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      if (createdRegistration) {
        try {
          createdRegistration.destroy();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
        current.state.registration = undefined;
      }
      if (registrationReplaced && previousRegistration) {
        try {
          previousRegistration.replace(body, previousInteraction);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (previousRegistrationDetached && previousInteraction.query) {
        try {
          current.state.registration = this._world.register(body, previousInteraction);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      body.enabled = previousInteraction.query;
      current.interaction = previousInteraction;
      current.state.resolvedInstance = previousResolvedInstance;
      current.state.effectiveSnapshot = previousEffectiveSnapshot;
      if (rollbackErrors.length > 0) {
        throw new WaterMutationRollbackError(
          [error, ...rollbackErrors],
          "WaterBody interaction update failed and rollback reported additional errors."
        );
      }
      throw error;
    }
  }

  private _updateResolvedVisibility(current: MutableCommittedActivation, visible: boolean): void {
    const resolved = current.state.resolvedInstance;
    if (!resolved) return;
    current.state.resolvedInstance = Object.freeze({
      ...resolved,
      instance: Object.freeze({
        ...resolved.instance,
        visible
      })
    }) as ResolvedWaterBodyInstance;
  }

  private _updateResolvedInteraction(
    current: MutableCommittedActivation,
    interaction: WaterWorldInteractionChannels
  ): void {
    const resolved = current.state.resolvedInstance;
    if (!resolved) return;
    const nextInteraction = Object.freeze({
      query: interaction.query,
      buoyancy: interaction.buoyancy,
      wake: interaction.wake
    });
    current.state.resolvedInstance = Object.freeze({
      ...resolved,
      instance: Object.freeze({
        ...resolved.instance,
        interaction: nextInteraction
      })
    }) as ResolvedWaterBodyInstance;
  }

  private async _updateActivation(
    current: MutableCommittedActivation,
    update: Readonly<WaterBodyActivationUpdate>,
    options: WaterBodyReplacementOptions,
    isActive: () => boolean,
    generation: WaterActivationGeneration
  ): Promise<void> {
    generation?.assertCurrent();
    const resolved = current.state.resolvedInstance;
    if (!resolved) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.UpdateUnavailable,
        "$",
        "Prepared WaterBody activations do not expose instance updates."
      );
    }
    return this._applyActivationUpdate(current, resolved, update, options, isActive, generation);
  }

  private async _refreshActivationAuthoring(
    current: MutableCommittedActivation,
    options: WaterBodyReplacementOptions,
    isActive: () => boolean,
    generation: WaterActivationGeneration
  ): Promise<void> {
    generation.assertCurrent();
    const previous = current.state.resolvedInstance;
    if (!previous || !this._assets) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.AuthoringRegistryUnavailable,
        "$",
        "WaterBody authoring refresh requires a committed instance and authoring registry."
      );
    }
    const next = this._assets.resolve(previous.instance);
    this._registry.requireBackend(next.asset);
    return this._applyEffectiveStateRefresh(current, previous, next, options, isActive, generation);
  }

  private async _refreshActivationEnvironment(
    current: MutableCommittedActivation,
    options: WaterBodyReplacementOptions,
    isActive: () => boolean,
    generation: WaterActivationGeneration
  ): Promise<void> {
    generation.assertCurrent();
    const resolved = current.state.resolvedInstance;
    if (!resolved) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.UpdateUnavailable,
        "$",
        "WaterBody environment refresh requires a committed instance."
      );
    }
    return this._applyEffectiveStateRefresh(current, resolved, resolved, options, isActive, generation);
  }

  private _wrapPreparedDevelopmentRefresh(
    handle: WaterBodyActivationHandle,
    prepared: PreparedWaterBodyEffectiveRefresh
  ): PreparedWaterBodyEffectiveRefresh {
    return Object.freeze({
      get active() {
        return prepared.active;
      },
      commit: () => {
        try {
          prepared.commit();
          this._refreshDevelopmentTarget(handle);
        } catch (error) {
          for (const observer of this._developmentObservers) {
            this._invokeDevelopmentObserver(observer, () =>
              observer.reportError?.(this._getDevelopmentTarget(handle), error)
            );
          }
          throw error;
        }
      },
      finalize: () => prepared.finalize(),
      revert: () => prepared.revert(),
      rollback: () => prepared.rollback()
    });
  }

  private async _prepareExplicitEffectiveRefresh(
    current: MutableCommittedActivation,
    nextResolved: Readonly<ResolvedWaterBodyInstance>,
    options: WaterBodyReplacementOptions,
    isHandleActive: () => boolean,
    environmentOverride?: Readonly<WaterEnvironmentSnapshot>
  ): Promise<PreparedWaterBodyEffectiveRefresh> {
    const resource = current.state.resource;
    const previousResolved = current.state.resolvedInstance;
    const previousEffective = current.state.effectiveSnapshot;
    const previousActivationRevision = current.revision;
    const previousLastUpdateMode = current.lastUpdateMode;
    if (!resource || !previousResolved || !previousEffective) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.UpdateUnavailable,
        "$",
        "Prepared effective-state refresh requires a committed resource and snapshot."
      );
    }
    current.replacing = true;
    let replacement: Awaited<ReturnType<WaterBodyLoader["_prepareReplacement"]>> | undefined;
    try {
      if (options.signal?.aborted) throw new DOMException("Water effective refresh was aborted.", "AbortError");
      const nextEffective = this._resolveEffectiveSnapshot(
        nextResolved,
        resource,
        previousEffective.revision + 1,
        current.state.runtime?.reflection,
        environmentOverride,
        previousEffective
      );
      const updatePlan = planWaterRuntimeUpdate(previousEffective, nextEffective);
      const runtime = current.state.runtime;
      const updateEffectiveState =
        updatePlan.kind === "uniform-only" &&
        runtime?.updateEffectiveState &&
        canUpdateLookInPlace(previousResolved, nextResolved) &&
        runtime.canUpdateEffectiveState?.(nextEffective) !== false
          ? runtime.updateEffectiveState
          : undefined;
      if (updatePlan.kind !== "none" && !updateEffectiveState) {
        replacement = await this._prepareReplacement(
          current,
          nextResolved.instance,
          options,
          nextResolved,
          environmentOverride
        );
      }
      let active = true;
      let committed = false;
      let settled = false;
      let publication: WaterBodyReplacementPublication | undefined;
      let preparedRefresh!: PreparedWaterBodyEffectiveRefresh;
      const finish = (): void => {
        current.preparedEffectiveRefreshes.delete(preparedRefresh);
        current.replacing =
          current.preparedEffectiveRefreshes.size > 0 ||
          current.replacementPromises.size > 0 ||
          current.replacementTransaction.active;
      };
      preparedRefresh = Object.freeze({
        get active() {
          return active;
        },
        commit: () => {
          if (!active) throw new Error(`Prepared Water refresh '${current.prepared.body.id}' is inactive.`);
          if (!isHandleActive()) {
            throw new WaterBodyLoaderError(
              WaterBodyLoaderErrorCode.HandleInactive,
              "$",
              `Water body '${current.prepared.body.id}' was destroyed before prepared refresh commit.`
            );
          }
          if (options.signal?.aborted) throw new DOMException("Water effective refresh was aborted.", "AbortError");
          if (
            current.revision !== previousActivationRevision ||
            current.state.effectiveSnapshot?.contentHash !== previousEffective.contentHash
          ) {
            throw new Error(`Prepared Water refresh '${current.prepared.body.id}' has a stale base EffectiveSnapshot.`);
          }
          active = false;
          committed = true;
          try {
            if (replacement) {
              publication = this._commitReplacement(current, replacement);
            } else if (updateEffectiveState) {
              updateEffectiveState(nextEffective);
              current.state.resolvedInstance = nextResolved;
              current.state.effectiveSnapshot = nextEffective;
              runtime?.refreshReflectionBinding?.();
              current.revision++;
              current.lastUpdateMode = "runtime-update";
            } else if (updatePlan.kind === "none") {
              current.state.resolvedInstance = nextResolved;
              current.state.effectiveSnapshot = nextEffective;
              current.revision++;
              current.lastUpdateMode = "runtime-update";
            }
          } catch (error) {
            committed = false;
            settled = true;
            if (updateEffectiveState) {
              current.state.resolvedInstance = previousResolved;
              current.state.effectiveSnapshot = previousEffective;
              current.revision = previousActivationRevision;
              current.lastUpdateMode = previousLastUpdateMode;
              try {
                updateEffectiveState(previousEffective);
                runtime?.refreshReflectionBinding?.();
              } catch (rollbackError) {
                finish();
                throw new WaterMutationRollbackError(
                  [error, rollbackError],
                  "Prepared Water effective refresh failed and in-place rollback reported an additional error."
                );
              }
            }
            finish();
            throw error;
          }
        },
        finalize: async () => {
          if (!committed) throw new Error(`Prepared Water refresh '${current.prepared.body.id}' is not committed.`);
          if (settled) return;
          settled = true;
          try {
            await publication?.finalize();
          } finally {
            committed = false;
            finish();
          }
        },
        revert: async () => {
          if (!committed || settled) return;
          settled = true;
          committed = false;
          try {
            if (publication) {
              await publication.revert();
            } else {
              if (updateEffectiveState) {
                updateEffectiveState(previousEffective);
              }
              current.state.resolvedInstance = previousResolved;
              current.state.effectiveSnapshot = previousEffective;
              current.revision = previousActivationRevision;
              current.lastUpdateMode = previousLastUpdateMode;
              if (updateEffectiveState) {
                runtime?.refreshReflectionBinding?.();
              }
            }
          } finally {
            finish();
          }
        },
        rollback: async () => {
          if (!active || settled) return;
          settled = true;
          active = false;
          try {
            if (replacement) await this._rollback(replacement.state);
          } finally {
            finish();
          }
        }
      });
      current.preparedEffectiveRefreshes.add(preparedRefresh);
      return preparedRefresh;
    } catch (error) {
      current.replacing = false;
      if (replacement) {
        try {
          await this._rollback(replacement.state);
        } catch (rollbackError) {
          throw new WaterMutationRollbackError(
            [error, rollbackError],
            "Prepared Water effective refresh failed and staged cleanup reported an additional error."
          );
        }
      }
      throw error;
    }
  }

  private async _applyEffectiveStateRefresh(
    current: MutableCommittedActivation,
    previousResolved: ResolvedWaterBodyInstance,
    nextResolved: ResolvedWaterBodyInstance,
    options: WaterBodyReplacementOptions,
    isActive: () => boolean,
    generation: WaterActivationGeneration
  ): Promise<void> {
    const resource = current.state.resource;
    const previousEffective = current.state.effectiveSnapshot;
    if (!resource || !previousEffective) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.UpdateUnavailable,
        "$",
        "WaterBody effective-state refresh requires a committed compiled resource."
      );
    }
    const nextEffective = this._resolveEffectiveSnapshot(
      nextResolved,
      resource,
      previousEffective.revision + 1,
      current.state.runtime?.reflection,
      undefined,
      previousEffective
    );
    const updatePlan = planWaterRuntimeUpdate(previousEffective, nextEffective);
    if (updatePlan.kind === "none") {
      current.state.resolvedInstance = nextResolved;
      current.state.effectiveSnapshot = nextEffective;
      current.revision++;
      current.lastUpdateMode = "runtime-update";
      return;
    }
    const runtime = current.state.runtime;
    if (
      updatePlan.kind === "uniform-only" &&
      runtime?.updateEffectiveState &&
      canUpdateLookInPlace(previousResolved, nextResolved) &&
      runtime.canUpdateEffectiveState?.(nextEffective) !== false
    ) {
      const updateEffectiveState = runtime.updateEffectiveState;
      const previousTail = current.runtimeUpdateTail;
      const operation = previousTail
        .catch(() => {})
        .then(async () => {
          generation.assertCurrent();
          try {
            await updateEffectiveState(nextEffective);
            generation.assertCurrent();
            current.state.resolvedInstance = nextResolved;
            current.state.effectiveSnapshot = nextEffective;
            runtime.refreshReflectionBinding?.();
            current.revision++;
            current.lastUpdateMode = "runtime-update";
          } catch (error) {
            current.state.resolvedInstance = previousResolved;
            current.state.effectiveSnapshot = previousEffective;
            try {
              await updateEffectiveState(previousEffective);
              runtime.refreshReflectionBinding?.();
            } catch (rollbackError) {
              throw new WaterMutationRollbackError(
                [error, rollbackError],
                "WaterBody shared Look refresh failed and rollback reported an additional error."
              );
            }
            throw error;
          }
        });
      current.runtimeUpdateTail = operation.then(
        () => {},
        () => {}
      );
      await operation;
      return;
    }
    return this._replaceActivation(current, previousResolved.instance, options, isActive, generation);
  }

  private async _applyActivationUpdate(
    current: MutableCommittedActivation,
    resolved: ResolvedWaterBodyInstance,
    update: Readonly<WaterBodyActivationUpdate>,
    options: WaterBodyReplacementOptions,
    isActive: () => boolean,
    generation: WaterActivationGeneration
  ): Promise<void> {
    const instance = resolved.instance;
    const nextInteraction = freezeInteraction({
      query: update.queryEnabled ?? current.interaction.query,
      buoyancy: update.buoyancyEnabled ?? current.interaction.buoyancy,
      wake: update.wakeEnabled ?? current.interaction.wake
    });
    const nextVisible = update.visible ?? current.visible;
    const nextTransform = update.transform ?? instance.transform;
    const lookChanged = update.lookPresetId !== undefined && update.lookPresetId !== instance.lookPresetId;
    const qualityChanged = update.qualityPlanId !== undefined && update.qualityPlanId !== instance.qualityPlanId;
    const transformChanged = !planarTransformEquals(nextTransform, instance.transform);
    const priorityChanged = update.priority !== undefined && update.priority !== instance.priority;
    const visibilityChanged = nextVisible !== current.visible;
    const interactionChanged = !interactionEquals(nextInteraction, current.interaction);
    if (
      !lookChanged &&
      !qualityChanged &&
      !transformChanged &&
      !priorityChanged &&
      !visibilityChanged &&
      !interactionChanged
    ) {
      return;
    }
    if (!lookChanged && !qualityChanged && !transformChanged && !priorityChanged) {
      const previousVisible = current.visible;
      const previousInteraction = current.interaction;
      try {
        if (visibilityChanged) this._setVisibility(current, nextVisible);
        this._setInteraction(current, nextInteraction);
      } catch (error) {
        const rollbackErrors: unknown[] = [];
        try {
          this._setInteraction(current, previousInteraction);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
        try {
          this._setVisibility(current, previousVisible);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
        if (rollbackErrors.length > 0) {
          throw new WaterMutationRollbackError(
            [error, ...rollbackErrors],
            "WaterBody update failed and rollback reported additional errors."
          );
        }
        throw error;
      }
      if (current.visible !== previousVisible || !interactionEquals(current.interaction, previousInteraction)) {
        current.revision++;
        current.lastUpdateMode = undefined;
      }
      return;
    }

    const nextInstance = createWaterBodyInstance({
      ...instance,
      lookPresetId: update.lookPresetId ?? instance.lookPresetId,
      qualityPlanId: update.qualityPlanId ?? instance.qualityPlanId,
      transform: nextTransform,
      visible: nextVisible,
      priority: update.priority ?? instance.priority,
      interaction: nextInteraction
    });
    const changedBackendFields: WaterBackendUpdateField[] = [];
    if (transformChanged) changedBackendFields.push("transform");
    if (qualityChanged) changedBackendFields.push("quality");
    if (priorityChanged) changedBackendFields.push("priority");
    if (changedBackendFields.length > 0) {
      this._assertBackendInstanceUpdateSupported(resolved, nextInstance, changedBackendFields);
    }
    if (
      lookChanged &&
      !qualityChanged &&
      !transformChanged &&
      !priorityChanged &&
      !visibilityChanged &&
      !interactionChanged
    ) {
      const nextResolved = this._assets!.resolve(nextInstance);
      this._registry.requireBackend(nextResolved.asset);
      return this._applyEffectiveStateRefresh(current, resolved, nextResolved, options, isActive, generation);
    }
    return this._replaceActivation(current, nextInstance, options, isActive, generation);
  }

  private _assertBackendInstanceUpdateSupported(
    previous: ResolvedWaterBodyInstance,
    nextInstance: WaterBodyInstance,
    changedFields: readonly WaterBackendUpdateField[]
  ): void {
    if (!this._assets) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.AuthoringRegistryUnavailable,
        "$",
        "WaterBody updates require an authoring asset registry."
      );
    }
    const nextResolved = this._assets.resolve(nextInstance);
    const backend = this._registry.requireBackend(nextResolved.asset);
    if (!backend.checkInstanceUpdate) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.BackendUpdatePolicyUnavailable,
        "$",
        `Water backend '${backend.id}' does not declare instance update support.`
      );
    }
    const decision = backend.checkInstanceUpdate({
      previous,
      next: nextResolved,
      changedFields: Object.freeze([...changedFields])
    });
    if (typeof decision.supported !== "boolean") {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.BackendUpdatePolicyUnavailable,
        "$",
        `Water backend '${backend.id}' returned an invalid instance update support decision.`
      );
    }
    if (!decision.supported) {
      throw new WaterBodyLoaderError(WaterBodyLoaderErrorCode.BackendUpdateUnsupported, decision.path, decision.reason);
    }
  }

  private async _replaceActivation(
    current: MutableCommittedActivation,
    source: unknown,
    options: WaterBodyReplacementOptions,
    isActive: () => boolean,
    generation?: WaterActivationGeneration
  ): Promise<void> {
    generation?.assertCurrent();
    if (!isActive()) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.HandleInactive,
        "$",
        `Water body '${current.prepared.body.id}' is no longer active.`
      );
    }
    const next = await this._prepareReplacement(current, source, options);
    try {
      generation?.assertCurrent();
    } catch (error) {
      await this._rollback(next.state);
      throw error;
    }
    if (!isActive()) {
      await this._rollback(next.state);
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.HandleInactive,
        "$",
        `Water body '${current.prepared.body.id}' was destroyed while replacement was preparing.`
      );
    }
    generation?.assertCurrent();
    const publication = this._commitReplacement(current, next);
    await publication.finalize();
  }

  private async _prepareReplacement(
    current: MutableCommittedActivation,
    source: unknown,
    options: WaterBodyReplacementOptions,
    resolvedOverride?: Readonly<ResolvedWaterBodyInstance>,
    environmentOverride?: Readonly<WaterEnvironmentSnapshot>
  ): Promise<{
    readonly state: MutableActivationState;
    readonly prepared: WaterBodyActivationCommit;
  }> {
    if (!this._assets) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.AuthoringRegistryUnavailable,
        "$",
        "WaterBody replacement requires an authoring asset registry."
      );
    }
    const resolved =
      resolvedOverride ?? this._resolveInstance(source, "Replacement WaterBody instance", options.assetOverride);
    if (resolved.instance.id !== current.prepared.body.id) {
      throw new WaterBodyLoaderError(
        WaterBodyLoaderErrorCode.ReplacementIdentityMismatch,
        "$.id",
        `Replacement instance id '${resolved.instance.id}' must match active body '${current.prepared.body.id}'.`
      );
    }
    const runtimeContext = options.runtimeContext ?? current.state.runtimeContext;
    const providerContext = options.providerContext ?? current.state.providerContext;
    const developmentRuntime = options.developmentRuntime ?? current.state.developmentRuntime;
    const state: MutableActivationState = {
      cameraLeases: [],
      resourceLeases: [],
      resolvedInstance: resolved,
      runtimeContext,
      providerContext,
      developmentRuntime
    };
    try {
      this._assertAvailable();
      throwIfAborted(options.signal);
      const backend = this._registry.requireBackend(resolved.asset);
      this._assertBackendCameraCount(backend, resolved.instance.id);
      let resolvedSource: unknown;
      if (resolved.asset.source.kind === WaterBodySourceKind.TerrainRegion) {
        if (!this._providers) {
          throw new WaterBodyLoaderError(
            WaterBodyLoaderErrorCode.ProviderRegistryUnavailable,
            "$.asset.source.providerId",
            "Terrain-region WaterBody sources require a registered provider registry."
          );
        }
        resolvedSource = await this._providers.resolve(resolved.asset.source, {
          resolved,
          providerContext,
          signal: options.signal
        });
      } else {
        resolvedSource = backend.resolveAsset
          ? await backend.resolveAsset(resolved.asset, {
              authoringVersion: 2,
              signal: options.signal,
              resolvedInstance: resolved
            })
          : resolved.asset.source;
      }
      this._assertAvailable();
      throwIfAborted(options.signal);
      state.compiledLease = await this._acquireCompiledResource(
        resolved.asset,
        resolvedSource,
        backend,
        options.signal,
        resolved
      );
      const resource = state.compiledLease.resource;
      state.resource = resource;
      state.effectiveSnapshot = this._resolveEffectiveSnapshot(resolved, resource, 0, undefined, environmentOverride);
      if (resolved.resources.length > 0) {
        if (!this._resources) {
          throw new WaterBodyLoaderError(
            WaterBodyLoaderErrorCode.ResourceRegistryUnavailable,
            "$.resources",
            "Resolved WaterBody resources require a runtime resource registry."
          );
        }
        await this._leaseCoordinator.acquireRuntimeResourcesInto(state.resourceLeases, resolved.resources, {
          signal: options.signal,
          runtimeContext
        });
      }
      const runtime = await backend.createRuntime(resource, {
        authoringVersion: 2,
        runtimeContext,
        signal: options.signal,
        effectiveSnapshot: state.effectiveSnapshot,
        resourceLeases: Object.freeze([...state.resourceLeases]),
        reflection: this._reflection,
        activationMode: "replacement-staging"
      });
      state.runtime = runtime;
      this._assertAvailable();
      throwIfAborted(options.signal);
      this._validateResolvedRuntime(runtime.body, resolved, backend.id);
      this._validateSpatialFieldIdentity(runtime.body, resource);
      const negotiated = createNegotiatedWaterBodyRuntime(runtime.body, capabilityRequirements(resolved));
      state.capabilityNegotiation = negotiated.negotiation;
      if (runtime.reflection) {
        this._attachReflectionCameraOwnership(runtime.reflection, state, resolved, runtime.cameraRequestOverrides);
      }
      await this._synchronizeInitialEffectiveSnapshot(state, resolved, resource, environmentOverride);
      this._validateInteraction(negotiated.body, resolved.instance.interaction);
      if (resolved.instance.visible && !runtime.setVisible) {
        throw new WaterBodyLoaderError(
          WaterBodyLoaderErrorCode.UpdateUnavailable,
          "$.visible",
          `Water body '${negotiated.body.id}' does not expose renderer visibility control.`
        );
      }
      return {
        state,
        prepared: {
          body: negotiated.body,
          resource,
          cameraRequest: runtime.reflection
            ? undefined
            : applyCameraRequestOverrides(
                deriveWaterCameraFeatureRequest(resolved, {
                  cameraProvidersAvailable: this._cameraFeatures.length > 0,
                  ssrEligible: false
                }),
                runtime.cameraRequestOverrides
              ),
          registerInWorld: resolved.instance.interaction.query,
          interaction: resolved.instance.interaction,
          visible: resolved.instance.visible,
          setVisible: runtime.setVisible,
          destroyRuntime: () => runtime.destroy()
        }
      };
    } catch (error) {
      this._failedActivationCount++;
      try {
        await this._rollback(state);
      } catch (rollbackError) {
        throw new WaterMutationRollbackError(
          [error, rollbackError],
          "WaterBody replacement preparation failed and rollback reported an additional error."
        );
      }
      throw error;
    }
  }

  private _commitReplacement(
    current: MutableCommittedActivation,
    next: {
      readonly state: MutableActivationState;
      readonly prepared: WaterBodyActivationCommit;
    }
  ): WaterBodyReplacementPublication {
    const previousState = current.state;
    const previousPrepared = current.prepared;
    const previousInteraction = current.interaction;
    const previousVisible = current.visible;
    const previousRevision = current.revision;
    const previousLastUpdateMode = current.lastUpdateMode;
    const nextVisible = next.prepared.visible ?? true;
    const nextInteraction = resolvePreparedInteraction(next.prepared);
    const previousRegistration = previousState.registration;
    let routedRegistration: WaterWorldRegistration | undefined;
    let registrationTransition: "none" | "replaced" | "created" | "detached" = "none";
    let runtimeReplacementCommitted = false;
    try {
      this._validateInteraction(next.prepared.body, nextInteraction);
      if (next.prepared.cameraRequest && nextVisible) {
        next.state.cameraLeases = this._acquireCameraLeases(next.prepared.body.id, next.prepared.cameraRequest);
      }
      next.prepared.body.enabled = nextInteraction.query;
      if (previousRegistration && nextInteraction.query) {
        previousRegistration.replace(next.prepared.body, nextInteraction);
        routedRegistration = previousRegistration;
        registrationTransition = "replaced";
      } else if (previousRegistration) {
        previousRegistration.destroy();
        previousState.registration = undefined;
        registrationTransition = "detached";
      } else if (nextInteraction.query) {
        routedRegistration = this._world.register(next.prepared.body, nextInteraction);
        registrationTransition = "created";
      }
      previousPrepared.body.enabled = false;
      if (nextVisible) {
        if (!next.prepared.setVisible) {
          throw new WaterBodyLoaderError(
            WaterBodyLoaderErrorCode.UpdateUnavailable,
            "$.visible",
            `Water body '${next.prepared.body.id}' does not expose renderer visibility control.`
          );
        }
        next.prepared.setVisible(true);
      } else {
        next.prepared.setVisible?.(false);
      }
      if (next.state.runtime?.commitReplacement) {
        next.state.runtime.commitReplacement();
        runtimeReplacementCommitted = true;
      }
      next.state.runtime?.refreshReflectionBinding?.();
    } catch (error) {
      this._failedActivationCount++;
      const rollbackErrors: unknown[] = [];

      // Restore the committed gameplay route synchronously before beginning
      // asynchronous staged-runtime cleanup. In particular, a slow
      // `runtime.destroy()` must never leave the same-id body unqueryable.
      if (registrationTransition === "replaced" && previousRegistration) {
        previousPrepared.body.enabled = previousInteraction.query;
        try {
          previousRegistration.replace(previousPrepared.body, previousInteraction);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      } else if (registrationTransition === "created") {
        try {
          routedRegistration?.destroy();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      } else if (registrationTransition === "detached" && previousInteraction.query) {
        previousPrepared.body.enabled = true;
        try {
          previousState.registration = this._world.register(previousPrepared.body, previousInteraction);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (runtimeReplacementCommitted) {
        try {
          previousState.runtime?.restoreReplacement?.();
          previousState.runtime?.refreshReflectionBinding?.();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      previousPrepared.body.enabled = previousInteraction.query;
      next.prepared.body.enabled = false;
      const stagedCleanup = this._rollback(next.state).catch((rollbackError) => {
        console.error("[water-body-loader] failed replacement staged cleanup also failed", rollbackError);
      });
      this._retiredCleanup.add(stagedCleanup);
      void stagedCleanup.finally(() => this._retiredCleanup.delete(stagedCleanup));
      if (rollbackErrors.length > 0) {
        throw new WaterMutationRollbackError(
          [error, ...rollbackErrors],
          "WaterBody atomic replacement failed and rollback reported additional errors."
        );
      }
      throw error;
    }

    next.state.registration = routedRegistration;
    previousState.registration = undefined;
    current.state = next.state;
    current.prepared = next.prepared;
    current.visible = nextVisible;
    current.interaction = nextInteraction;
    current.revision++;
    // The replacement is one committed transaction. Reflection availability is
    // folded into the same EffectiveSnapshot and must not advance the public
    // activation revision a second time.
    this._synchronizeEffectiveReflectionSnapshot(current, false);
    current.lastUpdateMode =
      previousState.resource &&
      next.state.resource &&
      (previousState.resource.identity.sourceHash !== next.state.resource.identity.sourceHash ||
        previousState.resource.identity.compiledHash !== next.state.resource.identity.compiledHash)
        ? "recompile"
        : "runtime-update";
    const publicationRevision = current.revision;
    previousPrepared.body.enabled = false;
    let publicationActive = true;
    const scheduleCleanup = (state: MutableActivationState, label: string): Promise<void> => {
      const cleanup = this._rollback(state).catch((cleanupError) => {
        console.error(`[water-body-loader] ${label} cleanup failed`, cleanupError);
      });
      this._retiredCleanup.add(cleanup);
      void cleanup.finally(() => this._retiredCleanup.delete(cleanup));
      return cleanup;
    };
    const publication: WaterBodyReplacementPublication = Object.freeze({
      finalize: () => {
        if (!publicationActive) return Promise.resolve();
        publicationActive = false;
        try {
          this._releaseCameraLeases(previousState);
        } catch (error) {
          // Retirement failures are diagnostics-only after the visible
          // generation has committed. The coordinator has already cleared
          // every lease it could, and staged cleanup must still run.
          console.error("[water-body-loader] replacement retired Camera lease cleanup failed", error);
        }
        return scheduleCleanup(previousState, "replacement retired runtime");
      },
      revert: async () => {
        if (!publicationActive) return;
        if (current.state !== next.state || current.revision !== publicationRevision) {
          throw new Error(
            `WaterBody replacement publication '${next.prepared.body.id}' is stale and cannot revert a newer generation.`
          );
        }
        publicationActive = false;
        const errors: unknown[] = [];
        const restoreInteraction = this._withdrawn
          ? freezeInteraction({ query: false, buoyancy: false, wake: false })
          : previousInteraction;
        const restoreVisible = !this._withdrawn && previousVisible;
        let restoredRegistration: WaterWorldRegistration | undefined;
        try {
          if (next.state.registration && restoreInteraction.query) {
            next.state.registration.replace(previousPrepared.body, restoreInteraction);
            restoredRegistration = next.state.registration;
          } else if (next.state.registration) {
            next.state.registration.destroy();
          } else if (restoreInteraction.query) {
            restoredRegistration = this._world.register(previousPrepared.body, restoreInteraction);
          }
        } catch (error) {
          errors.push(error);
        }
        next.state.registration = undefined;
        previousState.registration = restoredRegistration;
        try {
          next.prepared.setVisible?.(false);
        } catch (error) {
          errors.push(error);
        }
        try {
          previousPrepared.setVisible?.(restoreVisible);
        } catch (error) {
          errors.push(error);
        }
        try {
          previousState.runtime?.restoreReplacement?.();
          previousState.runtime?.refreshReflectionBinding?.();
        } catch (error) {
          errors.push(error);
        }
        previousPrepared.body.enabled = restoreInteraction.query;
        next.prepared.body.enabled = false;
        current.state = previousState;
        current.prepared = previousPrepared;
        current.visible = restoreVisible;
        current.interaction = restoreInteraction;
        current.revision = previousRevision;
        current.lastUpdateMode = previousLastUpdateMode;
        this._releaseCameraLeases(next.state);
        await scheduleCleanup(next.state, "reverted staged runtime");
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new WaterMutationRollbackError(errors, "WaterBody replacement revert failed.");
      }
    });
    return publication;
  }

  private _attachReflectionCameraOwnership(
    reflection: WaterReflectionBindingLifecycle,
    activationState: MutableActivationState,
    resolved: ResolvedWaterBodyInstance,
    requestOverrides: WaterBackendRuntime["cameraRequestOverrides"]
  ): void {
    let active = true;
    const ownership: WaterReflectionCameraOwnership = {
      setState: (cameraState: Readonly<WaterReflectionCameraOwnershipState>) => {
        const currentResolved = activationState.resolvedInstance ?? resolved;
        if (!active) {
          throw new Error(
            `Water body '${currentResolved.instance.id}' Camera reflection ownership has been destroyed.`
          );
        }
        const derivedRequest =
          !this._withdrawn && cameraState.visible
            ? deriveWaterCameraFeatureRequest(currentResolved, {
                cameraProvidersAvailable: this._cameraFeatures.length > 0,
                reflectionMode: cameraState.mode,
                ssrEligible: cameraState.ssrEligible
              })
            : undefined;
        const demandedRequest =
          derivedRequest && !cameraState.surfaceFieldsRequired
            ? derivedRequest.reflection === "ssr"
              ? Object.freeze({ ...derivedRequest, depthTexture: false, opaqueTexture: false })
              : undefined
            : derivedRequest;
        const requestWithOverrides = applyCameraRequestOverrides(demandedRequest, requestOverrides);
        const request =
          requestWithOverrides?.reflection === "ssr" && this._reflection?.screenSpaceReflection
            ? Object.freeze({
                ...requestWithOverrides,
                screenSpaceReflection: this._reflection.screenSpaceReflection
              })
            : requestWithOverrides;
        const nextLeases = request ? this._acquireCameraLeases(currentResolved.instance.id, request) : [];
        const previousLeases = activationState.cameraLeases;
        activationState.cameraLeases = nextLeases;
        for (let index = previousLeases.length - 1; index >= 0; index--) {
          previousLeases[index].destroy();
        }
      },
      destroy: () => {
        if (!active) return;
        active = false;
        this._releaseCameraLeases(activationState);
      }
    };
    reflection.attachCameraOwnership(ownership);
  }

  private _acquireCameraLeases(bodyId: string, request: WaterCameraFeatureRequest): WaterCameraFeatureRequestLease[] {
    return this._leaseCoordinator.acquireCameraFeatures(bodyId, request);
  }

  private _releaseCameraLeases(state: MutableActivationState): void {
    this._leaseCoordinator.releaseCameraFeatures(state.cameraLeases);
  }

  private _assertBackendCameraCount(backend: WaterBodyBackend, bodyId: string): void {
    const maximum = backend.maximumCameraFeatureCount;
    if (maximum === undefined || this._cameraFeatures.length <= maximum) return;
    throw new Error(
      `Water body '${bodyId}' backend '${backend.id}' supports at most ${maximum} camera feature broker(s); ` +
        `${this._cameraFeatures.length} were provided.`
    );
  }

  private async _rollback(state: MutableActivationState): Promise<void> {
    const errors: unknown[] = [];
    try {
      state.registration?.destroy();
    } catch (error) {
      errors.push(error);
    } finally {
      state.registration = undefined;
    }
    try {
      this._releaseCameraLeases(state);
    } catch (error) {
      errors.push(error);
    }
    try {
      await state.runtime?.destroy();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this._releaseRuntimeResourceLeases(state);
    } catch (error) {
      errors.push(error);
    }
    if (state.compiledLease) {
      try {
        state.compiledLease.release();
      } catch (error) {
        errors.push(error);
      } finally {
        state.resource = undefined;
        state.compiledLease = undefined;
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new WaterMutationRollbackError(errors, "WaterBody rollback cleanup failed.");
  }

  private async _releaseRuntimeResourceLeases(state: MutableActivationState): Promise<void> {
    await this._leaseCoordinator.releaseRuntimeResources(state.resourceLeases);
  }

  private _assertAvailable(): void {
    if (this._destroyed) throw new Error("Water body loader has been destroyed.");
    if (this._withdrawn) throw new Error("DISABLED: Water runtime has been withdrawn.");
  }

  private _combineWithLifetimeSignal(signal: AbortSignal | undefined): AbortSignal {
    return signal ? AbortSignal.any([signal, this._lifetimeAbort.signal]) : this._lifetimeAbort.signal;
  }
}
