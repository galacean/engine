import { retainFarmingResource as retain } from "./FarmingResources";
import { createDefaultFarmingLayout } from "../storage/StorageDefaults";
import type { StorageContainerPresenter } from "../presentation/storage/StorageContainerPresenter";
import type { SowingPresenter } from "../presentation/sowing/SowingPresenter";
import { plotBounds } from "../domain/FarmingGround";
import { Script, ignoreClone, type Scene } from "@galacean/engine-core";
import type { Vector3 } from "@galacean/engine-math";
import { FarmingService, type FarmingServiceOptions } from "../application/FarmingService";
import { FarmingActionCoordinator, type FarmingPresentationPort } from "../application/FarmingActionCoordinator";
import { MemoryFarmRepository } from "../persistence/MemoryFarmRepository";
import type { FarmSnapshot } from "../domain/FarmState";
import type { PlotDefinition } from "../domain/FarmDefinitions";
import type { PlotGrid, FarmingGroundProvider } from "../domain/FarmingGround";
import type { FarmRepository } from "../persistence/FarmRepository";
import type { FarmClock } from "../application/FarmClock";
import { FarmingCatalogResource, FarmingRulesResource, farmingDefinitions } from "./FarmingResources";
import { freezePlantContent } from "../procedural/core/immutable";
import { FarmingInitializationError } from "../application/FarmingInitializationError";
import type { FarmingDiagnosticCheck } from "../domain/FarmingDiagnostics";

export interface FarmingAreaConfiguration {
  readonly farmId: string;
  readonly layoutId: string;
  readonly layoutVersion: number;
  readonly catalog: FarmingCatalogResource;
  readonly rules: FarmingRulesResource;
  readonly grid?: PlotGrid;
  readonly plots?: readonly PlotDefinition[];
  readonly initialLayout?: FarmingServiceOptions["initialLayout"];
  readonly storageLayout?: FarmingServiceOptions["storageLayout"];
  readonly initialContainerCounts?: FarmingServiceOptions["initialContainerCounts"];
  readonly initialStorage?: FarmingServiceOptions["initialStorage"];
  readonly snapshot?: FarmSnapshot;
  readonly validateSnapshotPlacement?: FarmingServiceOptions["validateSnapshotPlacement"];
}
export interface FarmingAreaDependencies {
  readonly getViewerPosition?: () => Vector3 | undefined;
  /** Headless native hosts can explicitly omit rendering; the domain service remains engine-free. */
  readonly storagePresentation?: boolean;
  /** Sowing defaults to the same headless choice as storage; hosts can override it independently. */
  readonly sowingPresentation?: boolean;
  readonly groundProvider: FarmingGroundProvider;
  readonly repository?: FarmRepository;
  readonly clock?: FarmClock;
  readonly sampleEnvironment?: FarmingServiceOptions["sampleEnvironment"];
  readonly captureWaterSupply?: FarmingServiceOptions["captureWaterSupply"];
  readonly autoAdvance?: boolean;
  readonly presentation?: FarmingPresentationPort;
  readonly createCropInstanceId?: FarmingServiceOptions["createCropInstanceId"];
}
export interface NativeFarmingOwner {
  readonly presentationActive: boolean;
  assertScene(): void;
  register(area: FarmingAreaComponent): void;
  dependencies(area: FarmingAreaComponent): FarmingAreaDependencies;
  forget(area: FarmingAreaComponent): void;
}
export const nativeFarmingOwners = new WeakMap<Scene, NativeFarmingOwner>();

