import type { FarmingDiagnosticIssue } from "../domain/FarmingDiagnostics";
import { regroundFarmItems } from "../domain/rules/FarmItemRules";
import type { FarmItemInput } from "../domain/FarmItems";
import { validateConfiguredFarmSnapshot } from "../domain/FarmValidation";
import { createDefaultFarmingLayout } from "../storage/StorageDefaults";
import { storageBlocksCultivation, storageDefinitions } from "../storage/StorageRules";
import {
  containerContents,
  containerQuantity,
  isCartStorage,
  storageDisplayCapacity
} from "../storage/StorageContents";
import type {
  StorageLayout,
  StorageContainerQuery,
  StorageContainerView,
  StorageWriteInput
} from "../storage/StorageTypes";
import type { FarmStorageState } from "../storage/StorageTypes";
import { freezePlantContent } from "../procedural/core/immutable";
import {
  resolveSimulationConfig,
  simulationSoilProfile,
  validateSimulationConfig,
  type FarmingSimulationConfig,
  type FarmingSimulationOverrides
} from "../config/FarmingSimulationConfig";
import type { FieldValueResult } from "../domain/fields/SoilWaterField";
import { isFarmCommand } from "../domain/FarmCommandValidation";
import {
  DEFAULT_PLOT_GRID,
  groundState,
  inspectGround,
  isGroundTarget,
  GROUND_REASON_MESSAGES,
  type FarmingGroundProvider,
  type FarmingGroundChange,
  type GroundTarget,
  type PlotGrid,
  type CultivationInspection
} from "../domain/FarmingGround";
import { resolvePlotView, matchesPlotQuery, type PlotView, type PlotQuery } from "../domain/PlotQueries";
import { FarmingGroundInspectionCache } from "../domain/FarmingGroundInspectionCache";
import { createPlotStatus } from "../domain/FarmQueries";
import { refreshPlotGround } from "../domain/refreshPlotGround";
import type { CreatePlotInput, PlotPatch, FarmCommandBinding } from "../domain/FarmCommands";
import { freezeCommandBinding, commandSignature, MAX_REQUEST_SIGNATURE_LENGTH } from "../domain/CommandReceipts";
import { FarmingInitializationError } from "./FarmingInitializationError";
import type { FarmChange } from "../domain/FarmCommands";
import {
  getActionDefinitions,
  isFarmActionInput,
  type FarmActionDefinition,
  type FarmActionInput,
  type FarmActionOptions
} from "../domain/FarmActions";
import type {
  ActionAvailability,
  CommandResult,
  CropStatusView,
  FarmCommand,
  FarmingDefinitionSet,
  FarmSnapshot,
  FarmTimeAdvanceSummary,
  PlotDefinition,
  PlotStatusView
} from "../domain/index";
import {
  applyFarmCommand,
  type ApplyFarmCommandResult,
  createInitialFarmSnapshot,
  freezeSnapshot,
  getActionAvailability,
  settleFarmTime,
  validateDefinitions,
  validateFarmSnapshot,
  validatePlotDefinitions
} from "../domain/index";
import type { FarmRepositoryTransaction } from "../persistence/FarmRepository";
import type { FarmRepository } from "../persistence/FarmRepository";
import { BrowserSystemClock, type FarmClock } from "./FarmClock";

export interface FarmingServiceOptions {
  readonly captureWaterSupply?: () => import("../domain/FarmWaterSupply").FarmWaterSupplyInput | undefined;
  readonly sampleEnvironment?: () => import("../domain/FarmEnvironment").FarmEnvironmentInput;
  readonly repository: FarmRepository;
  readonly groundProvider: FarmingGroundProvider;
  readonly grid?: PlotGrid;
  readonly farmId: string;
  readonly layoutId: string;
  readonly layoutVersion: number;
  readonly definitions: FarmingDefinitionSet;
  readonly plots?: readonly PlotDefinition[];
  readonly initialLayout?: { readonly groundId: string; readonly centerX?: number; readonly centerZ?: number };
  readonly storageLayout?: Partial<StorageLayout>;
  readonly initialContainerCounts?: Readonly<Record<string, number>>;
  readonly initialStorage?: FarmStorageState;
  /** Used only when the repository has no record; loaded Scene state uses the same snapshot contract. */
  readonly initialSnapshot?: FarmSnapshot;
  /** Restoring an authored layout can retain overlaps; identity, cargo and numeric integrity remain checked. */
  readonly validateSnapshotPlacement?: boolean;
  readonly createCropInstanceId?: () => string;
  readonly clock?: FarmClock;
  readonly autoAdvance?: boolean;
  readonly simulationConfig?: FarmingSimulationOverrides;
  readonly simulationStepMs?: number;
  readonly maximumCatchUpMs?: number;
  readonly checkpointIntervalMs?: number;
}

export type FarmingServiceErrorOperation = "checkpoint" | "clock" | "refresh" | "listener";

export interface FarmingServiceError {
  readonly operation: FarmingServiceErrorOperation;
  readonly error: unknown;
}

