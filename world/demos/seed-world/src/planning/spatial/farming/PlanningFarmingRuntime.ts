import { planningFarmInitialization } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmInitialization";
import { validatePlanningFarmingResources } from "./PlanningFarmingResourceValidation.ts";
import { lazyPlanningFarmingGroundView } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmingGround";
import { Renderer, StaticCollider } from "@galacean/engine-core";
import { meshInteractionOccludes } from "@galacean/engine-terrain/geometry/MeshInteractionSurface";
import { Vector3, type Ray } from "@galacean/engine-math";
import { FarmingItemInteraction } from "@galacean/engine-farming/farming/application/FarmingItemInteraction";
import { FarmingActivityLog } from "@galacean/engine-farming/farming/application/FarmingActivityLog";
import { planningFarmingInitialStorage } from "./PlanningFarmingInitialStorage.ts";
import type { JSONAsset } from "@galacean/engine-core";
import {
  PLANNING_FARM_WATER_SUPPLY,
  PlanningFarmWaterSupply,
  type PlanningFarmWaterGroundView,
  type PlanningFarmWaterScheduler
} from "./PlanningFarmWaterSupply.ts";
import { PlanningFarmClock } from "./PlanningFarmClock.ts";
import { getPlanningFarmSoilShader } from "./PlanningFarmSoilShader.ts";
import { planningFarmEnvironment, type PlanningFarmEnvironmentSource } from "./PlanningFarmEnvironment.ts";
import { PLANNING_FARM_LAYOUT, planningFarmId, validatePlanningFarmSave, canRecoverPlanningFarmSave } from "./PlanningFarmSave.ts";
import { acceptedPlanningFarmingGround } from "./PlanningFarmingAcceptedGround.ts";
import { FarmingInitializationError } from "@galacean/engine-farming/farming/application/FarmingInitializationError";
import type { FarmSnapshot, FarmRepository } from "@galacean/engine-farming/farming/api/index";
import { PLANNING_FARMING_DEFAULTS } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmingComponent";
import type { Camera, Entity } from "@galacean/engine";
import {
  FarmingSystem,
  FarmingAreaComponent,
  FarmingAPI,
  FarmingCatalogResource,
  FarmingRulesResource
} from "@galacean/engine-farming/farming/native/index";
import { farmingDefinitions } from "@galacean/engine-farming/farming/native/FarmingResources";
import { resolveSimulationConfig } from "@galacean/engine-farming/farming/config/FarmingSimulationConfig";
import { FARM_CROP_SCALES } from "@galacean/engine-farming/farming/presentation/DefaultCropScales";
import { FarmingWorldPresentation } from "@galacean/engine-farming/farming/presentation/FarmingWorldPresentation";
import type { FarmingFarmDiagnostics, FarmingGroundView } from "@galacean/engine-farming/farming/api/index";
import { storageDefinitions } from "@galacean/engine-farming/farming/storage/StorageRules";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import type { PublishedPlanningSeedScene } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";
import type { PlanningWaterRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { PlanningWaterUpdate } from "@galacean/engine-world-planning/spatial/hydrology/PlanningWaterEdits";
import {
  PlanningFarmingGroundProvider,
  restrictPlanningFarmingCultivation,
  farmingBoundsOutline
} from "@galacean/engine-world-planning/spatial/farming/PlanningFarmingGround";
import { publishedPlanningFarmingGround } from "./PlanningPublishedFarmingGround.ts";
import { PlanningFarmRepository } from "./PlanningFarmRepository.ts";
import { PlanningFarmingVegetation } from "./PlanningFarmingVegetation.ts";
import { PlanningFarmLandLayer } from "./PlanningFarmLandLayer.ts";

/** Permanent Scene owner; only accepted publications can initialize a farm. Failures never reject the world. */
export class PlanningFarmingRuntime {
  readonly activity = new FarmingActivityLog(() => {});
  private interaction?: FarmingItemInteraction;
  private occlusionScene?: PublishedPlanningSeedScene;
  private occlusionRevision = -1;
  private readonly occlusionRenderers: Renderer[] = [];
  private readonly occlusionEnd = new Vector3();
  private readonly occlusionStartTuple: [number, number, number] = [0, 0, 0];
  private readonly occlusionEndTuple: [number, number, number] = [0, 0, 0];
  consumesWorldClick(x: number, y: number): boolean {
    return this.interaction?.consumesWorldClick(x, y) ?? false;
  }
  readonly system: FarmingSystem;
  readonly api: FarmingAPI;
  private readonly root: Entity;
  private readonly repository: PlanningFarmRepository;
  private readonly resources: { catalog: FarmingCatalogResource; rules: FarmingRulesResource };
  private readonly definitions: ReturnType<typeof farmingDefinitions>;
  private readonly releaseDependencies: () => void;
  readonly statePath: string;
  private stateResource:JSONAsset;
  synchronizeStateResource():void {
    if(!this.system.state||this.system.state.destroyed)throw new Error("Farming state resource is unavailable");
    if (this.stateResource !== this.system.state)
      this.validateStateResource(this.system.state);
    this.stateResource=this.system.state;
    this.repository.synchronizeResource();
  }
  usesAssets(system: FarmingSystem, statePath: string): boolean {
    return (
      this.resources.catalog === system.catalog && this.resources.rules === system.rules && this.statePath === statePath
    );
  }
  private validateStateResource(state: JSONAsset): void {
    const current = this.options.readCurrent();
    const farm = current && this.farmFor(current.plan);
    // Startup may precede the first world publication. initialize validates the
    // selected save once that world and its load choice are known.
    if (!farm) return;
    validatePlanningFarmingResources(state.data, this.definitions, {
      farmId: farm.farmId,
      ...planningFarmInitialization(state.data, farm.farmId, this.options.readInitializationRequest?.())
    }, this.resources.rules.data.simulationConfig);
  }
  private clock?: PlanningFarmClock;
  private provider?: PlanningFarmingGroundProvider;
  private initializationRepository?: FarmRepository;
  private saveRequest?: string;
  private publicationRequest?: string;
  private groundedView?: PlanningFarmWaterGroundView;
  private readonly waterSupply: PlanningFarmWaterSupply;
  private unsubscribeWaterLayout?: () => void;
  private area?: FarmingAreaComponent;
  private presentation?: FarmingWorldPresentation;
  private vegetation?: PlanningFarmingVegetation;
  private land?: PlanningFarmLandLayer;
  private current?: PublishedPlanningSeedScene;
  private waterCurrent?: PublishedPlanningSeedScene;
  private createGroundView?: (revision: number) => PlanningFarmWaterGroundView;
  private revision = 0;
  private groundRevision = 0;
  private buildingRevision?: number;
  private masonry?: PublishedPlanningSeedScene["masonry"];
  private task: Promise<void> = Promise.resolve();
  private controller?: AbortController;
  private disposed = false;
  private stopping = false;
  private stopTask?: Promise<void>;
  private disposal?: Promise<void>;
  private cleanupPending?: (() => unknown)[];
  get initializedFarmId(): string | undefined {
    return this.area?.initialized ? this.area.farmId : undefined;
  }
  get available(): boolean {
    return !this.stopping && !this.disposed && !this.system.destroyed && !this.system.isDisposed;
  }
  private record?: FarmingFarmDiagnostics;
  private statusElapsed = 0;
  constructor(
    private readonly options: {
      canvas?: HTMLCanvasElement;
      isInputEnabled?: () => boolean;
      system: FarmingSystem;
      statePath: string;
      camera: Camera;
      project: RuntimeProjectSession;
      water: PlanningWaterRuntime;
      readCurrent: () => PublishedPlanningSeedScene | undefined;
      raycastWorld?: (ray: Ray, distance: number) => boolean;
      waterSupplyScheduler?: PlanningFarmWaterScheduler;
      readEnvironment?: () => PlanningFarmEnvironmentSource | undefined;
      readInitializationRequest?: () => string | undefined;
    }
  ) {
    this.system = options.system;
    const { catalog, rules, state } = this.system;
    if (!catalog || !rules || !state || state.destroyed)
      throw new Error("FarmingSystem requires catalog, rules and state assets");
    this.resources = { catalog, rules };
    this.definitions = farmingDefinitions(catalog, rules);
    this.validateStateResource(state);
    this.statePath = options.statePath;
    if (!this.statePath) throw new Error("Farming state must be a registered project asset");
    this.stateResource = state;
    // Resolve the same overrides as FarmingService before acquiring project resources.
    const { fieldCapacity } = resolveSimulationConfig(this.definitions.soilProfile, rules.data.simulationConfig).water;
    this.waterSupply = new PlanningFarmWaterSupply({
      fieldCapacityUnits: fieldCapacity,
      parameters: {
        equilibriumMoistureUnits: Math.min(PLANNING_FARM_WATER_SUPPLY.equilibriumMoistureUnits, fieldCapacity)
      },
      scheduler: options.waterSupplyScheduler,
      isCurrent: (view) => !this.disposed && view === this.groundedView
    });
    let repository: PlanningFarmRepository | undefined;
    let root: Entity | undefined;
    let releaseDependencies: (() => void) | undefined;
    try {
      this.repository = repository = new PlanningFarmRepository(
        options.project,
        FarmingInitializationError,
        this.statePath,
        () => this.stateResource
      );
      this.root = root = this.system.entity.createChild("Farming Runtime");
      this.releaseDependencies = releaseDependencies = this.system.configureRuntime((area) => {
        if (!this.provider || !this.initializationRepository) throw new Error("MISSING_DEPENDENCY: 农场尚未准备完成");
        return {
          groundProvider: this.provider,
          getViewerPosition: () => this.options.camera.entity.transform.worldPosition,
          repository: this.initializationRepository,
          clock: this.clock,
          captureWaterSupply: () => this.waterSupply.capture(area.farmId),
          sampleEnvironment: () => planningFarmEnvironment(this.options.readEnvironment?.()),
          autoAdvance: true
        };
      });
      this.api = new FarmingAPI(this.system);
    } catch (error) {
      // A failed constructor cannot be disposed by its caller.
      const failures = [error];
      for (const cleanup of [
        () => releaseDependencies?.(),
        () => root?.destroy(),
        () => repository?.dispose(),
        () => this.waterSupply.dispose()
      ]) {
        try {
          cleanup();
        } catch (cleanupError) {
          failures.push(cleanupError);
        }
      }
      if (failures.length > 1) throw new AggregateError(failures, "Farming runtime construction failed");
      throw error;
    }
  }
  get activeArea(): FarmingAreaComponent | undefined {
    return this.available &&
      this.system.enabled &&
      this.system.entity.isActiveInHierarchy &&
      this.area?.enabled &&
      this.area.initialized
      ? this.area
      : undefined;
  }
  get worldPresentation(): FarmingWorldPresentation | undefined {
    return this.presentation;
  }
  get whenSettled(): Promise<void> {
    return this.task;
  }
  sampleTarget(ray: import("@galacean/engine-farming/farming/api/index").GroundRay, maximumDistance: number) {
    return this.activeArea ? (this.provider?.capture().raycast(ray, maximumDistance) ?? null) : null;
  }

  private farmFor(plan: IslandPlan): IslandPlan["farming"] {
    return (
      plan.farming ??
      (plan.parameters?.seed === undefined
        ? undefined
        : {
            farmId: planningFarmId(plan.parameters.seed),
            groundId: `seed-world/seed-${plan.parameters.seed}/ground`,
            options: PLANNING_FARMING_DEFAULTS,
            managementOutline: [],
            poiId: null,
            planningRevision: plan.planning?.revision ?? 0,
            placementCheck: { state: "blocked" as const, issues: [] },
            accessCheck: { state: "blocked" as const, issues: [] }
          })
    );
  }

  private groundingCurrent?: PublishedPlanningSeedScene;
  /** Rebind an accepted local terrain/water view without recreating the farm or its save state. */
  refreshTerrain(current: PublishedPlanningSeedScene): void {
    const previous = this.waterCurrent ?? this.current;
    if (
      this.disposed ||
      !previous ||
      this.options.readCurrent() !== current ||
      previous.world !== current.world ||
      previous.masonry !== current.masonry ||
      previous.solids !== current.solids
    )
      return;
    this.groundingCurrent = current;
    this.waterCurrent = current;
    this.revision = current.revision;
    this.land?.refreshTerrain(current.data.fields);
    if (this.createGroundView && this.provider) {
      const view = this.createGroundView(++this.groundRevision);
      this.groundedView = view;
      this.provider.publish(view);
      this.requestWaterSupply(view);
    }
    if (this.record) {
      this.record = { ...this.record, publicationRevision: current.revision };
      this.system.diagnostics.publish(this.record);
    }
  }

  /** Follow an accepted Water batch without restarting the farm or walking its cells. */
  refreshWater(current: PublishedPlanningSeedScene, update?: PlanningWaterUpdate): void {
    const previous = this.waterCurrent ?? this.current;
    if (
      this.disposed ||
      !previous ||
      this.options.readCurrent() !== current ||
      current.world !== previous.world ||
      current.data !== previous.data ||
      current.solids !== previous.solids ||
      current.vegetation !== previous.vegetation ||
      current.masonry !== previous.masonry ||
      current.masonry?.publicationRevision !== this.buildingRevision
    )
      return;
    // The initialization/vegetation tasks still own the same retained world.
    this.waterCurrent = current;
    this.revision = current.revision;
    const waterKey = `${this.options.water.system.revision}:${this.options.water.system.runtimeState.effectiveEnabled}`;
    if ((update?.surface ?? true) && this.createGroundView && this.provider && this.acceptedWaterRevision !== waterKey) {
      this.acceptedWaterRevision = waterKey;
      const view = this.createGroundView(this.groundRevision + 1);
      this.groundRevision++;
      this.groundedView = view;
      this.provider.publish(view, false);
      this.requestWaterSupply(view);
      void this.area?.service
        .refreshItemsGround()
        .catch((error) => this.activity.append("error", `道具贴地失败：${String(error)}`));
    }
    if (this.record) {
      this.record = { ...this.record, publicationRevision: current.revision };
      this.system.diagnostics.publish(this.record);
    }
  }

  private acceptedWaterRevision?: string;

  private isCurrent(current: PublishedPlanningSeedScene): boolean {
    return this.current === current && this.options.readCurrent() === (this.waterCurrent ?? current);
  }

  /** Candidate checks are evidence only; they cannot initialize, pause or replace the published farm. */
  inspectCandidate(plan: IslandPlan, planningRevision = plan.farming?.planningRevision ?? 0): void {
    const farm = plan.farming;
    if (!farm || this.disposed) return;
    this.system.diagnostics.publish({
      farmId: farm.farmId,
      phase: "candidate",
      planningRevision,
      publicationRevision: this.revision,
      placement: farm.placementCheck,
      access: farm.accessCheck,
      runtime: { state: "pending", issues: [] },
      presentation: { state: "pending", issues: [] }
    });
  }

  /** Invoked immediately after world acceptance; agriculture stays hidden until the current terrain is final. */
  publish(current: PublishedPlanningSeedScene, planningRevision = current.plan.farming?.planningRevision ?? 0): void {
    if (!this.available) return;
    const requestId = this.options.readInitializationRequest?.();
    if (
      (this.current === current || this.waterCurrent === current) &&
      this.masonry === current.masonry &&
      this.buildingRevision === current.masonry?.publicationRevision &&
      this.publicationRequest === requestId
    ) {
      // Presentation-only edits can retain geometry. Stamp the accepted author revision without restarting simulation.
      if (this.record && this.record.planningRevision !== planningRevision) {
        this.record = { ...this.record, planningRevision };
        this.system.diagnostics.publish(this.record);
      }
      return;
    }
    this.waterSupply.cancel();
    this.unsubscribeWaterLayout?.();
    this.unsubscribeWaterLayout = undefined;
    const vegetationCleanup = this.vegetation?.dispose();
    this.task = Promise.all([this.task, vegetationCleanup]).then(() => undefined);
    this.vegetation = undefined;
    this.land?.dispose();
    this.land = undefined;
    this.controller?.abort();
    this.waterCurrent = undefined;
    this.createGroundView = undefined;
    const controller = (this.controller = new AbortController());
    const previousFarmId = this.current?.plan.farming?.farmId ?? this.record?.farmId;
    this.current = current;
    this.groundingCurrent = current;
    this.publicationRequest = requestId;
    this.masonry = current.masonry;
    this.buildingRevision = current.masonry?.publicationRevision;
    this.revision = current.revision;
    this.presentation?.setActive(false);
    if (this.area) {
      this.area.enabled = false;
      if (this.area.initialized) this.area.coordinator.cancel();
    }
    if (this.provider) {
      const previous = this.groundedView ?? this.provider.capture();
      this.provider.publish({
        ...previous,
        revision: ++this.groundRevision,
        inspectBounds: (id, bounds) => ({
          ...previous.inspectBounds(id, bounds),
          blocked: true
        })
      });
    }
    const farm = this.farmFor(current.plan);
    if (previousFarmId && previousFarmId !== farm?.farmId) {
      const prior = this.system.diagnostics.get(previousFarmId).farms.find((r) => r.phase === "published");
      if (prior) {
        const inactive: FarmingFarmDiagnostics = {
          ...prior,
          publicationRevision: current.revision,
          runtime: {
            state: "blocked",
            issues: [
              {
                code: "WORLD_NOT_ACTIVE",
                source: "host",
                target: previousFarmId,
                message: "该 Seed 当前未发布"
              }
            ]
          },
          access: {
            state: "blocked",
            issues: [
              {
                code: "WORLD_NOT_ACTIVE",
                source: "host",
                target: previousFarmId,
                message: "该 Seed 当前未发布"
              }
            ]
          },
          presentation: {
            state: "blocked",
            issues: [
              {
                code: "WORLD_NOT_ACTIVE",
                source: "host",
                target: previousFarmId,
                message: "该农场当前未发布"
              }
            ]
          }
        };
        this.system.diagnostics.publish(inactive);
        if (!farm) this.record = inactive;
      }
    }
    if (!farm) return;
    this.record = {
      farmId: farm.farmId,
      phase: "published",
      planningRevision,
      publicationRevision: current.revision,
      placement: farm.placementCheck,
      access: farm.accessCheck,
      runtime: { state: "pending", issues: [] },
      presentation: { state: "pending", issues: [] }
    };
    this.system.diagnostics.publish(this.record);
    this.task = this.task
      .catch(() => {})
      .then(async () => {
        if (controller.signal.aborted || this.disposed) return;
        try {
          await this.initialize(current, controller.signal);
        } catch (error) {
          if (controller.signal.aborted || this.disposed || this.current !== current) return;
          const message = error instanceof Error ? error.message : String(error);
          const waterIssue = /^(WATER_[A-Z_]+):/.exec(message)?.[1];
          if (waterIssue) {
            this.report("placement", "failed", waterIssue, message);
            this.report("runtime", "blocked", "FARM_GROUND_QUERY_FAILED", "水域占地检查未能确认，农场未启用");
            this.report("presentation", "blocked", "FARM_NOT_ACTIVE", "空间检查未完成，农业表现未启用");
            return;
          }
          this.report("runtime", "failed", "FARM_INITIALIZATION_FAILED", String(error));
        }
      });
  }
  private async initialize(current: PublishedPlanningSeedScene, signal: AbortSignal, fresh = false): Promise<void> {
    const farm = this.farmFor(current.plan)!;
    const requestId = this.publicationRequest;
    const policy = await this.repository.initialization(farm.farmId, requestId);
    let saved: FarmSnapshot | undefined;
    const resume = policy.resume;
    let recover = fresh;
    const retained = !fresh && this.area?.farmId === farm.farmId && this.saveRequest === requestId;
    if (retained && this.area!.initialized) saved = this.area!.service.getSnapshot();
    else if (!fresh && !policy.replace) {
      try {
        saved = await this.repository.read(farm.farmId);
        if (resume && !saved) throw new Error("Farm resume state is missing; refusing to reset progress");
        if (saved) validatePlanningFarmSave(saved, farm.farmId, this.definitions, undefined, this.resources.rules.data.simulationConfig);
      } catch (error) {
        if (resume || !canRecoverPlanningFarmSave(error)) throw error;
        saved = undefined;
        recover = true;
        console.warn("[Planner][Farming] 存档不可用，按当前规划初始化", {
          farmId: farm.farmId,
          reason: String(error)
        });
      }
    }
    const guard = () => {
      signal.throwIfAborted();
      if (this.disposed || !this.isCurrent(current)) throw new Error("Stale farm publication");
    };
    guard();
    if (
      this.area &&
      (!retained ||
        (!saved &&
          farm.placement &&
          JSON.stringify(this.area.configuration?.grid) !== JSON.stringify(farm.placement.grid)))
    ) {
      this.interaction?.dispose();
      this.interaction = undefined;
      const old = this.area;
      this.area = undefined;
      await old.dispose();
      this.presentation?.dispose();
      this.presentation = undefined;
      old.entity.destroy();
      this.provider?.dispose();
      this.provider = undefined;
      this.groundedView = undefined;
      guard();
    }
    if (
      !saved &&
      !this.area &&
      (farm.placementCheck.state !== "ready" || farm.accessCheck.state !== "ready" || !farm.placement)
    ) {
      this.report("runtime", "blocked", "FARM_SPATIAL_REQUIREMENTS", "没有通过完整设施检查的农场起始点");
      this.report("presentation", "blocked", "FARM_NOT_ACTIVE", "当前 Seed 没有可恢复或可创建的农场");
      return;
    }
    // Height transition publishes the final array by identity. Avoid rendering soil above an intermediate surface.
    while (
      current.heightTransition &&
      current.heightTransition.fields.heightSamples !== current.data.fields.heightSamples
    ) {
      guard();
      await new Promise<void>((resolve) => {
        const abort = () => {
          cancelAnimationFrame(frame);
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const frame = requestAnimationFrame(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        });
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
    guard();
    const placement = farm.placement;
    const grid = saved?.grid ?? this.area?.configuration?.grid ?? placement!.grid;
    const plots = saved
      ? saved.plots.map((p) => ({
          id: p.plotId,
          label: p.label,
          target: { groundId: p.groundId, cellX: p.cellX, cellZ: p.cellZ }
        }))
      : (this.area?.configuration?.plots ?? placement!.plots);
    let storage = saved?.storage ?? this.area?.configuration?.initialStorage ?? placement!.storage;
    // Freeze structural geometry before the physical ground is first requested lazily.
    let masonry: Pick<NonNullable<PublishedPlanningSeedScene["masonry"]>, "bounds" | "captureSurfaceQuery"> | undefined;
    if (current.masonry) {
      const surfaces = current.masonry.captureSurfaceQuery();
      masonry = {
        bounds: current.masonry.bounds,
        captureSurfaceQuery: () => surfaces
      };
    }
    const groundId = saved?.storage.layout?.groundId ?? farm.groundId;
    const rawPlan = { ...current.plan, farming: { ...farm, groundId } } as IslandPlan;
    const storageRules = storageDefinitions(this.definitions);
    this.createGroundView = (revision) => {
      const groundScene = this.groundingCurrent ?? current;
      const water = this.options.water.captureGrounding();
      let accepted: FarmingGroundView | undefined, physical: FarmingGroundView | undefined;
      const readPhysical = () => {
        if (!physical) {
          const raw = publishedPlanningFarmingGround(
            rawPlan,
            groundScene.data.fields,
            revision,
            water.underwater,
            undefined,
            masonry,
            water.spatialFields,
            false
          );
          physical = restrictPlanningFarmingCultivation(
            raw,
            groundScene.plan.routes.flatMap((route) => (route.outline ? [route.outline] : []))
          );
        }
        return physical;
      };
      if (!saved && !this.area) {
        storage = planningFarmingInitialStorage(
          farm.farmId, placement!, storageRules, farm.options.initialContainers, readPhysical
        );
      }
      const read = () =>
        (accepted ??= acceptedPlanningFarmingGround(
          groundScene.data.fields,
          revision,
          groundId,
          { grid, plots, storage },
          () => (this.area?.initialized ? this.area.service.getSnapshot() : saved),
          readPhysical,
          storageRules
        ));
      return Object.freeze({
        ...lazyPlanningFarmingGroundView(revision, read),
        waterFields: water.spatialFields
      });
    };
    const view = this.createGroundView(++this.groundRevision);
    this.groundedView = view;
    if (this.provider) this.provider.publish(view);
    else this.provider = new PlanningFarmingGroundProvider(view);
    if (!this.area) {
      this.clock = new PlanningFarmClock(saved?.simulation.lastSystemTimeMs);
      this.saveRequest = requestId;
      this.initializationRepository = this.repository.forInitialization({ requestId, recover });
      const area = this.root.createChild("Farm Starter").addComponent(FarmingAreaComponent);
      this.area = area;
      try {
        await area.configure({
          farmId: farm.farmId,
          ...PLANNING_FARM_LAYOUT,
          ...this.resources,
          grid,
          plots,
          initialStorage: storage,
          validateSnapshotPlacement: false,
          ...(saved ? { snapshot: saved } : {})
        });
      } catch (error) {
        if (!resume && saved && !fresh && canRecoverPlanningFarmSave(error)) {
          console.warn("[Planner][Farming] 存档初始化失败，按当前规划重建", {
            farmId: farm.farmId,
            reason: String(error)
          });
          guard();
          return this.initialize(current, signal, true);
        }
        throw error;
      }
    } else if (!this.area.initialized && this.area.canRetryInitialization) await this.area.retryInitialization();
    // Restored user state has no dependency on a newly generated management area or road access.
    this.report("placement", "ready");
    if (saved) {
      this.record = { ...this.record!, access: { state: "ready", issues: [] } };
    }
    guard();
    if (!this.area.initialized) throw new Error(this.area.lastError ?? "Farm region is not initialized");
    this.unsubscribeWaterLayout?.();
    if (this.groundedView) this.requestWaterSupply(this.groundedView);
    this.unsubscribeWaterLayout = this.area.service.subscribe(({ snapshot, changes }) => {
      const layoutChanged = changes.some((c) => c.kind === "plot-created" || c.kind === "plot-deleted");
      if (!layoutChanged || !this.groundedView || this.disposed) return;
      for (const change of changes) if (change.kind === "plot-deleted") this.waterSupply.removePlot(change.plotId);
      this.waterSupply.request(this.groundedView, snapshot, true);
    });
    this.land = new PlanningFarmLandLayer(this.area.entity, current.data.fields, current.world);
    this.vegetation = new PlanningFarmingVegetation({
      service: this.area.service,
      definitions: storageDefinitions(this.definitions),
      land: this.land,
      groundCover: current.world.population,
      vegetation: current.vegetation,
      isWorldCurrent: () => this.options.readCurrent()?.world === current.world,
      isCurrent: () => !signal.aborted && !this.disposed && this.isCurrent(current)
    });
    await this.vegetation.whenSettled;
    guard();
    this.area.enabled = true;
    if (!this.presentation) {
      try {
        this.presentation = new FarmingWorldPresentation(
          this.area.entity,
          this.options.camera,
          this.area.service,
          this.provider,
          this.definitions,
          FARM_CROP_SCALES,
          getPlanningFarmSoilShader(),
          this.land
        );
        this.area.coordinator.presentation = this.presentation.port;
        if (this.area.sowingPresenter)
          this.area.sowingPresenter.surface = (id) => this.presentation?.getSowingSurface(id) ?? null;
      } catch (error) {
        this.report("presentation", "failed", "FARM_PRESENTATION_FAILED", String(error));
      }
    }
    this.activity.bind(this.area.service, this.definitions);
    if (!this.interaction && this.presentation && this.options.canvas) {
      this.interaction = new FarmingItemInteraction({
        canvas: this.options.canvas,
        camera: this.options.camera,
        service: this.area.service,
        coordinator: this.area.coordinator,
        isStorageContainerVisible: (id) => this.area?.storagePresenter?.isContainerVisible(id) ?? false,
        presentation: this.presentation,
        ground: this.provider!,
        definitions: this.definitions,
        isEnabled: () => !!this.activeArea && (this.options.isInputEnabled?.() ?? true),
        occluded: (ray, distance) => this.occluded(ray, distance),
        result: (receipt) => {
          if (!receipt.ok) this.activity.append("error", receipt.error?.message ?? "农场操作失败");
        }
      });
    }
    this.presentation?.setActive(true);
    this.report("runtime", "ready");
    this.synchronizePresentationDiagnostics();
  }
  private occluded(ray: Ray, distance: number): boolean {
    const current = this.options.readCurrent();
    if (!current) return true;
    const queryDistance = Math.max(0, distance - 0.03);
    if (queryDistance === 0) return false;
    const start = ray.origin,
      end = ray.getPoint(queryDistance, this.occlusionEnd);
    const from = this.occlusionStartTuple, to = this.occlusionEndTuple;
    from[0] = start.x; from[1] = start.y; from[2] = start.z;
    to[0] = end.x; to[1] = end.y; to[2] = end.z;
    if (current.masonry?.intersectSegment(from, to)) return true;
    // Merged rock bounds contain open ground. Reuse their native CPU triangle colliders;
    // treating a formation's broad-phase box as a solid would block clear ground beside it.
    const physics = this.root.scene!.physics;
    if (this.options.raycastWorld?.(ray, queryDistance) ?? physics?.raycast(ray, queryDistance)) return true;
    if (this.occlusionScene !== current || this.occlusionRevision !== current.revision) {
      this.occlusionScene = current;
      this.occlusionRevision = current.revision;
      this.occlusionRenderers.length = 0;
      current.solids.root.getComponentsIncludeChildren(Renderer, this.occlusionRenderers);
    }
    for (const renderer of this.occlusionRenderers) {
      if (renderer.destroyed || !renderer.enabled || !renderer.entity.isActiveInHierarchy) continue;
      const collider = renderer.entity.getComponent(StaticCollider);
      if (collider?.enabled) continue;
      if (meshInteractionOccludes(renderer, ray, queryDistance)) return true;
    }
    return false;
  }
  private requestWaterSupply(view: PlanningFarmWaterGroundView): void {
    if (this.area?.initialized) this.waterSupply.request(view, this.area.service.getSnapshot());
  }

  update(seconds: number): void {
    if (!this.available) return;
    const current = this.options.readCurrent();
    if (
      current &&
      this.current &&
      (this.masonry !== current.masonry || this.buildingRevision !== current.masonry?.publicationRevision)
    )
      this.publish(current, this.record?.planningRevision);
    this.statusElapsed += seconds;
    if (this.statusElapsed < 0.5 || this.disposed) return;
    this.statusElapsed = 0;
    if (this.activeArea) this.synchronizePresentationDiagnostics();
  }
  private synchronizePresentationDiagnostics(): void {
    const land = this.land?.diagnostics;
    if (land?.error) {
      this.report("presentation", "failed", "FARM_LAND_TEXTURE_FAILED", land.error);
      return;
    }
    if (land && !land.ready) {
      this.report("presentation", "pending");
      return;
    }
    const cover = this.vegetation?.diagnostics;
    if (cover?.state === "failed") {
      this.report("presentation", "failed", "FARM_GROUND_COVER_FAILED", cover.error!);
      return;
    }
    if (cover?.state === "pending") {
      this.report("presentation", "pending");
      return;
    }
    const result = this.presentation?.getDiagnostics();
    if (!result) return;
    if (result.errors.length)
      this.report("presentation", "failed", "FARM_PRESENTATION_FAILED", result.errors.join("；"));
    else this.report("presentation", result.ready ? "ready" : "pending");
  }
  private report(
    dimension: "placement" | "runtime" | "presentation",
    state: "ready" | "pending" | "blocked" | "failed",
    code?: string,
    message?: string
  ): void {
    if (!this.record || this.disposed) return;
    this.record = {
      ...this.record,
      [dimension]: {
        state,
        issues: code
          ? [
              {
                code,
                message: message!,
                source: "host",
                target: this.record.farmId
              }
            ]
          : []
      }
    };
    this.system.diagnostics.publish(this.record);
  }
  /** Stop gameplay writes before the project checkpoint; retain its Scene resources until it succeeds. */
  stop(): Promise<void> {
    this.stopping = true;
    this.controller?.abort();
    this.interaction?.dispose();
    this.waterSupply.dispose();
    this.unsubscribeWaterLayout?.();
    this.unsubscribeWaterLayout = undefined;
    return this.stopTask ??= (async () => {
      await this.task.catch(() => {});
      if (this.area?.initialized) {
        await this.area.coordinator.dispose();
        await this.area.service.checkpoint();
        this.area.service.dispose();
        await this.area.service.whenIdle();
      }
      await this.repository.whenIdle();
    })().catch(error => { this.stopTask = undefined; throw error; });
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    if (!this.disposed) {
      this.disposed = true;
      this.occlusionScene = undefined;
      this.occlusionRenderers.length = 0;
      this.controller?.abort();
      this.cleanupPending = [
        () => this.interaction?.dispose(),
        () => this.activity.dispose(),
        () => this.waterSupply.dispose(),
        () => { this.unsubscribeWaterLayout?.(); this.unsubscribeWaterLayout = undefined; },
        async () => { await this.vegetation?.dispose(); this.vegetation = undefined; },
        () => this.task,
        () => this.area?.dispose(),
        () => { this.presentation?.dispose(); this.presentation = undefined; },
        () => this.area?.entity.destroy(),
        () => { this.land?.dispose(); this.land = undefined; },
        () => this.releaseDependencies(),
        () => this.repository.whenIdle(),
        () => this.provider?.dispose(),
        () => this.repository.dispose(),
        () => this.root.destroy()
      ];
    }
    const task = this.runCleanup();
    this.disposal = task;
    void task.then(() => { this.disposal = undefined; }, () => { this.disposal = undefined; });
    return task;
  }
  private async runCleanup(): Promise<void> {
    const failures: unknown[] = [];
    const retry: (() => unknown)[] = [];
    for (const operation of this.cleanupPending ?? []) {
      try { await operation(); }
      catch (error) { failures.push(error); retry.push(operation); }
    }
    this.cleanupPending = retry;
    if (failures.length) throw new AggregateError(failures, "Farming runtime cleanup failed");
  }
}