/** A region is a component; its service snapshot is the sole crop, soil and inventory state. */
export class FarmingAreaComponent extends Script {
  private _sowingPresenter?: SowingPresenter;
  get sowingPresenter(): SowingPresenter | undefined {
    return this._sowingPresenter;
  }
  private _storagePresenter?: StorageContainerPresenter;
  get storagePresenter(): StorageContainerPresenter | undefined {
    return this._storagePresenter;
  }
  private _configuration?: FarmingAreaConfiguration;
  private _service?: FarmingService;
  private _coordinator?: FarmingActionCoordinator;
  private _repository?: FarmRepository;
  private _ownsRepository = false;
  private _disposed = false;
  private _ready: Promise<void> = Promise.resolve();
  private _disposeTask?: Promise<void>;
  private _error?: string;
  private _presentationError?: string;
  private _presentationRequested = false;
  private _owner?: NativeFarmingOwner;
  private _ownerScene?: Scene;
  private _sceneError?: Error;
  private _initializationFailure?: unknown;
  private _initializationTask?: Promise<void>;
  get configuration(): FarmingAreaConfiguration | undefined {
    return this._configuration;
  }
  set configuration(value: FarmingAreaConfiguration | undefined) {
    if (!value) return;
    if (value.plots === undefined && value.initialLayout)
      value = {
        ...value,
        ...createDefaultFarmingLayout(
          value.initialLayout.groundId,
          value.initialLayout.centerX,
          value.initialLayout.centerZ
        )
      };
    this.validate(value);
    if (this._configuration) throw new Error("NOT_SUPPORTED: 区域已配置，首轮不支持运行中修改资源或身份");
    const { catalog, rules, ...settings } = value;
    const plots = settings.plots!.map(({ id, label, target }) => ({ id, label, ...(target ? { target } : {}) }));
    this._configuration = Object.freeze({
      ...freezePlantContent(structuredClone({ ...settings, plots })),
      catalog,
      rules
    });
    try {
      nativeFarmingOwners.get(this.entity.scene!)?.register(this);
    } catch (error) {
      this._configuration = undefined;
      throw error;
    }
    for (const resource of [catalog, rules]) retain(resource, 1);
    if (this.enabled && this.entity.isActiveInHierarchy) this.start();
  }
  get farmId(): string {
    return this._configuration?.farmId ?? "";
  }
  get isDisposed(): boolean {
    return this._disposed;
  }
  get ready(): Promise<void> {
    this.checkMembership();
    return this._ready;
  }
  get lastError(): string | undefined {
    return this._error;
  }
  get runtimeDiagnostic(): FarmingDiagnosticCheck {
    const failure = this._sceneError ?? this._initializationFailure;
    const message = failure instanceof Error ? failure.message : this._error;
    const code =
      failure instanceof FarmingInitializationError
        ? failure.code
        : (/^([A-Z_]+):/.exec(message ?? "")?.[1] ?? "INITIALIZATION_FAILED");
    return this._error
      ? {
          state: "failed",
          issues: [{ code, message: this._error, source: "farming", target: this.farmId }]
        }
      : {
          state: this.initialized ? "ready" : "pending",
          issues: this._service?.getInitializationDiagnostics() ?? []
        };
  }
  get presentationDiagnostic(): FarmingDiagnosticCheck {
    const storage = this._storagePresenter?.snapshot();
    const error = this._presentationError ?? storage?.error;
    if (error)
      return {
        state: "failed",
        issues: [{ code: "PRESENTATION_FAILED", message: error, source: "farming", target: this.farmId }]
      };
    if (!this.initialized) return { state: "pending", issues: [] };
    if (!this._presentationRequested)
      return {
        state: "blocked",
        issues: [{ code: "PRESENTATION_NOT_BOUND", message: "宿主未启用种植表现", source: "host", target: this.farmId }]
      };
    return { state: storage && !storage.ready ? "pending" : "ready", issues: [] };
  }
  get initialized(): boolean {
    this.checkMembership();
    return Boolean(this._coordinator) && !this._error && !this._disposed;
  }
  get canRetryInitialization(): boolean {
    return (
      !this._disposed &&
      !this._sceneError &&
      this._initializationFailure instanceof FarmingInitializationError &&
      this._initializationFailure.retryable
    );
  }
  /** Retry only a failed storage load; concurrent callers share the same initialization. */
  retryInitialization(): Promise<void> {
    if (!this.canRetryInitialization)
      return this._initializationFailure || this._sceneError || this._disposed
        ? Promise.reject(this._initializationFailure ?? this._sceneError ?? new Error("DESTROYED: 种植区域已销毁"))
        : this.ready;
    this._initializationFailure = undefined;
    this._error = undefined;
    this.start();
    return this.ready;
  }
  get service(): FarmingService {
    this.checkMembership();
    if (this._sceneError) throw this._sceneError;
    if (!this._service) throw new Error("NOT_INITIALIZED: 种植区域尚未完成加载");
    return this._service;
  }
  get coordinator(): FarmingActionCoordinator {
    this.checkMembership();
    if (this._sceneError) throw this._sceneError;
    if (!this._coordinator) throw new Error("NOT_INITIALIZED: 种植区域尚未完成加载");
    return this._coordinator;
  }
  get snapshot(): FarmSnapshot | undefined {
    try {
      return this._service?.getSnapshot() ?? this._configuration?.snapshot;
    } catch {
      return this._configuration?.snapshot;
    }
  }
  configure(configuration: FarmingAreaConfiguration): Promise<void> {
    try {
      this.configuration = configuration;
      this.start();
      return this._ready;
    } catch (error) {
      this._error = String(error);
      this._ready = Promise.reject(error);
      void this._ready.catch(() => {});
      return this._ready;
    }
  }
  /** Also called by the System when an inactive Scene/Prefab component is discovered. */
  start(): void {
    if (!this.checkMembership()) return;
    if (this._disposed || !this._configuration || this._service || this._initializationFailure) return;
    const owner = nativeFarmingOwners.get(this.entity.scene!);
    if (!owner) return;
    try {
      owner.register(this);
      const deps = owner.dependencies(this),
        config = this._configuration;
      const definitions = farmingDefinitions(config.catalog, config.rules);
      const repository = deps.repository ?? new MemoryFarmRepository();
      this._repository = repository;
      this._ownsRepository = !deps.repository;
      const service = new FarmingService({
        ...deps,
        groundProvider: {
          capture: () => {
            this.checkMembership();
            if (this._sceneError) throw this._sceneError;
            return deps.groundProvider.capture();
          },
          subscribe: (listener) => deps.groundProvider.subscribe(listener)
        },
        repository,
        definitions,
        ...config,
        simulationConfig: config.rules.data.simulationConfig,
        initialSnapshot: config.snapshot
      });
      this._service = service;
      this._ready = service
        .initialize()
        .then(async () => {
          if (!this.checkMembership()) {
            service.dispose();
            await service.whenIdle();
            return;
          }
          this._coordinator = new FarmingActionCoordinator(service, deps.presentation);
          this._presentationRequested =
            (deps.sowingPresentation ?? deps.storagePresentation) !== false || deps.storagePresentation !== false;
          try {
            if ((deps.sowingPresentation ?? deps.storagePresentation) !== false) {
              const { SowingPresenter } = await import("../presentation/sowing/SowingPresenter");
              if (this._disposed || !this.checkMembership()) return;
              this._sowingPresenter = new SowingPresenter(this.entity, service, (plotId) => {
                const plot = service.getPlot(plotId);
                if (!plot || plot.ground.availability !== "available") return null;
                const bounds = plotBounds(service.getSnapshot().grid, plot);
                return {
                  center: [(bounds.minimumX + bounds.maximumX) / 2, (bounds.minimumZ + bounds.maximumZ) / 2],
                  heightAt: (x, z) => {
                    const sample = deps.groundProvider.capture().sample(plot.groundId, x, z);
                    return sample ? sample.position[1] + 0.002 : null;
                  }
                };
              });
              this._sowingPresenter.setActive(
                this.enabled && this.entity.isActiveInHierarchy && owner.presentationActive
              );
            }
            if (deps.storagePresentation !== false) {
              const { StorageContainerPresenter } = await import("../presentation/storage/StorageContainerPresenter");
              if (this._disposed || !this.checkMembership()) return;
              this._storagePresenter = new StorageContainerPresenter(
                this.entity,
                service,
                definitions,
                deps.getViewerPosition
              );
              this._storagePresenter.setActive(
                this.enabled && this.entity.isActiveInHierarchy && owner.presentationActive
              );
              // The presenter owns current load/retry errors; diagnostics read its snapshot directly.
              void this._storagePresenter.prepare().catch(() => {});
            }
          } catch (error) {
            // The domain transaction already committed. Presentation failure must not dispose its state.
            this._presentationError = String(error);
            this._sowingPresenter?.dispose();
            this._sowingPresenter = undefined;
            this._storagePresenter?.dispose();
            this._storagePresenter = undefined;
          }
          this._error = undefined;
        })
        .catch(async (error) => {
          this._error = String(error);
          this._sowingPresenter?.dispose();
          this._sowingPresenter = undefined;
          this._storagePresenter?.dispose();
          this._storagePresenter = undefined;
          service.dispose();
          await service.whenIdle();
          if (this._ownsRepository) repository.dispose();
          if (this._service === service) {
            this._service = undefined;
            this._repository = undefined;
            this._ownsRepository = false;
            this._initializationFailure = error;
          }
          throw error;
        });
      this._initializationTask = this._ready;
      void this._ready.catch(() => {});
    } catch (error) {
      // Dependency injection is an explicit recovery event; configureRuntime calls start again.
      if (!(error instanceof Error && error.message.startsWith("MISSING_DEPENDENCY:")))
        this._initializationFailure = error;
      this._error = String(error);
      this._ready = Promise.reject(error);
      void this._ready.catch(() => {});
    }
  }
  /** Registration failures are exposed by ready; never throw through Engine activation. */
  rejectRegistration(error: Error): void {
    this._sceneError ??= error;
    this._error = error.message;
    this._storagePresenter?.dispose();
    this._sowingPresenter?.dispose();
    this._ready = Promise.reject(error);
    void this._ready.catch(() => {});
    void this._coordinator?.dispose();
    this._service?.dispose();
    this._owner?.forget(this);
  }
  /** Registration fixes the runtime's Scene identity; cloning creates a new unbound component. */
  bindOwner(owner: NativeFarmingOwner, scene: Scene): void {
    if (this._owner && (this._owner !== owner || this._ownerScene !== scene))
      throw new Error("CONFLICT: 已注册的种植区域不能迁移 Scene，请保存快照并创建新组件");
    owner.assertScene();
    this._owner = owner;
    this._ownerScene = scene;
  }
  private checkMembership(): boolean {
    if (this._sceneError) return false;
    if (this._disposed || !this._owner) return !this._disposed;
    try {
      if (this.entity.scene !== this._ownerScene)
        throw new Error("CONFLICT: 已注册的种植区域不能迁移 Scene，请保存快照并创建新组件");
      this._owner.assertScene();
      return !this._sceneError;
    } catch (error) {
      if (!this._sceneError) {
        this._sceneError = error as Error;
        this.rejectRegistration(this._sceneError);
      }
      return false;
    }
  }
  onAwake(): void {
    this.start();
  }
  onEnable(): void {
    this.start();
    this._storagePresenter?.setActive(Boolean(this._owner?.presentationActive) && !this._sceneError);
    this._sowingPresenter?.setActive(Boolean(this._owner?.presentationActive) && !this._sceneError);
  }
  /** Scene-only transfers do not invoke public onEnable. API/transaction guards also check membership. */
  onUpdate(): void {
    this.checkMembership();
    this._storagePresenter?.setActive(
      this.enabled && this.entity.isActiveInHierarchy && Boolean(this._owner?.presentationActive) && !this._sceneError
    );
    this._storagePresenter?.update(this.engine.time.actualDeltaTime);
    this._sowingPresenter?.setActive(
      this.enabled && this.entity.isActiveInHierarchy && Boolean(this._owner?.presentationActive) && !this._sceneError
    );
    this._sowingPresenter?.update(this.engine.time.actualDeltaTime);
  }
  onDisable(): void {
    this._storagePresenter?.setActive(false);
    this._sowingPresenter?.setActive(false);
    this._coordinator?.cancel();
    this._coordinator?.presentation?.cancel?.();
  }
  onDestroy(): void {
    void this.dispose();
  }
  /** Clone acquires its own resource references; stable IDs still require unique Scene membership. */
  _onClone(target: FarmingAreaComponent): void {
    if (!target._configuration) return;
    const { catalog, rules, ...settings } = target._configuration;
    target._configuration = Object.freeze({ ...freezePlantContent(settings), catalog, rules });
    for (const resource of [catalog, rules]) retain(resource, 1);
  }
  dispose(): Promise<void> {
    if (this._disposeTask) return this._disposeTask;
    this._disposed = true;
    this._storagePresenter?.dispose();
    this._sowingPresenter?.dispose();
    this._coordinator?.cancel();
    this._service?.dispose();
    this._owner?.forget(this);
    this._disposeTask = (async () => {
      await this._ready.catch(() => {});
      await this._initializationTask?.catch(() => {});
      await this._coordinator?.dispose();
      await this._service?.whenIdle();
      if (this._ownsRepository) this._repository?.dispose();
      if (this._configuration)
        for (const resource of [this._configuration.catalog, this._configuration.rules]) retain(resource, -1);
    })();
    return this._disposeTask;
  }
  private validate(config: FarmingAreaConfiguration): void {
    if (this._disposed) throw new Error("DESTROYED: 种植区域已销毁");
    if (
      !/^[a-z0-9][a-z0-9/_-]*$/i.test(config.farmId) ||
      !config.layoutId ||
      !Number.isSafeInteger(config.layoutVersion) ||
      config.layoutVersion <= 0 ||
      !Array.isArray(config.plots)
    )
      throw new Error("INVALID_ARGUMENT: 无效种植区域配置");
    if (
      !(config.catalog instanceof FarmingCatalogResource) ||
      !(config.rules instanceof FarmingRulesResource) ||
      [config.catalog, config.rules].some((r) => r.destroyed || r.engine !== this.engine)
    )
      throw new Error("INVALID_ARGUMENT: 资源必须属于当前 Engine 且仍然有效");
  }
}
for (const key of [
  "_storagePresenter",
  "_sowingPresenter",
  "_service",
  "_coordinator",
  "_repository",
  "_ownsRepository",
  "_disposed",
  "_ready",
  "_disposeTask",
  "_error",
  "_presentationError",
  "_presentationRequested",
  "_initializationFailure",
  "_initializationTask",
  "_owner",
  "_ownerScene",
  "_sceneError"
])
  ignoreClone(FarmingAreaComponent.prototype, key);