export class FarmingService {
  private initialItemDiagnostics: readonly FarmingDiagnosticIssue[] = [];
  getInitializationDiagnostics(): readonly FarmingDiagnosticIssue[] {
    return this.initialItemDiagnostics;
  }
  private readonly repository: FarmRepository;
  private readonly groundProvider: FarmingGroundProvider;
  private readonly grid: PlotGrid;
  private unsubscribeGround: (() => void) | null = null;
  private readonly farmId: string;
  private readonly layoutId: string;
  private readonly layoutVersion: number;
  private readonly definitions: FarmingDefinitionSet;
  private readonly plots: readonly PlotDefinition[];
  private readonly storageLayout?: Partial<StorageLayout>;
  private readonly initialContainerCounts?: Readonly<Record<string, number>>;
  private readonly initialStorage?: FarmStorageState;
  private readonly createCropInstanceId: () => string;
  private readonly clock: FarmClock;
  private readonly sampleEnvironment?: FarmingServiceOptions["sampleEnvironment"];
  private readonly captureWaterSupply?: FarmingServiceOptions["captureWaterSupply"];
  private readonly autoAdvance: boolean;
  /** Resolved, frozen rules shared by simulation, queries and presentation. */
  private _simulationConfig: FarmingSimulationConfig;
  get simulationConfig(): FarmingSimulationConfig {
    return this._simulationConfig;
  }
  private readonly simulationStepMs: number;
  private readonly checkpointIntervalMs: number;
  private readonly listeners = new Set<(change: FarmingServiceChange) => void>();
  private readonly errorListeners = new Set<(failure: FarmingServiceError) => void>();
  private readonly failureListeners = new Set<(message: string) => void>();
  subscribeFailures(listener: (message: string) => void): () => void {
    this.failureListeners.add(listener);
    return () => this.failureListeners.delete(listener);
  }
  reportFailure(message: string): void {
    for (const listener of this.failureListeners) {
      try {
        listener(message);
      } catch (error) {
        console.warn("Farming failure diagnostic listener", error);
      }
    }
  }
  private snapshot: FarmSnapshot | null = null;
  private statusSnapshot: FarmSnapshot | null = null;
  private statuses: readonly PlotStatusView[] | null = null;
  private readonly statusByPlot = new Map<string, PlotStatusView>();
  private readonly statusByCrop = new Map<string, CropStatusView>();
  private readonly groundInspections = new FarmingGroundInspectionCache();
  private queue: Promise<unknown> = Promise.resolve();
  private unsubscribeRepository: (() => void) | null = null;
  private tickTimer: number | null = null;
  private lastCheckpointSystemTimeMs = 0;
  private lastCatchUp: FarmTimeAdvanceSummary = Object.freeze({
    elapsedSystemTimeMs: 0,
    simulatedElapsedMs: 0,
    capped: false,
    changes: Object.freeze([])
  });
  private disposed = false;
  private readonly lifetime = new AbortController();
  private readonly initialSnapshot?: FarmSnapshot;
  private readonly validateSnapshotPlacement: boolean;
  private readonly pendingBindings = new Map<string, FarmCommandBinding>();

  constructor(options: FarmingServiceOptions) {
    validateDefinitions(options.definitions);
    const defaults =
      options.plots === undefined && options.initialLayout
        ? createDefaultFarmingLayout(
            options.initialLayout.groundId,
            options.initialLayout.centerX,
            options.initialLayout.centerZ
          )
        : undefined;
    if (options.plots === undefined && !defaults)
      throw new Error("MISSING_DEPENDENCY: 默认布局需要地面标识 initialLayout.groundId");
    const plots = options.plots ?? defaults!.plots;
    validatePlotDefinitions(plots);
    this.storageLayout = options.storageLayout ? freezePlantContent(structuredClone(options.storageLayout)) : undefined;
    this.initialContainerCounts = options.initialContainerCounts
      ? Object.freeze({ ...options.initialContainerCounts })
      : undefined;
    this.repository = options.repository;
    this.initialStorage = options.initialStorage
      ? freezePlantContent(structuredClone(options.initialStorage))
      : undefined;
    this.groundProvider = options.groundProvider;
    this.grid = Object.freeze({ ...(options.grid ?? defaults?.grid ?? DEFAULT_PLOT_GRID) });
    this.farmId = options.farmId;
    this.layoutId = options.layoutId;
    this.layoutVersion = options.layoutVersion;
    this._simulationConfig = resolveSimulationConfig(options.definitions.soilProfile, {
      ...options.simulationConfig,
      ...(options.simulationStepMs === undefined ? {} : { stepMs: options.simulationStepMs }),
      ...(options.maximumCatchUpMs === undefined ? {} : { maximumCatchUpMs: options.maximumCatchUpMs }),
      ...(options.checkpointIntervalMs === undefined ? {} : { checkpointIntervalMs: options.checkpointIntervalMs })
    });
    validateSimulationConfig(this.simulationConfig, this.grid.cellSize);
    this.definitions = Object.freeze({
      ...options.definitions,
      storage: freezePlantContent(structuredClone(storageDefinitions(options.definitions))),
      soilProfile: simulationSoilProfile(options.definitions.soilProfile, this.simulationConfig)
    });
    this.plots = plots;
    this.validateSnapshotPlacement = options.validateSnapshotPlacement ?? true;
    this.initialSnapshot = options.initialSnapshot ? structuredClone(options.initialSnapshot) : undefined;
    this.createCropInstanceId = options.createCropInstanceId ?? defaultInstanceId;
    this.sampleEnvironment = options.sampleEnvironment;
    this.captureWaterSupply = options.captureWaterSupply;
    this.clock = options.clock ?? new BrowserSystemClock();
    this.autoAdvance = options.autoAdvance ?? false;
    this.simulationStepMs = this.simulationConfig.stepMs;
    this.checkpointIntervalMs = this.simulationConfig.checkpointIntervalMs;
  }

