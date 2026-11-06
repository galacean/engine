import { createFarmlandsWaterResourceFactories } from "../../resources/river/FarmlandsWaterRuntimeResources";
import { FARMLANDS_DROP_ASSETS } from "../../resources/river/FarmlandsDropAssets";
import { createWaterBackendDiagnosticsAdapter } from "../body/WaterBackendDiagnosticsAdapter";
import { supportsWaterSurfacePicking } from "../surface/WaterSurfacePicking";
import { Camera, type Engine, Entity, Layer, MeshRenderer, type Scene } from "@galacean/engine-core";
import { markWaterSceneMutationSafe } from "../body/WaterMutationFailure";
import { BoundingFrustum, Matrix, type BoundingBox } from "@galacean/engine-math";
import type { WaterBodyAsset } from "../../authoring/body/WaterBodyAsset";
import type { WaterBodySourceV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import { isWaterBodyKind, type WaterBodyKind } from "../../authoring/body/WaterBodyRepresentation";
import { createWaterBodyInstance, type WaterBodyInstance } from "../../authoring/body/WaterBodyInstance";
import {
  computeWaterLookAuthoringContentHash,
  type WaterLookAuthoringSnapshot
} from "../../authoring/surface/WaterLookAuthoringSnapshot";
import type { WaterCompiledResource } from "../../compiler/body/WaterCompiledResource";
import { hashStableValue } from "../../compiler/shared/determinism";
import { createImmutableWaterSnapshot } from "../../authoring/identity/WaterImmutableSnapshot";
import type {
  WaterBackendReflectionContext,
  WaterBodyBackend,
  WaterCameraVisibilityProvider,
  WaterTerrainOcclusionProvider
} from "../body/WaterBackendRegistry";
import { WaterBackendRegistry } from "../body/WaterBackendRegistry";
import { WaterBodyAssetRegistry } from "../body/WaterBodyAssetRegistry";
import {
  WaterBodyLoader,
  type WaterBodyActivationHandle,
  type WaterBodyActivationInspection,
  type WaterBodyActivationUpdate,
  type WaterBodyInstanceLoadOptions,
  type PreparedWaterBodyInstanceActivation,
  type PreparedWaterBodyReplacement,
  type WaterDevelopmentTargetSource,
  type WaterDevelopmentObserver,
  type WaterDevelopmentTarget,
  type WaterDevelopmentHandle
} from "../body/WaterBodyLoader";
import { WaterBodyProviderRegistry, type WaterBodySourceProviderFactory } from "../body/WaterBodyProviderRegistry";
import { WaterWorld } from "../body/WaterWorld";
import type { WaterSurfaceInteractionSink } from "../interaction/WaterSurfaceInteractionSink";
import { createWaterRuntimeInterfacesView, type WaterRuntimeInterfaces } from "../body/WaterRuntimeInterfaces";
import { CameraWaterFeatureBroker, type WaterCameraFeatureRequest } from "../optics/CameraWaterFeatureBroker";
import {
  WaterEnvironmentReflectionProvider,
  type WaterEnvironmentReflectionProviderOptions
} from "../optics/WaterEnvironmentReflectionProvider";
import { WaterReflectionPreRenderSynchronizer } from "../optics/WaterReflectionPreRenderSynchronizer";
import {
  WaterReflectionService,
  type WaterReflectionServiceLease,
  type WaterReflectionServiceOptions
} from "../optics/WaterReflectionService";
import {
  WaterRuntimeResourceRegistry,
  type WaterRuntimeResourceFactory
} from "../resources/WaterRuntimeResourceRegistry";
import type {
  WaterSceneBodyInspection,
  WaterSceneRuntimeDiagnostics,
  WaterSceneRuntimeLifecycleState
} from "./WaterSceneRuntimeDiagnostics";
import type { WaterLookAuthoringPort, WaterLookAuthoringUpdater } from "../state/WaterLookAuthoringPort";
import {
  createWaterEnvironmentSnapshot,
  DEFAULT_WATER_ENVIRONMENT_SNAPSHOT,
  type WaterEnvironmentSnapshot,
  type WaterEnvironmentSnapshotInput
} from "../../authoring/environment/WaterEnvironmentSnapshot";

const MAXIMUM_CONCURRENT_BODY_PREPARATIONS = 6;

async function yieldWaterScenePreparationFrame(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException("Water Scene transaction was aborted.", "AbortError");
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
  if (signal.aborted) throw new DOMException("Water Scene transaction was aborted.", "AbortError");
}

const WATER_AUTHORING_REGISTRATION_KEYS = new Set<PropertyKey>([
  "metrics",
  "getAsset",
  "getAppearancePreset",
  "getOpticsPreset",
  "getLookPreset",
  "getLookAuthoringSnapshot",
  "getReflectionPolicyPreset",
  "getRenderStatePreset",
  "getQualityPlan",
  "getRenderContract",
  "getRuntimeVariants",
  "getResource",
  "registerAsset",
  "replaceAsset",
  "unregisterAsset",
  "registerAppearancePreset",
  "registerOpticsPreset",
  "registerLookPreset",
  "registerReflectionPolicyPreset",
  "registerRenderStatePreset",
  "registerQualityPlan",
  "registerRuntimeVariant",
  "registerResource"
]);

function createWaterDevelopmentAdapterView(adapter: unknown): unknown {
  if (typeof adapter !== "object" || adapter === null) return undefined;
  return createWaterBackendDiagnosticsAdapter(adapter);
}

export interface WaterSceneRuntimeHostReflectionOptions {
  readonly cullingMask: number;
  readonly waterLayerMask?: number;
  readonly screenSpaceReflection?: WaterCameraFeatureRequest["screenSpaceReflection"];
  readonly service?: WaterReflectionServiceOptions;
}

export interface WaterSceneRuntimeHostOptions {
  readonly engine: Engine;
  readonly scene?: Scene;
  readonly camera: Camera;
  readonly root: Entity;
  readonly cacheEntryLimit?: number;
  readonly cacheBudgetBytes?: number;
  readonly waterLayer?: Layer;
  /** Bounds CPU/GPU staging pressure for scenes that prepare several large Bodies at once. */
  readonly maximumConcurrentBodyPreparations?: number;
  /** Lets the renderer present one frame between Body preparation batches. */
  readonly yieldBetweenBodyPreparationBatches?: boolean;
  /** Omit for River Low-only scenes; no Reflection Service or render target is then created. */
  readonly reflection?: WaterSceneRuntimeHostReflectionOptions;
}

export interface WaterSceneBodyRequest {
  readonly bodyId: string;
  readonly asset: WaterBodyAsset;
  readonly instance: WaterBodyInstance;
  readonly createRuntimeContext: (bodyRoot: Entity) => unknown;
  readonly providerContext?: unknown;
  /** Authoring-layer development port published directly by the Host. */
  readonly developmentRuntime?: unknown;
  readonly bodyOrigin?: readonly [x: number, z: number];
  readonly logicalBounds?: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
  readonly profileId?: string;
  readonly profileVersion?: number;
  readonly descriptorSchemaVersion?: number;
  readonly compilerSemanticVersion?: string;
  readonly canonicalDescriptorHash?: string;
  readonly setSurfaceTimeOverride?: (timeSeconds: number | undefined) => void;
}

interface ActiveWaterSceneBody {
  request: WaterSceneBodyRequest;
  handle: WaterBodyActivationHandle;
  readonly root: Entity;
}

export interface WaterSceneBodySetTransaction {
  readonly revision: number;
  readonly active: boolean;
  stage(request: WaterSceneBodyRequest): void;
  remove(bodyId: string): void;
  prepare(signal?: AbortSignal): Promise<PreparedWaterSceneBodySetTransaction>;
  /** Prepares, synchronously publishes, then awaits retired cleanup. */
  commit(signal?: AbortSignal): Promise<void>;
  rollback(): Promise<void>;
}

export interface PublishedWaterSceneBodySet {
  readonly revision: number;
  /** Cleanup is post-publication work and never rolls the visible generation back. */
  readonly retiredCleanup: Promise<void>;
}

export interface PreparedWaterSceneBodySetTransaction {
  readonly revision: number;
  readonly active: boolean;
  /** Contains no await before the visible body-set switch. */
  commit(): PublishedWaterSceneBodySet;
  rollback(): Promise<void>;
}

export interface WaterSceneBodyUpdateRequest {
  readonly bodyId: string;
  readonly update: Readonly<WaterBodyActivationUpdate>;
}

export type { WaterRuntimeInterfaces } from "../body/WaterRuntimeInterfaces";

/** Host-scoped command/query facade. It exposes neither Loader mutation nor compiled-resource ownership. */
export interface WaterSceneBodyHandle {
  readonly bodyId: string;
  readonly instance: WaterBodyActivationHandle["instance"];
  readonly active: boolean;
  readonly visible: boolean;
  readonly queryEnabled: boolean;
  readonly buoyancyEnabled: boolean;
  readonly wakeEnabled: boolean;
  readonly runtimeInterfaces: WaterRuntimeInterfaces;
  inspect(): Readonly<WaterBodyActivationInspection>;
  setVisible(visible: boolean): void;
  setQueryEnabled(enabled: boolean): void;
  setBuoyancyEnabled(enabled: boolean): void;
  setWakeEnabled(enabled: boolean): void;
  refreshReflectionBinding(): void;
  update(update: Readonly<WaterBodyActivationUpdate>, signal?: AbortSignal): Promise<void>;
  replaceInstance(instance: Readonly<WaterBodyInstance>, signal?: AbortSignal): Promise<void>;
  destroy(): Promise<void>;
}

export type WaterEnvironmentSnapshotUpdate = Readonly<Partial<Omit<WaterEnvironmentSnapshotInput, "revision">>>;

export type WaterBodyAssetRegistryReadPort = Readonly<
  Pick<
    WaterBodyAssetRegistry,
    | "metrics"
    | "getAsset"
    | "getLookPreset"
    | "getLookAuthoringSnapshot"
    | "getQualityPlan"
    | "getRenderContract"
    | "getRuntimeVariants"
  >
>;

export type WaterWorldQueryPort = Readonly<Pick<WaterWorld, "metrics" | "bodyMetrics" | "sampleSurface">>;

export interface WaterEnvironmentReflectionProviderHandle {
  readonly id: string;
  readonly inspection: WaterEnvironmentReflectionProvider["inspection"];
  setSource(source: Parameters<WaterEnvironmentReflectionProvider["setSource"]>[0]): void;
  setActive(active: boolean): void;
  destroy(): void;
}

/** Host-owned Backend lifetime. Re-acquiring an installation cancels retirement. */
export interface WaterSceneBackendLease<TBackend extends WaterBodyBackend = WaterBodyBackend> {
  readonly backend: TBackend;
  readonly active: boolean;
  /** Returns true only when this release detached the Backend immediately. */
  release(): boolean;
}

interface WaterSceneBackendInstallation<TBackend extends WaterBodyBackend = WaterBodyBackend> {
  readonly id: string;
  readonly contentHash: string;
  readonly backend: TBackend;
  readonly dispose: () => void;
  referenceCount: number;
  retirementRequested: boolean;
  disposed: boolean;
}

/** Allocation-free current-frame Camera visibility shared by every active Water runtime. */
class SourceCameraWaterVisibilityProvider implements WaterCameraVisibilityProvider {
  private readonly _viewProjection = new Matrix();
  private readonly _frustum = new BoundingFrustum();
  private _cullingMask = 0;
  private _frustumCullingEnabled = true;

  update(camera: Camera): void {
    this._cullingMask = camera.cullingMask;
    this._frustumCullingEnabled = camera.enableFrustumCulling;
    if (!this._frustumCullingEnabled) return;
    Matrix.multiply(camera.projectionMatrix, camera.viewMatrix, this._viewProjection);
    this._frustum.calculateFromMatrix(this._viewProjection);
  }

  isVisible(bounds: BoundingBox, layer: number): boolean {
    return (this._cullingMask & layer) !== 0 && (!this._frustumCullingEnabled || this._frustum.intersectsBox(bounds));
  }
}

/** One Gallery-internal Water composition root for one Scene/Engine instance. */
export class WaterSceneRuntimeHost {
  readonly assets: WaterBodyAssetRegistryReadPort;
  readonly world: WaterWorldQueryPort;
  readonly loader: WaterDevelopmentTargetSource;

  private readonly _assets = new WaterBodyAssetRegistry();
  private readonly _backends = new WaterBackendRegistry();
  private readonly _providers = new WaterBodyProviderRegistry();
  private readonly _world = new WaterWorld();
  private readonly _cameraFeatures: CameraWaterFeatureBroker;
  private readonly _runtimeResources = new WaterRuntimeResourceRegistry();
  private readonly _root: Entity;
  private readonly _loader: WaterBodyLoader;
  private readonly _maximumConcurrentBodyPreparations: number;
  private readonly _yieldBetweenBodyPreparationBatches: boolean;

  private readonly _reflectionServiceLease?: WaterReflectionServiceLease;
  private readonly _reflectionService?: WaterReflectionService;
  private readonly _reflectionUpdater?: WaterReflectionPreRenderSynchronizer;
  private readonly _cameraVisibility = new SourceCameraWaterVisibilityProvider();
  private readonly _environmentProviders = new Map<string, WaterEnvironmentReflectionProvider>();
  private readonly _environmentProviderList: WaterEnvironmentReflectionProvider[] = [];
  private readonly _activeBodies = new Map<string, ActiveWaterSceneBody>();
  private readonly _activeBodyList: ActiveWaterSceneBody[] = [];
  private readonly _bodyHandles = new Map<string, WaterSceneBodyHandle>();
  private readonly _developmentTargetViews = new WeakMap<WaterDevelopmentTarget, WaterDevelopmentTarget>();
  private readonly _registeredAssets = new Map<string, WaterBodyAsset>();
  private readonly _authoringInstallations = new Map<string, Readonly<{ contentHash: string; value: unknown }>>();
  private readonly _providerInstallations = new Map<string, Readonly<{ contentHash: string; providerId: string }>>();
  private readonly _environmentProviderInstallations = new Map<
    string,
    Readonly<{
      source: WaterEnvironmentReflectionProviderOptions["source"];
      handle: WaterEnvironmentReflectionProviderHandle;
    }>
  >();
  private readonly _backendInstallations = new Map<string, WaterSceneBackendInstallation>();
  private readonly _assetPublicationGenerations = new Map<string, number>();
  private readonly _retiredCleanup = new Set<Promise<void>>();
  private _rollbackBarrier: Promise<void> = Promise.resolve();
  private _environmentSnapshot: Readonly<WaterEnvironmentSnapshot> = DEFAULT_WATER_ENVIRONMENT_SNAPSHOT;
  private _terrainOcclusionProvider?: WaterTerrainOcclusionProvider;
  private _mutationTail: Promise<unknown> = Promise.resolve();
  private _mutationRunning = false;
  private _floatingOrigin: readonly [x: number, z: number] = Object.freeze([0, 0]);
  private _lifecycle: WaterSceneRuntimeLifecycleState = "active";
  private _activeSceneRevision = 0;
  private _stagingSceneRevision?: number;
  private _abortedTransactionCount = 0;
  private _staleTransactionCount = 0;
  private _rolledBackTransactionCount = 0;
  private _lastCurrentRevisionError: string | null = null;
  private _destroyPromise?: Promise<void>;
  private _withdrawn = false;

  constructor(options: WaterSceneRuntimeHostOptions) {
    if (!options.camera || !(options.root instanceof Entity)) {
      throw new TypeError("WaterSceneRuntimeHost requires a Camera and Scene-owned root Entity.");
    }
    this._root = options.root.createChild("water-scene-runtime-host");
    const maximumConcurrentBodyPreparations =
      options.maximumConcurrentBodyPreparations ?? MAXIMUM_CONCURRENT_BODY_PREPARATIONS;
    if (
      !Number.isInteger(maximumConcurrentBodyPreparations) ||
      maximumConcurrentBodyPreparations <= 0 ||
      maximumConcurrentBodyPreparations > MAXIMUM_CONCURRENT_BODY_PREPARATIONS
    ) {
      throw new RangeError(
        `Water Scene maximumConcurrentBodyPreparations must be within [1, ${MAXIMUM_CONCURRENT_BODY_PREPARATIONS}].`
      );
    }
    this._maximumConcurrentBodyPreparations = maximumConcurrentBodyPreparations;
    this._yieldBetweenBodyPreparationBatches = options.yieldBetweenBodyPreparationBatches === true;
    this._root.layer = options.waterLayer ?? Layer.Layer30;
    this._cameraFeatures = new CameraWaterFeatureBroker(options.camera);
    const assets = this._assets;
    const world = this._world;
    this.assets = Object.freeze({
      get metrics() {
        return assets.metrics;
      },
      getAsset: (assetId: string) => assets.getAsset(assetId),
      getLookPreset: (id: string) => assets.getLookPreset(id),
      getLookAuthoringSnapshot: (id: string) => assets.getLookAuthoringSnapshot(id),
      getQualityPlan: (id: string) => assets.getQualityPlan(id),
      getRenderContract: (contentHash: string) => assets.getRenderContract(contentHash),
      getRuntimeVariants: (assetId: string) => assets.getRuntimeVariants(assetId)
    });
    this.world = Object.freeze({
      get metrics() {
        return world.metrics;
      },
      get bodyMetrics() {
        return world.bodyMetrics;
      },
      sampleSurface: (...args: Parameters<WaterWorld["sampleSurface"]>) => world.sampleSurface(...args)
    });
    this._cameraFeatures.setViewportSize(options.engine.canvas.width, options.engine.canvas.height);

    let reflectionContext: WaterBackendReflectionContext | undefined;
    if (options.reflection) {
      this._reflectionServiceLease = WaterReflectionService.acquire(
        options.engine,
        this._root,
        options.camera,
        options.reflection.service
      );
      this._reflectionService = this._reflectionServiceLease.service;
      reflectionContext = {
        service: this._reflectionService,
        cullingMask: options.reflection.cullingMask,
        waterLayerMask: options.reflection.waterLayerMask ?? this._root.layer,
        screenSpaceReflection: options.reflection.screenSpaceReflection
      };
      const reflectionUpdater = options.camera.entity.addComponent(WaterReflectionPreRenderSynchronizer);
      this._reflectionUpdater = reflectionUpdater;
      reflectionUpdater.configure({
        sourceCamera: options.camera,
        service: this._reflectionService,
        beforeUpdate: () => {
          this._cameraVisibility.update(options.camera);
          for (let index = 0; index < this._activeBodyList.length; index++) {
            this._activeBodyList[index]!.handle.refreshCameraVisibility?.(this._cameraVisibility);
          }
          for (let index = 0; index < this._environmentProviderList.length; index++) {
            this._environmentProviderList[index]!.refresh();
          }
        },
        afterUpdate: () => {
          for (let index = 0; index < this._activeBodyList.length; index++) {
            this._activeBodyList[index]!.handle.refreshReflectionBinding();
          }
        },
        onError: (error) => {
          this._lastCurrentRevisionError = error instanceof Error ? error.message : String(error);
          console.error("[water-scene-host] reflection update failed", error);
        }
      });
    }

    // Any Look can render a River with drops. Install its lazy default texture factories
    // at the host boundary so standalone hosts and native Water share lease ownership.
    const dropResourceIds = new Set(Object.values(FARMLANDS_DROP_ASSETS).map(({ descriptor }) => descriptor.id));
    for (const factory of createFarmlandsWaterResourceFactories(options.engine)) {
      if (dropResourceIds.has(factory.descriptor.id)) this._runtimeResources.ensureRegistered(factory);
    }

    this._loader = new WaterBodyLoader({
      registry: this._backends,
      world: this._world,
      cameraFeatures: this._cameraFeatures,
      assets: this._assets,
      providers: this._providers,
      resources: this._runtimeResources,
      reflection: reflectionContext,
      createLookAuthoringPort: (lookId) => this._createLookAuthoringPort(lookId),
      readEnvironmentSnapshot: () => this._environmentSnapshot,
      compileCacheEntryLimit: options.cacheEntryLimit,
      compileCacheBudgetBytes: options.cacheBudgetBytes
    });
    const loader = this._loader;
    this.loader = Object.freeze({
      get metrics() {
        return loader.metrics;
      },
      observeDevelopmentTargets: (observer: WaterDevelopmentObserver) =>
        loader.observeDevelopmentTargets({
          attach: (target) => observer.attach(this._adaptDevelopmentTarget(target)),
          replace: (previous, next) =>
            observer.replace(this._adaptDevelopmentTarget(previous), this._adaptDevelopmentTarget(next)),
          detach: (target) => observer.detach(this._adaptDevelopmentTarget(target)),
          reportError: (target, error) => observer.reportError?.(this._adaptDevelopmentTarget(target), error),
          destroy: () => observer.destroy?.()
        })
    });
  }

  registerBackend(backend: WaterBodyBackend): void {
    this._assertActive();
    this._backends.register(backend);
  }

  /**
   * Acquires one deterministic Host-scoped Backend installation. The factory
   * runs only for the first owner; a new owner reuses an installation that is
   * waiting for its last active Body to retire.
   */
  acquireBackend<TBackend extends WaterBodyBackend>(
    installationId: string,
    contentHash: string,
    create: () => Readonly<{ backend: TBackend; dispose: () => void }>
  ): WaterSceneBackendLease<TBackend> {
    this._assertActive();
    if (installationId.trim().length === 0 || contentHash.trim().length === 0) {
      throw new Error("Water backend installation id and content hash must be non-empty.");
    }
    let installation = this._backendInstallations.get(installationId) as
      | WaterSceneBackendInstallation<TBackend>
      | undefined;
    if (installation) {
      if (installation.contentHash !== contentHash) {
        throw new Error(`Water backend installation '${installationId}' cannot change content in place.`);
      }
      if (installation.disposed) {
        throw new Error(`Water backend installation '${installationId}' is already disposed.`);
      }
      if (!this._backends.has(installation.backend.id)) {
        throw new Error(`Water backend installation '${installationId}' lost its managed registry route.`);
      }
      installation.referenceCount++;
      installation.retirementRequested = false;
    } else {
      const created = create();
      try {
        this._backends.register(created.backend);
      } catch (error) {
        created.dispose();
        throw error;
      }
      installation = {
        id: installationId,
        contentHash,
        backend: created.backend,
        dispose: created.dispose,
        referenceCount: 1,
        retirementRequested: false,
        disposed: false
      };
      this._backendInstallations.set(installationId, installation);
    }
    let leaseActive = true;
    const leasedInstallation = installation;
    return Object.freeze({
      backend: leasedInstallation.backend,
      get active() {
        return leaseActive && !leasedInstallation.disposed;
      },
      release: () => {
        if (!leaseActive) return false;
        leaseActive = false;
        return this._releaseBackendInstallation(leasedInstallation);
      }
    });
  }

  unregisterBackend(backendId: string): boolean {
    this._assertActive();
    for (const installation of this._backendInstallations.values()) {
      if (installation.backend.id === backendId && !installation.disposed) {
        throw new Error(
          `Water backend '${backendId}' is managed by installation '${installation.id}' and must be released through its lease.`
        );
      }
    }
    for (const { request } of this._activeBodies.values()) {
      if (this._backends.requireBackend(request.asset).id === backendId) {
        throw new Error(`Water backend '${backendId}' still owns active body '${request.bodyId}'.`);
      }
    }
    return this._backends.unregister(backendId);
  }

  hasBackend(backendId: string): boolean {
    return this._backends.has(backendId);
  }

  assertBackendRoute(asset: Readonly<WaterBodyAsset>): void {
    this._backends.requireBackend(asset);
  }

  registerProvider(provider: WaterBodySourceProviderFactory): void {
    this._assertActive();
    this._providers.register(provider);
  }

  registerProviderOnce(installationId: string, contentHash: string, provider: WaterBodySourceProviderFactory): boolean {
    this._assertActive();
    const existing = this._providerInstallations.get(installationId);
    if (existing !== undefined) {
      if (existing.contentHash !== contentHash || existing.providerId !== provider.id) {
        throw new Error(`Water provider installation '${installationId}' cannot change content in place.`);
      }
      if (this._providers.has(provider.id)) return false;
      this._providerInstallations.delete(installationId);
    }
    this._providers.register(provider);
    this._providerInstallations.set(installationId, Object.freeze({ contentHash, providerId: provider.id }));
    return true;
  }

  unregisterProvider(providerId: string): boolean {
    this._assertActive();
    const removed = this._providers.unregister(providerId);
    if (removed) {
      for (const [installationId, installation] of this._providerInstallations) {
        if (installation.providerId === providerId) this._providerInstallations.delete(installationId);
      }
    }
    return removed;
  }

  registerRuntimeResource(factory: WaterRuntimeResourceFactory): void {
    this._assertActive();
    this._runtimeResources.register(factory);
  }

  ensureRuntimeResource(factory: WaterRuntimeResourceFactory): boolean {
    this._assertActive();
    return this._runtimeResources.ensureRegistered(factory);
  }

  /** Host-scoped immutable authoring composition; retries reuse the exact installation. */
  registerAuthoringOnce<T>(
    installationId: string,
    contentHash: string,
    register: (assets: WaterBodyAssetRegistry) => T
  ): T {
    this._assertActive();
    if (installationId.trim().length === 0 || contentHash.trim().length === 0) {
      throw new TypeError("Water authoring installation id and content hash must be non-empty.");
    }
    const existing = this._authoringInstallations.get(installationId);
    if (existing) {
      if (existing.contentHash !== contentHash) {
        throw new Error(`Water authoring installation '${installationId}' cannot change content in place.`);
      }
      return existing.value as T;
    }
    const value = this.registerAuthoring(register);
    this._authoringInstallations.set(installationId, Object.freeze({ contentHash, value }));
    return value;
  }

  registerAuthoring<T>(register: (assets: WaterBodyAssetRegistry) => T): T {
    this._assertActive();
    const activeAssetIds = new Set([...this._activeBodies.values()].map(({ request }) => request.asset.id));
    let registrationOpen = true;
    const assertRegistrationOpen = (): void => {
      if (!registrationOpen) throw new Error("Water authoring registration window has closed.");
    };
    // Never proxy the real registry: reflective descriptor APIs can bypass a
    // get-only Proxy and retain its internal Maps after revocation.
    const facade = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of WATER_AUTHORING_REGISTRATION_KEYS) {
      if (key === "replaceAsset") {
        facade[key] = (asset: WaterBodyAsset) => {
          assertRegistrationOpen();
          if (activeAssetIds.has(asset.id)) {
            throw new Error(`Active WaterBody asset '${asset.id}' must be replaced through a Host body transaction.`);
          }
          return this._assets.replaceAsset(asset);
        };
        continue;
      }
      if (key === "unregisterAsset") {
        facade[key] = (assetId: string) => {
          assertRegistrationOpen();
          if (activeAssetIds.has(assetId)) {
            throw new Error(`Active WaterBody asset '${assetId}' must be removed through a Host body transaction.`);
          }
          return this._assets.unregisterAsset(assetId);
        };
        continue;
      }
      const value = Reflect.get(this._assets, key, this._assets);
      if (typeof value === "function") {
        facade[key] = (...args: unknown[]) => {
          assertRegistrationOpen();
          return Reflect.apply(value, this._assets, args);
        };
      } else {
        Object.defineProperty(facade, key, {
          enumerable: true,
          configurable: false,
          get: () => {
            assertRegistrationOpen();
            return createImmutableWaterSnapshot(Reflect.get(this._assets, key, this._assets));
          }
        });
      }
    }
    Object.freeze(facade);
    try {
      const result = register(facade as unknown as WaterBodyAssetRegistry);
      if (typeof result === "object" && result !== null && "then" in result) {
        throw new TypeError("Water authoring registration must complete synchronously.");
      }
      return result;
    } finally {
      registrationOpen = false;
    }
  }

  /**
   * Publishes one complete shared Look revision and refreshes every active body
   * that consumes it. Registry and runtimes are rolled back together on error.
   */
  updateLookAuthoring(
    lookId: string,
    updater: WaterLookAuthoringUpdater,
    signal?: AbortSignal
  ): Promise<Readonly<WaterLookAuthoringSnapshot>> {
    this._assertActive();
    return this._enqueueMutation(async () => {
      let safe = true;
      try {
        this._assertActive();
        if (signal?.aborted) throw new DOMException("Water Look update was aborted.", "AbortError");
        const previous = this._requireLookAuthoringSnapshot(lookId);
        const draft = updater(previous);
        if (draft.look.id !== lookId) {
          throw new Error(`Water Look update must preserve id '${lookId}'.`);
        }
        if (computeWaterLookAuthoringContentHash(draft) === previous.contentHash) return previous;
        const consumers = [...this._activeBodies.values()].filter(
          ({ handle }) => handle.instance?.lookPresetId === lookId
        );
        const consumerBodyIds = consumers.map(({ request }) => request.bodyId).sort();
        const preparedLook = this._assets.prepareLookAuthoring(draft, previous.revision);
        safe = false;
        const prepareResults = await Promise.allSettled(
          consumers.map(async (body) => {
            const prepare = body.handle.prepareAuthoringRefresh;
            if (!prepare) throw new Error(`Water body '${body.request.bodyId}' cannot stage a Look refresh.`);
            return Object.freeze({ body, refresh: await prepare(preparedLook, { signal }) });
          })
        );
        const prepareFailures = prepareResults
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map(({ reason }) => reason);
        const prepared = prepareResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
        if (prepareFailures.length > 0) {
          const cleanup = await Promise.allSettled(prepared.map(async ({ refresh }) => refresh.rollback()));
          const cleanupFailures = cleanup
            .filter((result): result is PromiseRejectedResult => result.status === "rejected")
            .map(({ reason }) => reason);
          safe = cleanupFailures.length === 0;
          throw new AggregateError(
            [...prepareFailures, ...cleanupFailures],
            `Water Look '${lookId}' preparation failed.`
          );
        }
        let published: Readonly<WaterLookAuthoringSnapshot> | undefined;
        const committed: typeof prepared = [];
        let finalizationStarted = false;
        try {
          if (signal?.aborted) throw new DOMException("Water Look update was aborted.", "AbortError");
          const currentConsumerBodyIds = [...this._activeBodies.values()]
            .filter(({ handle }) => handle.instance?.lookPresetId === lookId)
            .map(({ request }) => request.bodyId)
            .sort();
          if (hashStableValue(currentConsumerBodyIds) !== hashStableValue(consumerBodyIds)) {
            throw new Error(`Water Look '${lookId}' consumer set changed while its transaction was preparing.`);
          }
          published = this._assets.publishPreparedLookAuthoring(preparedLook, previous.revision);
          for (const entry of prepared) {
            entry.refresh.commit();
            committed.push(entry);
          }
          finalizationStarted = true;
          await Promise.all(committed.map(({ refresh }) => refresh.finalize()));
          return published;
        } catch (error) {
          if (published) this._assets.restoreLookAuthoring(previous);
          const rollbackErrors: unknown[] = [];
          const pendingRollbacks = prepared
            .filter(({ refresh }) => refresh.active)
            .map(async ({ refresh }) => refresh.rollback());
          const committedRollbacks = [...committed].reverse().map(async ({ refresh }) => refresh.revert());
          const rollbackResults = await Promise.allSettled([...pendingRollbacks, ...committedRollbacks]);
          for (const result of rollbackResults) {
            if (result.status === "rejected") rollbackErrors.push(result.reason);
          }
          if (rollbackErrors.length > 0) {
            throw new AggregateError(
              [error, ...rollbackErrors],
              `Water Look '${lookId}' update failed and runtime rollback reported additional errors.`
            );
          }
          // Finalization can retire the previous runtime; a later revert may be a no-op.
          safe = !finalizationStarted;
          throw error;
        }
      } catch (error) {
        if (safe) throw markWaterSceneMutationSafe(error);
        throw error;
      }
    });
  }

  private _createLookAuthoringPort(lookId: string): WaterLookAuthoringPort {
    return Object.freeze({
      lookId,
      read: () => this._requireLookAuthoringSnapshot(lookId),
      update: (updater: WaterLookAuthoringUpdater, signal?: AbortSignal) =>
        this.updateLookAuthoring(lookId, updater, signal)
    });
  }

  private _requireLookAuthoringSnapshot(lookId: string): Readonly<WaterLookAuthoringSnapshot> {
    const snapshot = this._assets.getLookAuthoringSnapshot(lookId);
    if (!snapshot) throw new Error(`Water Look '${lookId}' is not registered.`);
    return snapshot;
  }

  get environmentSnapshot(): Readonly<WaterEnvironmentSnapshot> {
    return this._environmentSnapshot;
  }

  /** Publishes one Scene-owned environment revision and refreshes all effective Water states transactionally. */
  publishEnvironmentSnapshot(
    update: WaterEnvironmentSnapshotUpdate,
    signal?: AbortSignal
  ): Promise<Readonly<WaterEnvironmentSnapshot>> {
    this._assertActive();
    const updateSnapshot = Object.freeze({
      surfaceNormalVariance: update.surfaceNormalVariance
    });
    return this._enqueueMutation(async () => {
      this._assertActive();
      if (signal?.aborted) throw new DOMException("Water environment update was aborted.", "AbortError");
      const previous = this._environmentSnapshot;
      const next = createWaterEnvironmentSnapshot({
        revision: previous.revision + 1,
        surfaceNormalVariance: updateSnapshot.surfaceNormalVariance ?? previous.surfaceNormalVariance
      });
      const bodies = [...this._activeBodies.values()];
      const bodyIds = bodies.map(({ request }) => request.bodyId).sort();
      const prepareResults = await Promise.allSettled(
        bodies.map(async (body) => {
          const prepare = body.handle.prepareEnvironmentRefresh;
          if (!prepare) throw new Error(`Water body '${body.request.bodyId}' cannot stage an Environment refresh.`);
          return Object.freeze({ body, refresh: await prepare(next, { signal }) });
        })
      );
      const prepareFailures = prepareResults
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map(({ reason }) => reason);
      const prepared = prepareResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      if (prepareFailures.length > 0) {
        const cleanup = await Promise.allSettled(prepared.map(({ refresh }) => refresh.rollback()));
        const cleanupFailures = cleanup
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map(({ reason }) => reason);
        throw new AggregateError([...prepareFailures, ...cleanupFailures], "Water Environment preparation failed.");
      }
      let published = false;
      const committed: typeof prepared = [];
      try {
        if (signal?.aborted) throw new DOMException("Water environment update was aborted.", "AbortError");
        const currentBodyIds = [...this._activeBodies.keys()].sort();
        if (hashStableValue(currentBodyIds) !== hashStableValue(bodyIds)) {
          throw new Error("Water Environment consumer set changed while its transaction was preparing.");
        }
        this._environmentSnapshot = next;
        published = true;
        for (const entry of prepared) {
          entry.refresh.commit();
          committed.push(entry);
        }
        await Promise.all(committed.map(({ refresh }) => refresh.finalize()));
        return next;
      } catch (error) {
        if (published) this._environmentSnapshot = previous;
        const rollbackErrors: unknown[] = [];
        const pendingRollbacks = prepared
          .filter(({ refresh }) => refresh.active)
          .map(({ refresh }) => refresh.rollback());
        const committedRollbacks = [...committed].reverse().map(({ refresh }) => refresh.revert());
        const rollbackResults = await Promise.allSettled([...pendingRollbacks, ...committedRollbacks]);
        for (const result of rollbackResults) {
          if (result.status === "rejected") rollbackErrors.push(result.reason);
        }
        if (rollbackErrors.length > 0) {
          throw new AggregateError(
            [error, ...rollbackErrors],
            "Water environment update failed and runtime rollback reported additional errors."
          );
        }
        throw error;
      }
    });
  }

  createEnvironmentReflectionProvider(
    options: Omit<WaterEnvironmentReflectionProviderOptions, "service">
  ): WaterEnvironmentReflectionProviderHandle {
    this._assertActive();
    if (!this._reflectionService) {
      throw new Error("This Water Scene Host was created without Reflection Service capability.");
    }
    if (this._environmentProviders.has(options.id)) {
      throw new Error(`Water environment reflection provider '${options.id}' is already registered.`);
    }
    const provider = new WaterEnvironmentReflectionProvider({ ...options, service: this._reflectionService });
    this._environmentProviders.set(options.id, provider);
    this._environmentProviderList.push(provider);
    const host = this;
    return Object.freeze({
      id: options.id,
      get inspection() {
        return provider.inspection;
      },
      setSource: (source: Parameters<WaterEnvironmentReflectionProvider["setSource"]>[0]) => {
        host._assertEnvironmentProviderOwner(options.id, provider);
        provider.setSource(source);
      },
      setActive: (active: boolean) => {
        host._assertEnvironmentProviderOwner(options.id, provider);
        provider.setActive(active);
      },
      destroy: () => {
        host._removeEnvironmentReflectionProvider(options.id, provider);
      }
    });
  }

  ensureEnvironmentReflectionProvider(
    options: Omit<WaterEnvironmentReflectionProviderOptions, "service">
  ): WaterEnvironmentReflectionProviderHandle {
    this._assertActive();
    const existing = this._environmentProviderInstallations.get(options.id);
    if (existing) {
      if (!this._environmentSourcesEquivalent(existing.source, options.source)) {
        throw new Error(
          `Water environment reflection provider '${options.id}' cannot change source during installation.`
        );
      }
      return existing.handle;
    }
    const handle = this.createEnvironmentReflectionProvider(options);
    this._environmentProviderInstallations.set(options.id, Object.freeze({ source: options.source, handle }));
    return handle;
  }

  removeEnvironmentReflectionProvider(providerId: string): boolean {
    const provider = this._environmentProviders.get(providerId);
    if (!provider) return false;
    return this._removeEnvironmentReflectionProvider(providerId, provider);
  }

  private _assertEnvironmentProviderOwner(providerId: string, provider: WaterEnvironmentReflectionProvider): void {
    this._assertActive();
    if (this._environmentProviders.get(providerId) !== provider) {
      throw new Error(`Water environment reflection provider '${providerId}' is no longer active.`);
    }
  }

  private _removeEnvironmentReflectionProvider(
    providerId: string,
    provider: WaterEnvironmentReflectionProvider
  ): boolean {
    if (this._environmentProviders.get(providerId) !== provider) return false;
    const providerIndex = this._environmentProviderList.indexOf(provider);
    if (providerIndex < 0)
      throw new Error(`Water environment reflection provider '${providerId}' lost its frame slot.`);
    provider.destroy();
    this._environmentProviders.delete(providerId);
    this._environmentProviderInstallations.delete(providerId);
    removeArrayIndex(this._environmentProviderList, providerIndex);
    return true;
  }

  getReflectionMetrics(): Readonly<WaterReflectionService["metrics"]> | undefined {
    return this._reflectionService?.metrics;
  }

  loadBody(request: WaterSceneBodyRequest, signal?: AbortSignal): Promise<WaterSceneBodyHandle> {
    const snapshot = this._snapshotRequest(request);
    return this._enqueueMutation(async () => {
      const revision = Math.max(this._activeSceneRevision + 1, (this._stagingSceneRevision ?? 0) + 1);
      const transaction = this._beginBodySetTransaction(revision, true);
      transaction.stage(snapshot);
      await transaction.commit(signal);
      return this._getOrCreateBodyHandle(snapshot.bodyId);
    });
  }

  async replaceBody(bodyId: string, request: WaterSceneBodyRequest, signal: AbortSignal): Promise<void> {
    if (bodyId !== request.bodyId) throw new Error("Water Scene body replacement must preserve the stable body id.");
    await this.loadBody(request, signal);
  }

  private _adaptDevelopmentTarget(target: WaterDevelopmentTarget): WaterDevelopmentTarget {
    const existing = this._developmentTargetViews.get(target);
    if (existing) return existing;
    const raw = target.handle;
    const interactionSink = raw.body.interactionSink
      ? Object.freeze({
          registerInteraction: (...args: Parameters<WaterSurfaceInteractionSink["registerInteraction"]>) => {
            const current = raw.body.interactionSink;
            if (!current) throw new Error(`Water body '${target.bodyId}' no longer publishes an Interaction sink.`);
            return current.registerInteraction(...args);
          }
        })
      : undefined;
    const handle: WaterDevelopmentHandle = Object.freeze({
      get active() {
        return raw.active;
      },
      get visible() {
        return raw.visible;
      },
      get queryEnabled() {
        return raw.queryEnabled;
      },
      get buoyancyEnabled() {
        return raw.buoyancyEnabled;
      },
      get wakeEnabled() {
        return raw.wakeEnabled;
      },
      get instance() {
        return raw.instance;
      },
      get effectiveState() {
        return raw.effectiveState;
      },
      body: Object.freeze({
        interactionSink,
        get capabilities() {
          return raw.body.capabilities;
        },
        get metrics() {
          return raw.body.metrics;
        }
      }),
      setVisible: (visible: boolean) => this._setBodyVisibility(target.bodyId, visible),
      setQueryEnabled: (enabled: boolean) => this._setBodyInteraction(target.bodyId, "query", enabled),
      setBuoyancyEnabled: (enabled: boolean) => this._setBodyInteraction(target.bodyId, "buoyancy", enabled),
      setWakeEnabled: (enabled: boolean) => this._setBodyInteraction(target.bodyId, "wake", enabled),
      replaceInstance: async (source: unknown) => {
        const instance = createWaterBodyInstance(source as Readonly<WaterBodyInstance>);
        await this.replaceBodyInstance(target.bodyId, () => instance);
      }
    });
    const development = target.development
      ? Object.freeze({
          backendId: target.development.backendId,
          resolvedInstance: target.development.resolvedInstance,
          adapter: createWaterDevelopmentAdapterView(target.development.adapter),
          runtime: target.development.runtime,
          reflection: target.development.reflection
            ? Object.freeze({
                reflectionMode: target.development.reflection.reflectionMode
              })
            : undefined
        })
      : undefined;
    const view = Object.freeze({ ...target, development, handle });
    this._developmentTargetViews.set(target, view);
    return view;
  }

  private readonly _pickRenderers: MeshRenderer[] = [];
  private _pickVisitor?: (bodyId: string, renderer: MeshRenderer) => void;
  private readonly _visitPickBodyBound = this._visitPickBody.bind(this);
  private _visitPickBody(body: ActiveWaterSceneBody, bodyId: string): void {
    if (!body.root.isActiveInHierarchy) return;
    const renderers = this._pickRenderers;
    body.root.getComponentsIncludeChildren(MeshRenderer, renderers);
    for (let i = 0; i < renderers.length; i++) {
      const renderer = renderers[i]!;
      if (!renderer.enabled || !renderer.entity.isActiveInHierarchy) continue;
      const materials = renderer.getMaterials();
      for (let j = 0; j < materials.length; j++) {
        const material = materials[j];
        if (material && supportsWaterSurfacePicking(material)) {
          this._pickVisitor!(bodyId, renderer);
          break;
        }
      }
    }
    renderers.length = 0;
  }
  /** Visits only published surface renderers; staging bodies never participate in editor picking. */
  visitBodyRenderers(visitor: (bodyId: string, renderer: MeshRenderer) => void): void {
    this._pickVisitor = visitor;
    try {
      this._activeBodies.forEach(this._visitPickBodyBound);
    } finally {
      this._pickVisitor = undefined;
      this._pickRenderers.length = 0;
    }
  }

  /** Retrieve the same command facade after a batch transaction, without exposing runtime ownership. */
  getBodyHandle(bodyId: string): WaterSceneBodyHandle | undefined {
    this._assertActive();
    return this._activeBodies.has(bodyId) ? this._getOrCreateBodyHandle(bodyId) : undefined;
  }

  private _getOrCreateBodyHandle(bodyId: string): WaterSceneBodyHandle {
    const existing = this._bodyHandles.get(bodyId);
    if (existing) return existing;
    const requireBody = (): ActiveWaterSceneBody => this._requireBody(bodyId);
    const thisHost = this;
    const handle: WaterSceneBodyHandle = Object.freeze({
      bodyId,
      get instance() {
        return requireBody().handle.instance;
      },
      get active() {
        return thisHost._activeBodies.has(bodyId);
      },
      get visible() {
        return requireBody().handle.visible;
      },
      get queryEnabled() {
        return requireBody().handle.queryEnabled;
      },
      get buoyancyEnabled() {
        return requireBody().handle.buoyancyEnabled;
      },
      get wakeEnabled() {
        return requireBody().handle.wakeEnabled;
      },
      get runtimeInterfaces() {
        return createWaterRuntimeInterfacesView(() => requireBody().handle.body);
      },
      inspect: () => requireBody().handle.inspect(),
      setVisible: (visible: boolean) => this._setBodyVisibility(bodyId, visible),
      setQueryEnabled: (enabled: boolean) => this._setBodyInteraction(bodyId, "query", enabled),
      setBuoyancyEnabled: (enabled: boolean) => this._setBodyInteraction(bodyId, "buoyancy", enabled),
      setWakeEnabled: (enabled: boolean) => this._setBodyInteraction(bodyId, "wake", enabled),
      refreshReflectionBinding: () => {
        this._assertActive();
        requireBody().handle.refreshReflectionBinding();
      },
      update: async (update: Readonly<WaterBodyActivationUpdate>, signal?: AbortSignal) => {
        if (signal?.aborted) throw new DOMException("Water Scene body update was aborted.", "AbortError");
        await this.updateBodySet([{ bodyId, update }]);
      },
      replaceInstance: async (instance: Readonly<WaterBodyInstance>, signal?: AbortSignal) => {
        const snapshot = createWaterBodyInstance(instance);
        await this.replaceBodyInstance(bodyId, () => snapshot, signal);
      },
      destroy: async () => {
        await this.removeBody(bodyId);
      }
    });
    this._bodyHandles.set(bodyId, handle);
    return handle;
  }

  private _setBodyVisibility(bodyId: string, visible: boolean): void {
    this._assertActive();
    if (this._mutationRunning || this._stagingSceneRevision !== undefined) {
      throw new Error("Water Scene mutation owns the visibility boundary.");
    }
    const body = this._requireBody(bodyId);
    body.handle.setVisible(visible);
    const instance = body.handle.instance;
    if (instance) body.request = Object.freeze({ ...body.request, instance });
  }

  private _setBodyInteraction(bodyId: string, channel: "query" | "buoyancy" | "wake", enabled: boolean): void {
    this._assertActive();
    if (this._mutationRunning || this._stagingSceneRevision !== undefined) {
      throw new Error("Water Scene mutation owns the interaction boundary.");
    }
    const body = this._requireBody(bodyId);
    if (channel === "query") body.handle.setQueryEnabled(enabled);
    else if (channel === "buoyancy") body.handle.setBuoyancyEnabled(enabled);
    else body.handle.setWakeEnabled(enabled);
    const instance = body.handle.instance;
    if (instance) body.request = Object.freeze({ ...body.request, instance });
  }

  /** Atomically replaces instance-owned state, including explicit Representation semantics. */
  replaceBodyInstance(
    bodyId: string,
    update: (
      instance: Readonly<WaterBodyInstance>,
      asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>
    ) => Readonly<WaterBodyInstance>,
    signal?: AbortSignal
  ): Promise<void> {
    return this._enqueueMutation(async () => {
      let safe = true;
      try {
        const active = this._requireBody(bodyId);
        const currentInstance = active.handle.instance;
        if (!currentInstance) throw new Error(`Water Scene body '${bodyId}' has no replaceable instance snapshot.`);
        const instance = createWaterBodyInstance(
          update(
            currentInstance,
            createImmutableWaterSnapshot(active.request.asset as WaterBodyAsset<WaterBodySourceV1>)
          )
        );
        if (instance.id !== bodyId || instance.assetId !== active.request.asset.id) {
          throw new Error("Water Scene instance replacement must preserve body and Asset identity.");
        }
        const revision = Math.max(this._activeSceneRevision + 1, (this._stagingSceneRevision ?? 0) + 1);
        const transaction = this._beginBodySetTransaction(revision, true);
        transaction.stage(Object.freeze({ ...active.request, instance }));
        safe = false;
        await transaction.commit(signal);
      } catch (error) {
        if (safe) throw markWaterSceneMutationSafe(error);
        throw error;
      }
    });
  }

  /** Immutable authoring readback for one published body, independent of diagnostics. */
  readBodyLookAuthoring(bodyId: string): Readonly<WaterLookAuthoringSnapshot> | undefined {
    const instance = this._activeBodies.get(bodyId)?.handle.instance;
    return instance ? this._assets.getLookAuthoringSnapshot(instance.lookPresetId) : undefined;
  }

  /** Atomically replaces one active Body's immutable authoring asset while preserving its scene request. */
  replaceBodyAsset(
    bodyId: string,
    update: (asset: Readonly<WaterSceneBodyRequest["asset"]>) => Readonly<WaterSceneBodyRequest["asset"]>,
    signal?: AbortSignal
  ): Promise<void> {
    return this._enqueueMutation(() => this._replaceBodyAsset(bodyId, update, signal));
  }

  private async _replaceBodyAsset(
    bodyId: string,
    update: (asset: Readonly<WaterSceneBodyRequest["asset"]>) => Readonly<WaterSceneBodyRequest["asset"]>,
    signal?: AbortSignal
  ): Promise<void> {
    this._assertActive();
    const active = this._requireBody(bodyId);
    const authoritativeAsset = active.request.asset;
    const asset = createImmutableWaterSnapshot(update(createImmutableWaterSnapshot(authoritativeAsset)));
    if (asset.id !== active.request.asset.id) {
      throw new Error("Water Scene authoring Draft must preserve the active Asset id.");
    }
    if (this._assetsEqual(asset, authoritativeAsset)) return;
    const consumers = [...this._activeBodies.values()].filter((body) => body.request.asset.id === asset.id);
    const revision = Math.max(this._activeSceneRevision + 1, (this._stagingSceneRevision ?? 0) + 1);
    const transaction = this._beginBodySetTransaction(revision, true);
    for (const consumer of consumers) {
      const instance = consumer.handle.instance;
      if (!instance) throw new Error(`Water Scene body '${consumer.request.bodyId}' has no instance snapshot.`);
      transaction.stage(Object.freeze({ ...consumer.request, asset, instance }));
    }
    await transaction.commit(signal);
  }

  beginBodySetTransaction(
    revision = Math.max(this._activeSceneRevision + 1, (this._stagingSceneRevision ?? 0) + 1)
  ): WaterSceneBodySetTransaction {
    return this._beginBodySetTransaction(revision, false);
  }

  private _beginBodySetTransaction(revision: number, ownedByRunningMutation: boolean): WaterSceneBodySetTransaction {
    this._assertActive();
    if (this._mutationRunning && !ownedByRunningMutation) {
      throw new Error("Water Scene Host mutation owns the transaction boundary.");
    }
    if (this._stagingSceneRevision !== undefined) {
      throw new Error(`Water Scene transaction ${this._stagingSceneRevision} is already active.`);
    }
    if (!Number.isSafeInteger(revision) || revision <= this._activeSceneRevision) {
      throw new RangeError("Water Scene transaction revision must be newer than the active revision.");
    }
    const staged = new Map<string, WaterSceneBodyRequest>();
    const removals = new Set<string>();
    let active = true;
    let preparationStarted = false;
    let publicationRollbackFailure: unknown;
    let publicationRolledBack = false;
    this._stagingSceneRevision = revision;
    const requireActive = (): void => {
      this._assertActive();
      if (!active) throw new Error(`Water Scene transaction ${revision} is inactive.`);
    };
    const prepareTransaction = async (signal?: AbortSignal): Promise<PreparedWaterSceneBodySetTransaction> => {
      requireActive();
      if (preparationStarted) throw new Error(`Water Scene transaction ${revision} is already preparing.`);
      preparationStarted = true;
      const prepared: Array<{
        readonly request: WaterSceneBodyRequest;
        readonly root: Entity;
        readonly previous?: ActiveWaterSceneBody;
        readonly activation: PreparedWaterBodyInstanceActivation | PreparedWaterBodyReplacement;
        readonly lookContentHash?: string;
        readonly environmentRevision: WaterEnvironmentSnapshot["revision"];
      }> = [];
      const assetSnapshots = new Map<
        string,
        Readonly<{
          previous?: WaterBodyAsset;
          next: WaterBodyAsset;
        }>
      >();
      const prepareAbort = new AbortController();
      const abortPreparation = (): void => prepareAbort.abort();
      signal?.addEventListener("abort", abortPreparation, { once: true });
      let preparedActive = true;
      const rollbackPrepared = async (): Promise<void> => {
        if (!preparedActive) return;
        preparedActive = false;
        const rollbackResults = await Promise.allSettled(
          prepared.map(async ({ activation, root }) => {
            try {
              await activation.rollback();
            } finally {
              root.destroy();
            }
          })
        );
        if (this._stagingSceneRevision === revision) this._stagingSceneRevision = undefined;
        const rollbackErrors = rollbackResults
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map(({ reason }) => reason);
        if (rollbackErrors.length > 0) {
          throw new AggregateError(rollbackErrors, `Water Scene transaction ${revision} rollback failed.`);
        }
      };
      try {
        if (signal?.aborted) throw new DOMException("Water Scene transaction was aborted.", "AbortError");
        await this._rollbackBarrier;
        if (signal?.aborted) throw new DOMException("Water Scene transaction was aborted.", "AbortError");
        if (this._stagingSceneRevision !== revision) {
          this._staleTransactionCount++;
          throw new DOMException("Water Scene transaction is stale.", "AbortError");
        }
        const stagedAssets = new Map<string, WaterBodyAsset>();
        for (const request of staged.values()) {
          this._validateRequest(request);
          const stagedAsset = stagedAssets.get(request.asset.id);
          if (stagedAsset && !this._assetsEqual(stagedAsset, request.asset)) {
            throw new Error(
              `Water Scene transaction ${revision} contains conflicting definitions for shared asset '${request.asset.id}'.`
            );
          }
          stagedAssets.set(request.asset.id, request.asset);
          if (assetSnapshots.has(request.asset.id)) continue;
          const previous = this._assets.getAsset(request.asset.id);
          if (previous && !this._assetsEqual(previous, request.asset)) {
            const unstagedConsumers = this._assetConsumerIds(request.asset.id).filter(
              (bodyId) => !staged.has(bodyId) && !removals.has(bodyId)
            );
            if (unstagedConsumers.length > 0) {
              throw new Error(
                `Water asset '${request.asset.id}' update omits active consumers: ${unstagedConsumers.join(", ")}.`
              );
            }
          }
          const next = request.asset;
          assetSnapshots.set(request.asset.id, Object.freeze({ previous, next }));
        }

        const stagedRequests = [...staged.values()];
        for (let offset = 0; offset < stagedRequests.length; offset += this._maximumConcurrentBodyPreparations) {
          const batch = stagedRequests.slice(offset, offset + this._maximumConcurrentBodyPreparations);
          const results = await Promise.allSettled(
            batch.map(async (request) => {
              if (prepareAbort.signal.aborted) {
                throw new DOMException("Water Scene transaction was aborted.", "AbortError");
              }
              const previous = this._activeBodies.get(request.bodyId);
              const bodyRoot = this._root.createChild(`body-origin-${request.bodyId}-staging-${revision}`);
              bodyRoot.layer = this._root.layer;
              bodyRoot.isActive = false;
              this._applyRenderOffset(bodyRoot, request.bodyOrigin ?? [0, 0]);
              const options: WaterBodyInstanceLoadOptions = {
                signal: prepareAbort.signal,
                providerContext: request.providerContext,
                developmentRuntime: request.developmentRuntime,
                runtimeContext: request.createRuntimeContext(bodyRoot),
                assetOverride: request.asset
              };
              try {
                const activation = previous
                  ? await (() => {
                      const prepareReplacement = previous.handle.prepareInstanceReplacement;
                      if (!prepareReplacement) {
                        throw new Error(`Water body '${request.bodyId}' does not support Scene transaction staging.`);
                      }
                      return prepareReplacement(request.instance, options);
                    })()
                  : await this._loader.prepareInstance(request.instance, options);
                return {
                  request,
                  root: bodyRoot,
                  previous,
                  activation,
                  lookContentHash: this._assets.getLookAuthoringSnapshot(request.instance.lookPresetId)?.contentHash,
                  environmentRevision: this._environmentSnapshot.revision
                };
              } catch (error) {
                bodyRoot.destroy();
                prepareAbort.abort();
                throw error;
              }
            })
          );
          for (const result of results) {
            if (result.status === "fulfilled") prepared.push(result.value);
          }
          const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
          if (failures.length > 0) {
            throw (
              failures.find(({ reason }) => !(reason instanceof DOMException && reason.name === "AbortError"))
                ?.reason ?? failures[0]!.reason
            );
          }
          if (this._yieldBetweenBodyPreparationBatches && offset + batch.length < stagedRequests.length) {
            await yieldWaterScenePreparationFrame(prepareAbort.signal);
          }
        }
        if (this._stagingSceneRevision !== revision) {
          this._staleTransactionCount++;
          throw new DOMException("Water Scene transaction became stale before commit.", "AbortError");
        }
        active = false;
        return Object.freeze({
          revision,
          get active() {
            return preparedActive;
          },
          commit: (): PublishedWaterSceneBodySet => {
            this._assertActive();
            if (!preparedActive) throw new Error(`Prepared Water Scene transaction ${revision} is inactive.`);
            if (this._stagingSceneRevision !== revision) {
              this._staleTransactionCount++;
              throw new DOMException("Prepared Water Scene transaction is stale.", "AbortError");
            }
            const cleanup: Promise<unknown>[] = [];
            const committed: Array<{
              readonly candidate: (typeof prepared)[number];
              readonly handle: WaterBodyActivationHandle;
              readonly replacement: boolean;
            }> = [];
            const publishedAssetIds: string[] = [];
            try {
              for (const [assetId, snapshot] of assetSnapshots) {
                const current = this._assets.getAsset(assetId);
                const unchanged =
                  current === undefined
                    ? snapshot.previous === undefined
                    : snapshot.previous !== undefined && this._assetsEqual(current, snapshot.previous);
                if (!unchanged) {
                  throw new Error(
                    `Water asset '${assetId}' changed outside the BodySet transaction while it was preparing.`
                  );
                }
              }
              for (const candidate of prepared) {
                const currentLookHash = this._assets.getLookAuthoringSnapshot(
                  candidate.request.instance.lookPresetId
                )?.contentHash;
                if (!candidate.lookContentHash || currentLookHash !== candidate.lookContentHash) {
                  throw new Error(
                    `Water body '${candidate.request.bodyId}' Look changed while its BodySet was preparing.`
                  );
                }
                if (candidate.environmentRevision !== this._environmentSnapshot.revision) {
                  throw new Error(
                    `Water body '${candidate.request.bodyId}' Environment changed while its BodySet was preparing.`
                  );
                }
              }
              for (const [assetId, snapshot] of assetSnapshots) {
                if (snapshot.previous && this._assetsEqual(snapshot.previous, snapshot.next)) {
                  this._registeredAssets.set(assetId, snapshot.previous);
                  continue;
                }
                if (snapshot.previous) this._assets.replaceAsset(snapshot.next);
                else this._assets.registerAsset(snapshot.next);
                this._registeredAssets.set(assetId, snapshot.next);
                this._markAssetPublished(assetId);
                publishedAssetIds.push(assetId);
              }
              for (const candidate of prepared) {
                // Floating Origin is scene-dynamic and may change while a candidate compiles.
                this._applyRenderOffset(candidate.root, candidate.request.bodyOrigin ?? [0, 0]);
                if ("bodyId" in candidate.activation) {
                  const handle = candidate.activation.commit();
                  candidate.root.isActive = true;
                  this._setActiveBody(candidate.request.bodyId, {
                    request: candidate.request,
                    handle,
                    root: candidate.root
                  });
                  committed.push({ candidate, handle, replacement: false });
                } else {
                  candidate.activation.commit();
                  candidate.root.isActive = true;
                  const handle = candidate.previous!.handle;
                  this._setActiveBody(candidate.request.bodyId, {
                    request: candidate.request,
                    handle,
                    root: candidate.root
                  });
                  committed.push({ candidate, handle, replacement: true });
                }
              }
            } catch (error) {
              const committedCandidates = new Set(committed.map(({ candidate }) => candidate));
              const rollbackCleanup = Promise.allSettled([
                ...[...committed].reverse().map(async ({ candidate, handle, replacement }) => {
                  candidate.root.isActive = false;
                  try {
                    if (replacement) {
                      const revertCleanup = (candidate.activation as PreparedWaterBodyReplacement).revert();
                      candidate.previous!.root.isActive = true;
                      this._setActiveBody(candidate.request.bodyId, candidate.previous!);
                      await revertCleanup;
                    } else {
                      this._deleteActiveBody(candidate.request.bodyId);
                      await handle.destroy();
                    }
                  } finally {
                    candidate.root.destroy();
                  }
                }),
                ...prepared
                  .filter((candidate) => !committedCandidates.has(candidate))
                  .map(async (candidate) => {
                    candidate.root.isActive = false;
                    try {
                      if (candidate.activation.active) await candidate.activation.rollback();
                    } finally {
                      candidate.root.destroy();
                    }
                  })
              ]).then((rollbackResults) => {
                const rollbackErrors = rollbackResults
                  .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                  .map(({ reason }) => reason);
                if (rollbackErrors.length === 0) return;
                const rollbackError = new AggregateError(
                  rollbackErrors,
                  `Water Scene transaction ${revision} publication rollback cleanup failed.`
                );
                publicationRollbackFailure = rollbackError;
                this._lastCurrentRevisionError = rollbackError.message;
                console.error("[water-scene-host] publication rollback cleanup failed", rollbackError);
              });
              this._retiredCleanup.add(rollbackCleanup);
              this._rollbackBarrier = rollbackCleanup.then(() => undefined);
              void rollbackCleanup.finally(() => this._retiredCleanup.delete(rollbackCleanup));
              for (let index = publishedAssetIds.length - 1; index >= 0; index--) {
                const assetId = publishedAssetIds[index];
                const snapshot = assetSnapshots.get(assetId)!;
                if (snapshot.previous) {
                  this._assets.replaceAsset(snapshot.previous);
                  this._registeredAssets.set(assetId, snapshot.previous);
                  this._markAssetPublished(assetId);
                } else {
                  this._assets.unregisterAsset(assetId);
                  this._registeredAssets.delete(assetId);
                  this._assetPublicationGenerations.delete(assetId);
                }
              }
              this._stagingSceneRevision = undefined;
              this._lastCurrentRevisionError = error instanceof Error ? error.message : String(error);
              this._rolledBackTransactionCount++;
              preparedActive = false;
              publicationRolledBack = true;
              throw error;
            }
            for (const { candidate, replacement } of committed) {
              if (!replacement) continue;
              const retiredAssetId = candidate.previous!.request.asset.id;
              const retiredAssetGeneration = this._assetPublicationGenerations.get(retiredAssetId);
              cleanup.push(
                (candidate.activation as PreparedWaterBodyReplacement).finalize().finally(() => {
                  candidate.previous!.root.destroy();
                  if (retiredAssetId !== candidate.request.asset.id) {
                    this._retireAssetIfUnreferenced(retiredAssetId, retiredAssetGeneration);
                  }
                })
              );
            }
            for (const bodyId of removals) {
              const body = this._deleteActiveBody(bodyId);
              if (!body) continue;
              this._bodyHandles.delete(bodyId);
              body.root.isActive = false;
              const retiredAssetId = body.request.asset.id;
              const retiredAssetGeneration = this._assetPublicationGenerations.get(retiredAssetId);
              cleanup.push(
                body.handle.destroy().finally(() => {
                  body.root.destroy();
                  this._retireAssetIfUnreferenced(retiredAssetId, retiredAssetGeneration);
                })
              );
            }
            this._activeSceneRevision = revision;
            this._stagingSceneRevision = undefined;
            this._lastCurrentRevisionError = null;
            preparedActive = false;
            const retiredCleanup = Promise.allSettled(cleanup).then((cleanupResults) => {
              this._flushBackendInstallations();
              const cleanupErrors = cleanupResults
                .filter((result): result is PromiseRejectedResult => result.status === "rejected")
                .map(({ reason }) => reason);
              if (cleanupErrors.length === 0) return;
              const cleanupError = new AggregateError(
                cleanupErrors,
                `Water Scene transaction ${revision} published, but retired-resource cleanup failed.`
              );
              this._lastCurrentRevisionError = cleanupError.message;
              console.error("[water-scene-host] retired generation cleanup failed", cleanupError);
            });
            this._retiredCleanup.add(retiredCleanup);
            void retiredCleanup.finally(() => this._retiredCleanup.delete(retiredCleanup));
            return Object.freeze({ revision, retiredCleanup });
          },
          rollback: async () => {
            if (!preparedActive) return;
            await rollbackPrepared();
            this._rolledBackTransactionCount++;
          }
        });
      } catch (error) {
        prepareAbort.abort();
        let rollbackSucceeded = true;
        const failedCurrentRevision = this._stagingSceneRevision === revision;
        if (preparedActive) {
          try {
            await rollbackPrepared();
            this._rolledBackTransactionCount++;
          } catch (rollbackError) {
            rollbackSucceeded = false;
            error = new AggregateError(
              [error, rollbackError],
              `Water Scene transaction ${revision} failed and rollback reported an additional error.`
            );
          }
        }
        if (error instanceof DOMException && error.name === "AbortError") this._abortedTransactionCount++;
        if (failedCurrentRevision) {
          if (this._stagingSceneRevision === revision) this._stagingSceneRevision = undefined;
          this._lastCurrentRevisionError = error instanceof Error ? error.message : String(error);
        }
        active = false;
        if (rollbackSucceeded) throw markWaterSceneMutationSafe(error);
        throw error;
      } finally {
        signal?.removeEventListener("abort", abortPreparation);
      }
    };
    return Object.freeze({
      revision,
      get active() {
        return active;
      },
      stage: (request: WaterSceneBodyRequest) => {
        requireActive();
        if (preparationStarted) throw new Error(`Water Scene transaction ${revision} is already preparing.`);
        const snapshot = this._snapshotRequest(request);
        if (staged.has(snapshot.bodyId)) throw new Error(`Water body '${snapshot.bodyId}' is already staged.`);
        staged.set(snapshot.bodyId, snapshot);
        removals.delete(snapshot.bodyId);
      },
      remove: (bodyId: string) => {
        requireActive();
        if (preparationStarted) throw new Error(`Water Scene transaction ${revision} is already preparing.`);
        staged.delete(bodyId);
        removals.add(bodyId);
      },
      prepare: prepareTransaction,
      commit: async (signal?: AbortSignal) => {
        const prepared = await prepareTransaction(signal);
        try {
          const published = prepared.commit();
          await published.retiredCleanup;
        } catch (error) {
          // A failed synchronous publication may schedule asynchronous rollback
          // of already-published candidates. Do not release the serialized Host
          // mutation until those Loader replacement leases have been retired;
          // otherwise an immediate retry observes a spurious
          // ReplacementInProgress state from the failed generation.
          await Promise.allSettled([...this._retiredCleanup]);
          if (publicationRollbackFailure) {
            throw new AggregateError([error, publicationRollbackFailure], "Water Scene publication rollback failed.");
          }
          // Only the publication catch completing its rollback establishes safety.
          if (publicationRolledBack) throw markWaterSceneMutationSafe(error);
          throw error;
        }
      },
      rollback: async () => {
        if (!active) return;
        active = false;
        if (this._stagingSceneRevision === revision) this._stagingSceneRevision = undefined;
        this._rolledBackTransactionCount++;
      }
    });
  }

  removeBody(bodyId: string): Promise<boolean> {
    return this._enqueueMutation(() => this._removeBody(bodyId));
  }

  private async _removeBody(bodyId: string): Promise<boolean> {
    const body = this._deleteActiveBody(bodyId);
    if (!body) return false;
    this._bodyHandles.delete(bodyId);
    try {
      await body.handle.destroy();
    } finally {
      body.root.destroy();
      this._retireAssetIfUnreferenced(
        body.request.asset.id,
        this._assetPublicationGenerations.get(body.request.asset.id)
      );
      this._flushBackendInstallations();
    }
    return true;
  }

  setVisible(visible: boolean, bodyKind?: WaterBodyKind): void {
    this._assertActive();
    if (bodyKind !== undefined && !isWaterBodyKind(bodyKind)) {
      throw new RangeError(`Unsupported Water body visibility kind '${String(bodyKind)}'.`);
    }
    if (this._mutationRunning || this._stagingSceneRevision !== undefined) {
      throw new Error("Water Scene mutation owns the visibility boundary.");
    }
    const bodies = [...this._activeBodies.values()].filter(
      (body) => bodyKind === undefined || body.request.asset.kind === bodyKind
    );
    const previous = bodies.map((body) => body.handle.visible);
    const changed: number[] = [];
    try {
      for (let index = 0; index < bodies.length; index++) {
        if (previous[index] === visible) continue;
        bodies[index].handle.setVisible(visible);
        changed.push(index);
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (let offset = changed.length - 1; offset >= 0; offset--) {
        const index = changed[offset];
        try {
          bodies[index].handle.setVisible(previous[index]);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "Water Scene visibility update failed and rollback reported additional errors."
        );
      }
      throw error;
    }
    for (const body of bodies) {
      const instance = body.handle.instance;
      if (instance) body.request = Object.freeze({ ...body.request, instance });
    }
  }

  setViewportSize(width: number, height: number): void {
    this._assertActive();
    this._cameraFeatures.setViewportSize(width, height);
  }

  setSurfaceTimeOverride(timeSeconds: number | undefined): void {
    this._assertActive();
    if (timeSeconds !== undefined && !Number.isFinite(timeSeconds)) {
      throw new RangeError("Water surface time must be finite.");
    }
    for (const body of this._activeBodies.values()) body.request.setSurfaceTimeOverride?.(timeSeconds);
  }

  /**
   * Applies one logical update through the same prepare/publish transaction as
   * a Scene body-set switch. No body exposes the new generation until every
   * replacement is prepared, and publication contains no await between bodies.
   */
  updateBodySet(requests: readonly Readonly<WaterSceneBodyUpdateRequest>[]): Promise<void> {
    this._assertActive();
    const seen = new Set<string>();
    const snapshots = Object.freeze(
      requests.map(({ bodyId, update }) => {
        if (seen.has(bodyId)) throw new Error(`Water Scene update contains duplicate body '${bodyId}'.`);
        seen.add(bodyId);
        return Object.freeze({ bodyId, update: this._snapshotActivationUpdate(update) });
      })
    );
    return this._enqueueMutation(async () => {
      const bodies = snapshots.map(({ bodyId }) => this._requireBody(bodyId));
      const nextInstances = snapshots.map(({ update }, index) => {
        const current = bodies[index].handle.instance;
        if (!current) {
          throw new Error(`Water Scene body '${snapshots[index].bodyId}' has no replaceable instance snapshot.`);
        }
        return createWaterBodyInstance({
          ...current,
          lookPresetId: update.lookPresetId ?? current.lookPresetId,
          qualityPlanId: update.qualityPlanId ?? current.qualityPlanId,
          transform: update.transform ?? current.transform,
          visible: update.visible ?? current.visible,
          priority: update.priority ?? current.priority,
          interaction: Object.freeze({
            query: update.queryEnabled ?? current.interaction.query,
            buoyancy: update.buoyancyEnabled ?? current.interaction.buoyancy,
            wake: update.wakeEnabled ?? current.interaction.wake
          })
        });
      });
      const changedIndices = nextInstances.flatMap((next, index) =>
        hashStableValue(next) === hashStableValue(bodies[index].request.instance) ? [] : [index]
      );
      if (changedIndices.length > 0) {
        const revision = Math.max(this._activeSceneRevision + 1, (this._stagingSceneRevision ?? 0) + 1);
        const transaction = this._beginBodySetTransaction(revision, true);
        for (const index of changedIndices) {
          transaction.stage(Object.freeze({ ...bodies[index].request, instance: nextInstances[index] }));
        }
        await transaction.commit();
      }
    });
  }

  private _snapshotActivationUpdate(update: Readonly<WaterBodyActivationUpdate>): Readonly<WaterBodyActivationUpdate> {
    return Object.freeze({
      visible: update.visible,
      queryEnabled: update.queryEnabled,
      buoyancyEnabled: update.buoyancyEnabled,
      wakeEnabled: update.wakeEnabled,
      lookPresetId: update.lookPresetId,
      qualityPlanId: update.qualityPlanId,
      priority: update.priority,
      transform: update.transform
        ? Object.freeze({
            position: Object.freeze([
              update.transform.position[0],
              update.transform.position[1],
              update.transform.position[2]
            ] as const),
            yawDegrees: update.transform.yawDegrees,
            scaleXZ: Object.freeze([update.transform.scaleXZ[0], update.transform.scaleXZ[1]] as const)
          })
        : undefined
    });
  }

  setFloatingOrigin(origin: readonly [x: number, z: number]): void {
    this._assertActive();
    if (!origin.every(Number.isFinite)) throw new RangeError("Water floating origin must contain finite coordinates.");
    this._floatingOrigin = Object.freeze([origin[0], origin[1]] as const);
    for (const body of this._activeBodies.values()) {
      this._applyRenderOffset(body.root, body.request.bodyOrigin ?? [0, 0]);
    }
  }

  /** Installs the active World's shared terrain Horizon, or clears it during World retirement. */
  setTerrainOcclusionProvider(provider?: WaterTerrainOcclusionProvider): void {
    this._assertActive();
    if (provider === this._terrainOcclusionProvider) return;
    this._terrainOcclusionProvider = provider;
    if (!provider) {
      for (const body of this._activeBodies.values()) body.handle.refreshTerrainOcclusion?.(undefined);
    }
  }

  /** Applies the installed World Horizon once; callers choose a frame phase before Camera rendering. */
  refreshTerrainOcclusion(): void {
    this._assertActive();
    const provider = this._terrainOcclusionProvider;
    if (!provider) return;
    for (let index = 0; index < this._activeBodyList.length; index++) {
      this._activeBodyList[index]!.handle.refreshTerrainOcclusion?.(provider);
    }
  }

  getDiagnostics(): WaterSceneRuntimeDiagnostics {
    const bodies: WaterSceneBodyInspection[] = [...this._activeBodies.values()]
      .map(({ request, handle }) => {
        const bodyOrigin = request.bodyOrigin ?? [0, 0];
        const activation = handle.inspect();
        const kind = activation.bodyKind;
        if (!kind || !activation.resolvedBackendId) {
          throw new Error(`Water body '${request.bodyId}' is missing authoritative route inspection.`);
        }
        return Object.freeze({
          bodyId: request.bodyId,
          kind,
          resolvedBackendId: activation.resolvedBackendId,
          assetId: request.asset.id,
          profileId: request.profileId,
          profileVersion: request.profileVersion,
          descriptorSchemaVersion: request.descriptorSchemaVersion,
          compilerSemanticVersion: request.compilerSemanticVersion,
          canonicalDescriptorHash: request.canonicalDescriptorHash,
          logicalBounds: request.logicalBounds,
          bodyOrigin: Object.freeze([bodyOrigin[0], bodyOrigin[1]] as const),
          renderOffset: Object.freeze([
            bodyOrigin[0] - this._floatingOrigin[0],
            bodyOrigin[1] - this._floatingOrigin[1]
          ] as const),
          activation
        });
      })
      .sort((left, right) => left.bodyId.localeCompare(right.bodyId));
    return Object.freeze({
      lifecycle: this._lifecycle,
      activeSceneRevision: this._activeSceneRevision,
      stagingSceneRevision: this._stagingSceneRevision,
      activeBodyCount: bodies.length,
      bodies: Object.freeze(bodies),
      assets: this._assets.metrics,
      providers: this._providers.metrics,
      loader: this._loader.metrics,
      world: this._world.metrics,
      cameraFeatures: this._cameraFeatures.metrics,
      runtimeResources: this._runtimeResources.metrics,
      reflection: this._reflectionService?.metrics ?? null,
      reflectionServiceCreated: this._reflectionService !== undefined,
      environmentProviderCount: this._environmentProviders.size,
      abortedTransactionCount: this._abortedTransactionCount,
      staleTransactionCount: this._staleTransactionCount,
      rolledBackTransactionCount: this._rolledBackTransactionCount,
      lastCurrentRevisionError: this._lastCurrentRevisionError,
      platformValidation: "not-assessed-by-runtime"
    });
  }

  /** @internal Irreversible withdrawal ahead of asynchronous owner destruction. */
  withdrawRuntime(): void {
    if (this._withdrawn || this._lifecycle !== "active") return;
    this._withdrawn = true;
    this._root.isActive = false;
    if (this._reflectionUpdater) this._reflectionUpdater.enabled = false;
    this._loader.withdrawRuntime();
  }

  destroy(): Promise<void> {
    if (this._destroyPromise) return this._destroyPromise;
    this._lifecycle = "destroying";
    this._loader.abortPendingOperations();
    this._destroyPromise = this._destroyOwned();
    return this._destroyPromise;
  }

  private async _destroyOwned(): Promise<void> {
    const errors: unknown[] = [];
    this._stagingSceneRevision = undefined;
    // A mutation that already entered preparation owns staged runtimes until
    // it settles. Wait for that transaction before destroying the Loader so
    // no late runtime can be created after Host lifecycle reaches destroyed.
    await this._mutationTail.catch(() => {});
    try {
      await this._loader.destroy();
    } catch (error) {
      errors.push(error);
    }
    const retiredCleanup = await Promise.allSettled([...this._retiredCleanup]);
    this._retiredCleanup.clear();
    for (const result of retiredCleanup) {
      if (result.status === "rejected") errors.push(result.reason);
    }
    this._activeBodies.clear();
    this._activeBodyList.length = 0;
    this._bodyHandles.clear();
    for (let index = 0; index < this._environmentProviderList.length; index++) {
      const provider = this._environmentProviderList[index]!;
      try {
        provider.destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    this._environmentProviders.clear();
    this._environmentProviderList.length = 0;
    this._environmentProviderInstallations.clear();
    this._reflectionUpdater?.clear();
    this._reflectionUpdater?.destroy();
    try {
      await this._runtimeResources.destroy();
    } catch (error) {
      errors.push(error);
    }
    for (const installation of [...this._backendInstallations.values()]) {
      try {
        this._detachBackendInstallation(installation);
      } catch (error) {
        errors.push(error);
      }
    }
    this._backendInstallations.clear();
    this._world.destroy();
    this._cameraFeatures.destroy();
    this._reflectionServiceLease?.release();
    this._assets.clear();
    this._providers.clear();
    this._authoringInstallations.clear();
    this._providerInstallations.clear();
    this._registeredAssets.clear();
    this._assetPublicationGenerations.clear();
    this._root.destroy();
    this._lifecycle = "destroyed";
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Water Scene Host cleanup reported multiple errors.");
  }

  private _backendHasActiveBody(backendId: string): boolean {
    for (const { request } of this._activeBodies.values()) {
      if (this._backends.requireBackend(request.asset).id === backendId) return true;
    }
    return false;
  }

  private _environmentSourcesEquivalent(
    left: WaterEnvironmentReflectionProviderOptions["source"],
    right: WaterEnvironmentReflectionProviderOptions["source"]
  ): boolean {
    const leftLight = left.ambientLight;
    const rightLight = right.ambientLight;
    return (
      leftLight.specularTexture === rightLight.specularTexture &&
      leftLight.specularIntensity === rightLight.specularIntensity &&
      leftLight.secondarySpecularTexture === rightLight.secondarySpecularTexture &&
      leftLight.specularTextureBlend === rightLight.specularTextureBlend &&
      left.rotationDegrees === right.rotationDegrees &&
      left.exposure === right.exposure &&
      left.hdr === right.hdr &&
      left.readFrame === right.readFrame &&
      hashStableValue(left.projection ?? null) === hashStableValue(right.projection ?? null)
    );
  }

  private _releaseBackendInstallation(installation: WaterSceneBackendInstallation): boolean {
    if (installation.disposed) return false;
    const current = this._backendInstallations.get(installation.id);
    if (current !== installation) return false;
    if (installation.referenceCount < 1) {
      throw new Error(`Water backend installation '${installation.id}' has no active lease to release.`);
    }
    installation.referenceCount--;
    if (installation.referenceCount > 0) return false;
    installation.retirementRequested = true;
    if (this._backendHasActiveBody(installation.backend.id)) return false;
    this._detachBackendInstallation(installation);
    return true;
  }

  private _detachBackendInstallation(installation: WaterSceneBackendInstallation): void {
    if (installation.disposed) return;
    installation.disposed = true;
    installation.retirementRequested = false;
    this._backendInstallations.delete(installation.id);
    this._backends.unregister(installation.backend.id);
    installation.dispose();
  }

  private _flushBackendInstallations(): void {
    for (const installation of [...this._backendInstallations.values()]) {
      if (!installation.retirementRequested || installation.referenceCount > 0) continue;
      if (this._backendHasActiveBody(installation.backend.id)) continue;
      this._detachBackendInstallation(installation);
    }
  }

  private _validateRequest(request: WaterSceneBodyRequest): void {
    if (request.bodyId.trim().length === 0 || request.instance.id !== request.bodyId) {
      throw new Error("Water Scene body request and instance must share one non-empty stable id.");
    }
    if (request.instance.assetId !== request.asset.id) {
      throw new Error(`Water Scene body '${request.bodyId}' instance does not reference its supplied asset.`);
    }
  }

  private _snapshotRequest(request: WaterSceneBodyRequest): Readonly<WaterSceneBodyRequest> {
    return Object.freeze({
      ...request,
      asset: createImmutableWaterSnapshot(request.asset),
      instance: createWaterBodyInstance(request.instance),
      bodyOrigin: request.bodyOrigin
        ? Object.freeze([request.bodyOrigin[0], request.bodyOrigin[1]] as const)
        : undefined,
      logicalBounds: request.logicalBounds ? Object.freeze({ ...request.logicalBounds }) : undefined
    });
  }

  private _applyRenderOffset(root: Entity, bodyOrigin: readonly [number, number]): void {
    root.transform.setPosition(bodyOrigin[0] - this._floatingOrigin[0], 0, bodyOrigin[1] - this._floatingOrigin[1]);
  }

  private _markAssetPublished(assetId: string): void {
    this._assetPublicationGenerations.set(assetId, (this._assetPublicationGenerations.get(assetId) ?? 0) + 1);
  }

  private _assetsEqual(left: Readonly<WaterBodyAsset>, right: Readonly<WaterBodyAsset>): boolean {
    return hashStableValue(left) === hashStableValue(right);
  }

  private _assetConsumerIds(assetId: string): string[] {
    return [...this._activeBodies.values()]
      .filter((body) => body.request.asset.id === assetId)
      .map((body) => body.request.bodyId)
      .sort();
  }

  private _retireAssetIfUnreferenced(assetId: string, expectedPublicationGeneration: number | undefined): void {
    if (!this._registeredAssets.has(assetId)) return;
    if (this._assetPublicationGenerations.get(assetId) !== expectedPublicationGeneration) return;
    for (const body of this._activeBodies.values()) {
      if (body.request.asset.id === assetId) return;
    }
    this._assets.unregisterAsset(assetId);
    this._registeredAssets.delete(assetId);
    this._assetPublicationGenerations.delete(assetId);
  }

  private _requireBody(bodyId: string): ActiveWaterSceneBody {
    this._assertActive();
    const body = this._activeBodies.get(bodyId);
    if (!body) throw new Error(`Water Scene body '${bodyId}' is not active.`);
    return body;
  }

  private _setActiveBody(bodyId: string, body: ActiveWaterSceneBody): void {
    const previous = this._activeBodies.get(bodyId);
    if (previous) {
      const bodyIndex = this._activeBodyList.indexOf(previous);
      if (bodyIndex < 0) throw new Error(`Water Scene body '${bodyId}' lost its frame slot.`);
      this._activeBodies.set(bodyId, body);
      this._activeBodyList[bodyIndex] = body;
      return;
    }
    this._activeBodies.set(bodyId, body);
    this._activeBodyList.push(body);
  }

  private _deleteActiveBody(bodyId: string): ActiveWaterSceneBody | undefined {
    const body = this._activeBodies.get(bodyId);
    if (!body) return undefined;
    const bodyIndex = this._activeBodyList.indexOf(body);
    if (bodyIndex < 0) throw new Error(`Water Scene body '${bodyId}' lost its frame slot.`);
    this._activeBodies.delete(bodyId);
    removeArrayIndex(this._activeBodyList, bodyIndex);
    return body;
  }

  private _enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this._mutationTail
      .catch(() => {})
      .then(async () => {
        this._assertActive();
        if (this._stagingSceneRevision !== undefined) {
          throw new Error(`Water Scene transaction ${this._stagingSceneRevision} owns the mutation boundary.`);
        }
        this._mutationRunning = true;
        try {
          return await operation();
        } finally {
          this._mutationRunning = false;
        }
      });
    this._mutationTail = queued;
    return queued;
  }

  private _assertActive(): void {
    if (this._withdrawn) throw new Error("DISABLED: Water Host has been withdrawn.");
    if (this._lifecycle !== "active") throw new Error(`Water Scene Host is ${this._lifecycle}.`);
  }
}

function removeArrayIndex<T>(items: T[], index: number): void {
  for (let sourceIndex = index + 1; sourceIndex < items.length; sourceIndex++) {
    items[sourceIndex - 1] = items[sourceIndex]!;
  }
  items.length--;
}