  async initialize(): Promise<FarmSnapshot> {
    this.lifetime.signal.throwIfAborted();
    if (this.disposed) throw new Error("Farming service has been disposed.");
    this.groundInspections.clear();
    const timeOptions = this.timeOptions();
    const nowMs = this.clock.nowMs();
    let callbackFailure: unknown;
    const initializeCallback = <T>(callback: () => T): T => {
      try {
        return callback();
      } catch (error) {
        callbackFailure = error;
        throw error;
      }
    };
    const initialized = await this.transact(
      this.farmId,
      () => initializeCallback(() => this.createInitial(nowMs)),
      (current) =>
        initializeCallback(() => {
          this.lifetime.signal.throwIfAborted();
          const validated = this.validatedSnapshot(current);
          const refreshed = refreshPlotGround(
            validated,
            this.groundProvider.capture(),
            nowMs,
            undefined,
            true,
            this.groundInspections
          );
          // Both saved and current ground must be available to credit the offline interval.
          const conservative = freezeSnapshot({
            ...refreshed.snapshot,
            plots: refreshed.snapshot.plots.map((plot, i) =>
              validated.plots[i].ground.availability === "available"
                ? plot
                : {
                    ...plot,
                    ground: {
                      ...plot.ground,
                      availability: validated.plots[i].ground.availability,
                      reason: validated.plots[i].ground.reason
                    }
                  }
            )
          });
          const settled = settleFarmTime(conservative, nowMs, this.definitions, timeOptions);
          const advanced = {
            ...settled,
            snapshot: freezeSnapshot({
              ...settled.snapshot,
              plots: settled.snapshot.plots.map((plot, i) => ({
                ...plot,
                ground: refreshed.snapshot.plots[i].ground
              }))
            }),
            changes: [...settled.changes, ...refreshed.changes]
          };
          const changed =
            validated !== current ||
            settled.elapsedSystemTimeMs > 0 ||
            settled.changes.length > 0 ||
            refreshed.changes.length > 0 ||
            advanced.snapshot.environment.airTemperatureTenths !== validated.environment.airTemperatureTenths ||
            advanced.snapshot.environment.lightUnits !== validated.environment.lightUnits;
          const snapshot = changed
            ? freezeSnapshot({ ...advanced.snapshot, revision: current.revision + 1 })
            : validated;
          this.validatedSnapshot(snapshot);
          return {
            snapshot,
            value: {
              snapshot,
              summary: Object.freeze({
                elapsedSystemTimeMs: advanced.elapsedSystemTimeMs,
                simulatedElapsedMs: advanced.simulatedElapsedMs,
                capped: advanced.capped,
                changes: advanced.changes
              })
            }
          };
        }),
      this.lifetime.signal
    ).catch((error) => {
      if (this.lifetime.signal.aborted) throw new FarmingInitializationError("CANCELLED", error);
      if (error instanceof FarmingInitializationError) throw error;
      if (callbackFailure) throw callbackFailure;
      throw new FarmingInitializationError("STORAGE_FAILURE", error);
    });
    this.snapshot = freezeSnapshot(initialized.snapshot);
    if (this.disposed) return this.snapshot;
    this.lastCatchUp = initialized.summary;
    this.lastCheckpointSystemTimeMs = nowMs;
    this.unsubscribeRepository ??= this.repository.subscribe(this.farmId, () => {
      const task = this.queue.then(() => this.refreshFromRepository());
      this.queue = task.catch((error) => this.reportError("refresh", error));
    });
    this.unsubscribeGround ??= this.groundProvider.subscribe((change) => {
      const time = this.clock.nowMs(),
        view = this.groundProvider.capture();
      const task = this.queue.then(() => this.refreshGroundNow(change, view, time));
      this.queue = task.catch((error) => this.reportError("checkpoint", error));
    });
    if (this.autoAdvance) this.startClock();
    return this.snapshot;
  }

  getSnapshot(): FarmSnapshot {
    if (!this.snapshot) throw new Error("Farming service has not been initialized.");
    return this.snapshot;
  }

  getInventory(): Readonly<Record<string, number>> {
    return this.getSnapshot().inventory;
  }
  getContainers(query: StorageContainerQuery = {}): readonly StorageContainerView[] {
    const rules = storageDefinitions(this.definitions);
    return Object.freeze(
      this.getSnapshot()
        .storage.containers.filter(
          (c) =>
            (query.typeId === undefined || c.typeId === query.typeId) &&
            (query.cropId === undefined || containerContents(c).some((entry) => entry.cropId === query.cropId))
        )
        .map((c) => {
          const contents = Object.freeze(containerContents(c).map((entry) => Object.freeze({ ...entry })));
          const single = contents.length === 1 ? contents[0] : undefined;
          const { additionalContents: _, ...base } = c;
          return Object.freeze({
            ...base,
            cropId: single?.cropId ?? null,
            itemId: single?.itemId ?? null,
            quantity: containerQuantity(c),
            contents,
            displayCapacity: storageDisplayCapacity(c, rules),
            name: rules.containers.find((t) => t.id === c.typeId)!.name,
            cropName: contents.length
              ? contents
                  .map((entry) => this.definitions.catalog.crops.find((crop) => crop.id === entry.cropId)!.name)
                  .join("、")
              : null,
            capacity: isCartStorage(rules, c.typeId) ? null : single ? rules.crops[single.cropId].capacity : null,
            unit: single ? rules.crops[single.cropId].unit : null
          });
        })
    );
  }
  setContainerCount(
    input: { readonly typeId: string; readonly count: number },
    options: FarmActionOptions = {}
  ): Promise<CommandResult> {
    return this.mutate({ ...input, type: "set-container-count" }, options);
  }
  withdrawInventory(
    input: { readonly itemId: string; readonly quantity: number; readonly containerId?: string },
    options: FarmActionOptions = {}
  ): Promise<CommandResult> {
    return this.mutate({ ...input, type: "withdraw-inventory" }, options);
  }
  executeItem(input: FarmItemInput, options: FarmActionOptions = {}): Promise<CommandResult> {
    return this.mutate(input, options);
  }
  getLastCatchUpSummary(): FarmTimeAdvanceSummary {
    return this.lastCatchUp;
  }

  inspectCultivation(target: GroundTarget): CultivationInspection {
    if (!isGroundTarget(target)) throw new Error("Invalid ground target");
    const existing = this.getSnapshot().plots.find(
      (p) => p.groundId === target.groundId && p.cellX === target.cellX && p.cellZ === target.cellZ
    );
    const view = this.groundProvider.capture();
    const inspection = existing
      ? this.groundInspections.inspect(view, this.grid, existing, existing.plotId)
      : inspectGround(view, this.grid, target);
    return storageBlocksCultivation(this.getSnapshot(), this.definitions, target)
      ? Object.freeze({ ...inspection, canCultivate: false, reason: "GROUND_BLOCKED" as const })
      : inspection;
  }

  getPlot(plotId: string): PlotView | null {
    const snapshot = this.getSnapshot(),
      plot = snapshot.plots.find((p) => p.plotId === plotId);
    const waterSupply = this.captureWaterSupply?.();
    const environment = this.getEnvironment(waterSupply);
    return plot
      ? resolvePlotView(
          snapshot,
          this.definitions,
          this.groundProvider.capture(),
          plot,
          this.clock.nowMs(),
          this.groundInspections,
          this.simulationConfig,
          environment,
          waterSupply
        )
      : null;
  }
  getPlots(plotIds: readonly string[]): readonly (PlotView | null)[] {
    const snapshot = this.getSnapshot(),
      view = this.groundProvider.capture(),
      byId = new Map(snapshot.plots.map((p) => [p.plotId, p]));
    const waterSupply = this.captureWaterSupply?.();
    const environment = this.getEnvironment(waterSupply);
    return Object.freeze(
      plotIds.map((id) => {
        const plot = byId.get(id);
        return plot
          ? resolvePlotView(
              snapshot,
              this.definitions,
              view,
              plot,
              this.clock.nowMs(),
              this.groundInspections,
              this.simulationConfig,
              environment,
              waterSupply
            )
          : null;
      })
    );
  }
  getFieldValues(fieldId: "soilMoisture", plotIds: readonly string[]): FieldValueResult {
    if (fieldId !== "soilMoisture") throw new Error(`Unsupported farming field: ${fieldId}`);
    const snapshot = this.getSnapshot(),
      view = this.groundProvider.capture();
    const byId = new Map(snapshot.plots.map((plot) => [plot.plotId, plot]));
    return Object.freeze({
      fieldId,
      revision: snapshot.revision,
      groundRevision: view.revision,
      values: Object.freeze(
        plotIds.map((id) => {
          const plot = byId.get(id);
          return plot
            ? Object.freeze({
                plotId: id,
                value: plot.soil.moistureUnits,
                availability: resolvePlotView(
                  snapshot,
                  this.definitions,
                  view,
                  plot,
                  this.clock.nowMs(),
                  this.groundInspections,
                  this.simulationConfig
                ).ground.availability
              })
            : null;
        })
      )
    });
  }

  queryPlots(query: PlotQuery = {}): readonly PlotView[] {
    const snapshot = this.getSnapshot(),
      view = this.groundProvider.capture();
    const waterSupply = this.captureWaterSupply?.();
    const environment = this.getEnvironment(waterSupply);
    return Object.freeze(
      snapshot.plots
        .map((p) =>
          resolvePlotView(
            snapshot,
            this.definitions,
            view,
            p,
            this.clock.nowMs(),
            this.groundInspections,
            this.simulationConfig,
            environment,
            waterSupply
          )
        )
        .filter((p) => matchesPlotQuery(p, query))
        .sort((a, b) => a.plotId.localeCompare(b.plotId))
    );
  }
  createPlot(target: CreatePlotInput, options: FarmActionOptions = {}): Promise<CommandResult> {
    return this.mutate({ type: "create-plot", target }, options);
  }
  updatePlot(plotId: string, patch: PlotPatch, options: FarmActionOptions = {}): Promise<CommandResult> {
    return this.mutate({ type: "update-plot", plotId, patch }, options);
  }
  deletePlot(
    plotId: string,
    options: FarmActionOptions & { readonly cascadeCrop?: boolean } = {}
  ): Promise<CommandResult> {
    return this.mutate({ type: "delete-plot", plotId, cascadeCrop: options.cascadeCrop }, options);
  }

  getAvailableActions(target: string | GroundTarget): readonly ActionAvailability[] {
    const snapshot = this.getSnapshot(),
      view = this.groundProvider.capture();
    const plot =
      typeof target === "string"
        ? snapshot.plots.find((p) => p.plotId === target)
        : snapshot.plots.find(
            (p) => p.groundId === target.groundId && p.cellX === target.cellX && p.cellZ === target.cellZ
          );
    if (plot) {
      const inspection = this.groundInspections.inspect(view, this.grid, plot, plot.plotId);
      // Availability needs current cultivation facts, not a water-connectivity refresh.
      const refreshed = {
        ...snapshot,
        plots: [{ ...plot, ground: groundState(inspection, this.clock.nowMs(), plot.ground) }]
      };
      return getActionAvailability(refreshed, this.definitions, inspection.plotId);
    }
    const inspection = typeof target === "string" ? null : this.inspectCultivation(target);
    return this.getActionDefinitions().map(({ id }) => ({
      action: id,
      enabled: id === "hoe" && Boolean(inspection?.canCultivate),
      reason:
        id === "hoe" && inspection
          ? inspection.reason
            ? GROUND_REASON_MESSAGES[inspection.reason]
            : undefined
          : "请先锄地开垦"
    }));
  }

  getActionDefinitions(): readonly FarmActionDefinition[] {
    return getActionDefinitions();
  }

  /** Captures the calling revision before queueing. Retry using the original options and input.
   * Coordinated animations may settle a proven clock-only change at the serial execution boundary.
   */
  executeAction(
    input: FarmActionInput,
    options: FarmActionOptions = {},
    signal?: AbortSignal,
    requestSignature?: string,
    canSettleClock?: (snapshot: FarmSnapshot) => boolean
  ): Promise<CommandResult> {
    const commandId =
      options.commandId ??
      globalThis.crypto?.randomUUID?.() ??
      `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const expectedRevision = options.expectedRevision ?? this.snapshot?.revision ?? 0;
    if (
      !isFarmActionInput(input) ||
      typeof commandId !== "string" ||
      !commandId.trim() ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0
    ) {
      return Promise.resolve({
        ok: false,
        commandId,
        revision: this.snapshot?.revision ?? 0,
        replayed: false,
        changes: [],
        error: { code: "INVALID_COMMAND", message: "操作或参数无效" }
      });
    }
    return this.enqueueCommand(
      {
        ...input,
        farmId: this.farmId,
        commandId,
        expectedRevision,
        expectedGroundRevision: options.expectedGroundRevision,
        expectedCarriedItemId: options.expectedCarriedItemId
      },
      signal,
      requestSignature,
      canSettleClock
    );
  }

  getFarmStatus(): readonly PlotStatusView[] {
    const snapshot = this.prepareStatusCache();
    if (this.statuses === null) {
      this.statuses = Object.freeze(
        snapshot.plots.map(
          (plot) =>
            this.statusByPlot.get(plot.plotId) ??
            this.cachePlotStatus(createPlotStatus(snapshot, this.definitions, plot, this.simulationConfig))
        )
      );
    }
    return this.statuses;
  }

  getPlotStatus(plotId: string): PlotStatusView | undefined {
    const snapshot = this.prepareStatusCache();
    const cached = this.statusByPlot.get(plotId);
    if (cached) return cached;
    const plot = snapshot.plots.find((candidate) => candidate.plotId === plotId);
    return plot
      ? this.cachePlotStatus(createPlotStatus(snapshot, this.definitions, plot, this.simulationConfig))
      : undefined;
  }

  getCropStatus(instanceId: string): CropStatusView | undefined {
    const snapshot = this.prepareStatusCache();
    const cached = this.statusByCrop.get(instanceId);
    if (cached) return cached;
    const crop = snapshot.crops[instanceId];
    if (!crop) return undefined;
    const status = this.getPlotStatus(crop.anchorPlotId)?.crop;
    return status?.instanceId === instanceId ? status : undefined;
  }

  private prepareStatusCache(): FarmSnapshot {
    const snapshot = this.getSnapshot();
    // Clock ticks may change values without changing the persisted revision.
    // Immutable snapshot identity is the cache key, rather than revision alone.
    if (this.statusSnapshot !== snapshot) {
      this.statuses = null;
      this.statusByPlot.clear();
      this.statusByCrop.clear();
      this.statusSnapshot = snapshot;
    }
    return snapshot;
  }

  private cachePlotStatus(status: PlotStatusView): PlotStatusView {
    this.statusByPlot.set(status.plotId, status);
    if (status.crop) this.statusByCrop.set(status.crop.instanceId, status.crop);
    return status;
  }

  /** Committed bindings always win over transient attempts, including after Scene restoration. */
  getCommandBinding(commandId: string): FarmCommandBinding | undefined {
    return (
      this.snapshot?.recentReceipts.find((r) => r.commandId === commandId)?.binding ??
      this.pendingBindings.get(commandId)
    );
  }

  execute(command: FarmCommand, signal?: AbortSignal, requestSignature?: string): Promise<CommandResult> {
    return this.enqueueCommand(command, signal, requestSignature);
  }

  private enqueueCommand(
    command: FarmCommand,
    signal?: AbortSignal,
    requestSignature?: string,
    canSettleClock?: (snapshot: FarmSnapshot) => boolean
  ): Promise<CommandResult> {
    const invalidId = (command as unknown as { commandId?: unknown } | null)?.commandId;
    if (
      !isFarmCommand(command) ||
      (requestSignature !== undefined &&
        (typeof requestSignature !== "string" ||
          !requestSignature ||
          requestSignature.length > MAX_REQUEST_SIGNATURE_LENGTH))
    )
      return Promise.resolve({
        ok: false,
        commandId: typeof invalidId === "string" ? invalidId : "",
        revision: this.snapshot?.revision ?? 0,
        replayed: false,
        changes: [],
        error: { code: "INVALID_COMMAND", message: "操作或参数无效" }
      });
    const copied = Object.freeze(structuredClone(command));
    const existing = this.getCommandBinding(command.commandId);
    if (requestSignature !== undefined) {
      if (existing && commandSignature(existing.command) !== commandSignature(copied))
        return Promise.resolve({
          ok: false,
          commandId: copied.commandId,
          revision: this.snapshot?.revision ?? 0,
          replayed: false,
          changes: [],
          error: { code: "INVALID_COMMAND", message: "命令 ID 已用于不同请求" }
        });
      if (!existing) {
        this.pendingBindings.set(command.commandId, freezeCommandBinding({ requestSignature, command: copied }));
        if (this.pendingBindings.size > 256) this.pendingBindings.delete(this.pendingBindings.keys().next().value!);
      }
    }
    const combined = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    const task = this.queue
      .then(() => {
        // Earlier checkpoints have completed here. A prior binding/retry stays pinned,
        // and the repository transaction still validates this exact resolved revision.
        const resolved =
          !existing &&
          !combined.aborted &&
          this.snapshot &&
          copied.expectedRevision < this.snapshot.revision &&
          canSettleClock?.(this.snapshot)
            ? Object.freeze({ ...copied, expectedRevision: this.snapshot.revision })
            : copied;
        if (resolved !== copied && requestSignature !== undefined)
          this.pendingBindings.set(resolved.commandId, freezeCommandBinding({ requestSignature, command: resolved }));
        return this.executeNow(resolved, combined, requestSignature);
      })
      .then((receipt) => {
        if (!receipt.ok) this.reportFailure(receipt.error?.message ?? "农场操作失败");
        return receipt;
      });
    this.queue = task.catch(() => undefined);
    return task;
  }

  checkpoint(targetSystemTimeMs = this.clock.nowMs()): Promise<FarmSnapshot> {
    const task = this.queue.then(() => this.checkpointNow(targetSystemTimeMs));
    this.queue = task.catch((error) => {
      this.reportError("checkpoint", error);
    });
    return task;
  }

  /** Settle elapsed time at the old rates before changing this session's growth controls. */
  setGrowthMultipliers(values: Partial<Pick<FarmingSimulationConfig, "cropGrowthMultiplier">>): Promise<void> {
    const requested = { ...values };
    const task = this.queue.then(async () => {
      const next = Object.freeze({ ...this.simulationConfig, ...requested });
      validateSimulationConfig(next, this.grid.cellSize);
      await this.checkpointNow(this.clock.nowMs());
      this._simulationConfig = next;
      this.statusSnapshot = null;
      this.publish({ snapshot: this.getSnapshot(), changes: [], source: "local" });
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  subscribe(listener: (change: FarmingServiceChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeErrors(listener: (failure: FarmingServiceError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    if (this.tickTimer !== null && typeof window !== "undefined") window.clearInterval(this.tickTimer);
    this.tickTimer = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.unsubscribeGround?.();
    this.unsubscribeGround = null;
    this.unsubscribeRepository?.();
    this.unsubscribeRepository = null;
    this.listeners.clear();
    this.errorListeners.clear();
    this.failureListeners.clear();
    this.groundInspections.clear();
    this.statusSnapshot = null;
    this.statuses = null;
    this.statusByPlot.clear();
    this.statusByCrop.clear();
    this.pendingBindings.clear();
  }

  /** Wait before releasing an injected repository or Scene resources. */
  async whenIdle(): Promise<void> {
    await this.queue;
  }

  /** Water-only publications can invalidate portable props without refreshing every farm plot. */
  refreshItemsGround(): Promise<void> {
    const task = this.queue.then(async () => {
      if (!this.snapshot || this.disposed) return;
      const previousRevision = this.snapshot.revision;
      const view = this.groundProvider.capture();
      const result = await this.transact(
        this.farmId,
        () => this.createInitial(this.clock.nowMs()),
        (current) => {
          const validated = this.validatedSnapshot(current);
          const grounded = regroundFarmItems(validated, this.definitions, view);
          const snapshot = grounded.changes.length
            ? freezeSnapshot({ ...validated, items: grounded.items, revision: validated.revision + 1 })
            : validated;
          return { snapshot, value: { snapshot, ...grounded } };
        },
        this.lifetime.signal
      );
      this.snapshot = result.snapshot;
      if (result.changes.length || result.snapshot.revision !== previousRevision)
        this.publish({
          snapshot: result.snapshot,
          changes: result.changes,
          source: result.changes.length ? "local" : "external"
        });
      if (result.blocked.length) this.reportFailure(`地面变化后未找到道具有效落点：${result.blocked.join("、")}`);
    });
    this.queue = task.catch((error) => this.reportError("refresh", error));
    return task;
  }

  /** Host terrain chooses the final legal nearby placement; AI origins do not use the player camera. */
  getActionItemOrigin(
    input: FarmActionInput
  ): { groundId: string; position: readonly [number, number, number] } | null {
    const snapshot = this.getSnapshot();
    const target = input.type === "hoe" ? input.target : snapshot.plots.find((plot) => plot.plotId === input.plotId);
    if (!target) return null;
    const x = snapshot.grid.originX + (target.cellX + 0.5) * snapshot.grid.cellSize;
    const z = snapshot.grid.originZ + (target.cellZ + 0.5) * snapshot.grid.cellSize;
    const sample = this.groundProvider.capture().sample(target.groundId, x, z);
    return sample ? { groundId: target.groundId, position: [x + 1.5, sample.position[1], z] } : null;
  }

  getGroundRevision(): number {
    return this.groundProvider.capture().revision;
  }

  private startClock(): void {
    if (typeof window === "undefined" || this.tickTimer !== null) return;
    this.tickTimer = window.setInterval(() => void this.enqueueTick(), this.simulationStepMs);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") void this.checkpoint();
    else void this.enqueueTick(true);
  };

  private enqueueTick(forceCheckpoint = false): Promise<void> {
    const task = this.queue.then(() => this.tickNow(forceCheckpoint));
    this.queue = task.catch((error) => {
      this.reportError("clock", error);
    });
    return task;
  }

  private async tickNow(forceCheckpoint: boolean): Promise<void> {
    if (!this.snapshot || this.disposed) return;
    const timeOptions = this.timeOptions();
    const nowMs = this.clock.nowMs();
    const observed = refreshPlotGround(
      this.snapshot,
      this.groundProvider.capture(),
      nowMs,
      undefined,
      false,
      this.groundInspections
    );
    if (observed.changes.length) {
      await this.checkpointNow(nowMs, timeOptions);
      return;
    }
    const advanced = settleFarmTime(this.snapshot, nowMs, this.definitions, timeOptions);
    if (advanced.snapshot !== this.snapshot) {
      this.snapshot = advanced.snapshot;
      if (advanced.changes.length)
        this.publish({ snapshot: this.snapshot, changes: advanced.changes, source: "clock" });
    }
    if (forceCheckpoint || nowMs - this.lastCheckpointSystemTimeMs >= this.checkpointIntervalMs) {
      await this.checkpointNow(nowMs, timeOptions);
    }
  }

  private async checkpointNow(targetSystemTimeMs: number, timeOptions = this.timeOptions()): Promise<FarmSnapshot> {
    if (!this.snapshot || this.disposed) throw new Error("Farming service has not been initialized.");
    const observedRevision = this.snapshot.revision;
    const committed = await this.transact(
      this.farmId,
      () => this.createInitial(targetSystemTimeMs),
      (current) => {
        const validated = this.validatedSnapshot(current);
        const refreshed = refreshPlotGround(
          validated,
          this.groundProvider.capture(),
          targetSystemTimeMs,
          undefined,
          false,
          this.groundInspections
        );
        const settled = settleFarmTime(refreshed.snapshot, targetSystemTimeMs, this.definitions, timeOptions);
        const advanced = { ...settled, changes: [...refreshed.changes, ...settled.changes] };
        const changed = advanced.snapshot !== validated;
        const snapshot = changed
          ? freezeSnapshot({ ...advanced.snapshot, revision: current.revision + 1 })
          : advanced.snapshot;
        this.validatedSnapshot(snapshot);
        return {
          snapshot,
          value: {
            snapshot,
            changes: advanced.changes,
            clockOnly: validated.revision === observedRevision && refreshed.changes.length === 0
          }
        };
      }
    );
    this.lastCheckpointSystemTimeMs = targetSystemTimeMs;
    const previous = this.snapshot;
    this.snapshot = freezeSnapshot(committed.snapshot);
    if (this.snapshot !== previous && (committed.changes.length || !committed.clockOnly)) {
      this.publish({
        snapshot: this.snapshot,
        changes: committed.changes,
        source: committed.clockOnly ? "clock" : "external"
      });
    }
    return this.snapshot;
  }

  private async executeNow(
    command: FarmCommand,
    signal?: AbortSignal,
    requestSignature?: string
  ): Promise<CommandResult> {
    if (signal?.aborted)
      return {
        ok: false,
        commandId: command.commandId,
        revision: this.snapshot?.revision ?? 0,
        replayed: false,
        changes: [],
        error: { code: "CANCELLED", message: "操作已取消" }
      };
    if (!this.snapshot || this.disposed) {
      return {
        ok: false,
        commandId: command.commandId,
        revision: this.snapshot?.revision ?? 0,
        replayed: false,
        changes: [],
        error: { code: "NOT_INITIALIZED", message: "农场尚未完成加载" }
      };
    }
    const timeOptions = this.timeOptions();
    const targetSystemTimeMs = command.type === "advance-time" ? command.targetSystemTimeMs : this.clock.nowMs();
    let committed: ApplyFarmCommandResult & { readonly persistedChange: boolean };
    try {
      committed = await this.transact(
        this.farmId,
        () => this.createInitial(targetSystemTimeMs),
        (current) => {
          signal?.throwIfAborted();
          const validated = this.validatedSnapshot(current);
          // A different runtime may have committed since this service's local observation.
          // Resolve the same original request from the authoritative transaction receipt.
          const binding = validated.recentReceipts.find((r) => r.commandId === command.commandId)?.binding;
          const resolved =
            requestSignature && binding?.requestSignature === requestSignature ? binding.command : command;
          const view = this.groundProvider.capture();
          if (resolved.type === "damage-crop" || resolved.type === "consume-basket") {
            const preflight = applyFarmCommand(validated, resolved, this.definitions, {
              groundView: view,
              createCropInstanceId: this.createCropInstanceId,
              targetSystemTimeMs: validated.simulation.lastSystemTimeMs,
              simulationConfig: this.simulationConfig
            });
            if (!preflight.result.ok || preflight.result.replayed || preflight.snapshot === validated)
              return { snapshot: validated, value: { ...preflight, persistedChange: false } };
          }
          const refreshed = refreshPlotGround(
            validated,
            view,
            targetSystemTimeMs,
            undefined,
            false,
            this.groundInspections
          );
          let applied = applyFarmCommand(refreshed.snapshot, resolved, this.definitions, {
            groundView: view,
            createCropInstanceId: this.createCropInstanceId,
            targetSystemTimeMs,
            ...timeOptions
          });
          if (requestSignature && applied.result.ok && !applied.result.replayed) {
            const binding = freezeCommandBinding({ requestSignature, command });
            applied = {
              ...applied,
              snapshot: freezeSnapshot({
                ...applied.snapshot,
                recentReceipts: applied.snapshot.recentReceipts.map((r) =>
                  r.commandId === command.commandId ? { ...r, binding } : r
                )
              })
            };
          }
          if (!applied.result.replayed && refreshed.changes.length) {
            const result = { ...applied.result, changes: [...refreshed.changes, ...applied.result.changes] };
            const next = freezeSnapshot({
              ...applied.snapshot,
              revision:
                applied.snapshot.revision === validated.revision ? validated.revision + 1 : applied.snapshot.revision,
              recentReceipts: applied.snapshot.recentReceipts.map((receipt) =>
                receipt.commandId === command.commandId ? { ...receipt, changes: result.changes } : receipt
              )
            });
            this.validatedSnapshot(next);
            return {
              snapshot: next,
              value: { snapshot: next, result: { ...result, revision: next.revision }, persistedChange: true }
            };
          }
          const next = applied.result.replayed ? validated : applied.snapshot;
          this.validatedSnapshot(next);
          return {
            snapshot: next,
            value: { snapshot: next, result: applied.result, persistedChange: next !== validated }
          };
        },
        signal
      );
    } catch (error) {
      return {
        ok: false,
        commandId: command.commandId,
        revision: this.snapshot.revision,
        replayed: false,
        changes: [],
        error: {
          code: signal?.aborted ? "CANCELLED" : "STORAGE_FAILURE",
          message: signal?.aborted ? "操作已取消" : error instanceof Error ? error.message : "农场数据保存失败"
        }
      };
    }
    // An unchanged transaction can return a checkpoint older than the live simulation.
    // A newer authoritative revision still wins, including for failed commands and replays.
    const previousSnapshot = this.snapshot;
    const preserveLocal =
      !committed.persistedChange &&
      committed.snapshot.revision === previousSnapshot.revision &&
      committed.snapshot.simulation.lastSystemTimeMs <= previousSnapshot.simulation.lastSystemTimeMs;
    if (!preserveLocal) this.snapshot = freezeSnapshot(committed.snapshot);
    if (committed.result.ok) this.pendingBindings.delete(command.commandId);
    if (!committed.result.replayed && committed.result.changes.length) {
      this.publish({ snapshot: this.snapshot, changes: committed.result.changes, source: "local" });
    } else if (!committed.persistedChange && this.snapshot !== previousSnapshot) {
      this.publish({ snapshot: this.snapshot, changes: [], source: "external" });
    } else if (!committed.result.ok) {
      this.publish({ snapshot: this.snapshot, changes: [], source: "local" });
    }
    return committed.result;
  }

  private async refreshFromRepository(): Promise<void> {
    if (!this.snapshot || this.disposed) return;
    try {
      const stored = await this.repository.read(this.farmId);
      if (!stored || this.disposed) return;
      const validated = this.validatedSnapshot(stored);
      if (validated.revision <= this.snapshot.revision) return;
      this.snapshot = freezeSnapshot(validated);
      this.publish({ snapshot: this.snapshot, changes: [], source: "external" });
    } catch (error) {
      this.reportError("refresh", error);
    }
  }

  private mutate(
    input:
      | { type: "create-plot"; target: CreatePlotInput }
      | { type: "update-plot"; plotId: string; patch: PlotPatch }
      | { type: "delete-plot"; plotId: string; cascadeCrop?: boolean }
      | StorageWriteInput
      | FarmItemInput,
    options: FarmActionOptions
  ): Promise<CommandResult> {
    return this.execute({
      ...input,
      farmId: this.farmId,
      commandId: options.commandId ?? defaultInstanceId(),
      expectedRevision: options.expectedRevision ?? this.snapshot?.revision ?? 0,
      expectedGroundRevision: options.expectedGroundRevision,
      expectedCarriedItemId: options.expectedCarriedItemId
    });
  }

  private async refreshGroundNow(
    change: FarmingGroundChange,
    view: ReturnType<FarmingGroundProvider["capture"]>,
    time: number
  ): Promise<void> {
    if (!this.snapshot || this.disposed) return;
    const previousRevision = this.snapshot.revision;
    const timeOptions = this.timeOptions();
    const result = await this.transact(
      this.farmId,
      () => this.createInitial(time),
      (current) => {
        const validated = this.validatedSnapshot(current);
        const settled = settleFarmTime(validated, time, this.definitions, timeOptions);
        const refreshed = refreshPlotGround(settled.snapshot, view, time, change, false, this.groundInspections);
        const regrounded = regroundFarmItems(refreshed.snapshot, this.definitions, view);
        const changed =
          settled.snapshot !== validated || refreshed.snapshot !== settled.snapshot || regrounded.changes.length > 0;
        const snapshot = changed
          ? freezeSnapshot({ ...refreshed.snapshot, items: regrounded.items, revision: validated.revision + 1 })
          : validated;
        this.validatedSnapshot(snapshot);
        return {
          snapshot,
          value: { snapshot, changes: [...settled.changes, ...refreshed.changes, ...regrounded.changes] }
        };
      }
    );
    if (this.disposed) return;
    this.snapshot = result.snapshot;
    if (result.changes.length || result.snapshot.revision !== previousRevision)
      this.publish({
        snapshot: result.snapshot,
        changes: result.changes,
        source: result.changes.length ? "local" : "external"
      });
  }

  private transact<T>(
    farmId: string,
    createInitial: () => FarmSnapshot,
    operation: (current: FarmSnapshot) => FarmRepositoryTransaction<T>,
    signal?: AbortSignal
  ): Promise<T> {
    return this.repository.transact(
      farmId,
      createInitial,
      (current) => {
        const result = operation(current);
        return {
          snapshot: result.snapshot,
          value: result.value
        };
      },
      signal
    );
  }

  private createInitial(systemTimeMs: number): FarmSnapshot {
    if (this.initialSnapshot) return freezeSnapshot(this.validatedSnapshot(this.initialSnapshot));
    const issues: FarmingDiagnosticIssue[] = [];
    const initial = createInitialFarmSnapshot({
      farmId: this.farmId,
      layoutId: this.layoutId,
      layoutVersion: this.layoutVersion,
      definitions: this.definitions,
      plots: this.plots,
      grid: this.grid,
      systemTimeMs,
      simulationConfig: this.simulationConfig,
      groundView: this.groundProvider.capture(),
      storageLayout: this.storageLayout,
      initialContainerCounts: this.initialContainerCounts,
      initialStorage: this.initialStorage,
      onItemPlacementFailure: (issue) => issues.push(Object.freeze(issue))
    });
    this.initialItemDiagnostics = Object.freeze(issues);
    return freezeSnapshot(
      refreshPlotGround(initial, this.groundProvider.capture(), systemTimeMs, undefined, false, this.groundInspections)
        .snapshot
    );
  }

  private validate(snapshot: FarmSnapshot): void {
    validateFarmSnapshot(snapshot, {
      farmId: this.farmId,
      layoutId: this.layoutId,
      layoutVersion: this.layoutVersion,
      definitions: this.definitions,
      plots: this.plots,
      grid: this.grid,
      validatePlacement: this.validateSnapshotPlacement
    });
  }

  private validatedSnapshot(snapshot: FarmSnapshot): FarmSnapshot {
    try {
      return validateConfiguredFarmSnapshot(
        snapshot,
        {
          farmId: this.farmId,
          layoutId: this.layoutId,
          layoutVersion: this.layoutVersion,
          definitions: this.definitions,
          plots: this.plots,
          grid: this.grid,
          validatePlacement: this.validateSnapshotPlacement
        },
        this.simulationConfig
      );
    } catch (error) {
      throw new FarmingInitializationError("INVALID_SNAPSHOT", error);
    }
  }

  getEnvironment(waterSupply = this.captureWaterSupply?.()): import("../domain/FarmEnvironment").FarmEnvironmentView {
    const snapshot = this.getSnapshot();
    return {
      ...(this.sampleEnvironment?.() ?? {
        availability: "static-baseline" as const,
        season: null,
        baseTemperatureCelsius: null,
        snowing: false,
        ...snapshot.environment,
        dayFactor: null,
        cloudCoverage: null,
        rainRate: 0,
        rainWaterPerMinute: 0
      }),
      nearWater: waterSupply?.diagnostics ?? null,
      agriculturalTimeMs: snapshot.simulation.lastSystemTimeMs,
      simulatedTimeMs: snapshot.simulation.simulatedTimeMs,
      settledEnvironment: snapshot.environment
    };
  }

  private timeOptions() {
    return {
      simulationConfig: this.simulationConfig,
      environment: this.sampleEnvironment?.(),
      waterSupply: this.captureWaterSupply?.()
    };
  }

  private publish(change: FarmingServiceChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (error) {
        this.reportError("listener", error);
      }
    }
  }

  private reportError(operation: FarmingServiceErrorOperation, error: unknown): void {
    const failure = Object.freeze({ operation, error });
    for (const listener of this.errorListeners) {
      try {
        listener(failure);
      } catch (listenerError) {
        console.error("Farming service error listener failed.", listenerError);
      }
    }
  }
}

function defaultInstanceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `crop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface FarmingServiceChange {
  readonly snapshot: FarmSnapshot;
  readonly changes: readonly FarmChange[];
  readonly source: "local" | "external" | "clock";
}
