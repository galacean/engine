import { planningFarmInitialization, PLANNING_FARMING_PROJECT_PATH, type PlanningFarmInitialization } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmInitialization";
import type { JSONAsset } from "@galacean/engine-core";
import type { FarmRepository, FarmSnapshot } from "@galacean/engine-farming/farming/api/index";
import type {
  FarmRepositoryListener,
  FarmRepositoryTransaction,
  FarmSnapshotReplacement
} from "@galacean/engine-farming/farming/persistence/FarmRepository";
import { freezeSnapshot } from "@galacean/engine-farming/farming/domain/FarmState";
import {
  diffWaterLayout,
  refreshWaterLayout,
  type WaterLayoutChange
} from "@galacean/engine-farming/farming/domain/fields/SoilWaterField";
import { FarmingInitializationError } from "@galacean/engine-farming/farming/application/FarmingInitializationError";
import { stableRequest } from "@galacean/engine-farming/farming/application/FarmingCommandBinding";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { validatePlanningFarmSave } from "./PlanningFarmSave.ts";

export { PLANNING_FARMING_PROJECT_PATH } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmInitialization";
export const PLANNING_FARMING_PROJECT_TYPE = "SeedWorldFarming";
interface FarmingProjectData {
  version: 1;
  farms: Record<string, FarmSnapshot>;
  initializations?: Record<string, PlanningFarmInitialization>;
}
interface FarmSubscriber {
  readonly origin?: symbol;
  readonly replacement?: FarmSnapshotReplacement;
}

/** Apply edits based on the durable file without replaying or undoing live settlement. */
function mergeSettledState(before: FarmSnapshot, edited: FarmSnapshot, settled: FarmSnapshot): FarmSnapshot {
  const previousPlots = new Map(before.plots.map((plot) => [plot.plotId, plot]));
  const settledPlots = new Map(settled.plots.map((plot) => [plot.plotId, plot]));
  const crops = { ...edited.crops };
  const plots = edited.plots.map((plot) => {
    const previous = previousPlots.get(plot.plotId);
    const live = settledPlots.get(plot.plotId);
    if (!previous || !live) return plot;
    const soil = {
      ...plot.soil,
      moistureUnits:
        plot.soil.moistureUnits === previous.soil.moistureUnits ? live.soil.moistureUnits : plot.soil.moistureUnits
    };
    const id = plot.occupantId;
    if (!id) return { ...plot, soil };
    const crop = crops[id];
    const previousCrop = before.crops[id];
    const liveCrop = settled.crops[id];
    if (id === previous.occupantId && live.occupantId === null && stableRequest(crop) === stableRequest(previousCrop)) {
      // Settlement can clear a destroyed crop from a legacy save.
      delete crops[id];
      return { ...plot, soil, occupantId: null };
    }
    if (
      previousCrop &&
      liveCrop &&
      crop.cropId === previousCrop.cropId &&
      crop.plantedAtSimulationMs === previousCrop.plantedAtSimulationMs
    ) {
      crops[id] = {
        ...crop,
        growthUnits: crop.growthUnits === previousCrop.growthUnits ? liveCrop.growthUnits : crop.growthUnits,
        growthRemainderPermille:
          crop.growthRemainderPermille === previousCrop.growthRemainderPermille
            ? liveCrop.growthRemainderPermille
            : crop.growthRemainderPermille,
        lastEvaluatedSimulationMs:
          crop.lastEvaluatedSimulationMs === previousCrop.lastEvaluatedSimulationMs
            ? liveCrop.lastEvaluatedSimulationMs
            : crop.lastEvaluatedSimulationMs
      };
    }
    return { ...plot, soil };
  });
  return {
    ...edited,
    simulation: settled.simulation,
    environment:
      stableRequest(edited.environment) === stableRequest(before.environment)
        ? settled.environment
        : edited.environment,
    plots,
    crops
  };
}

export function parsePlanningFarmingState(
  content: string | Uint8Array | undefined,
  ErrorType: typeof FarmingInitializationError = FarmingInitializationError
): FarmingProjectData {
  if (content === undefined) return { version: 1, farms: {} };
  try {
    const value = JSON.parse(
      typeof content === "string" ? content : new TextDecoder("utf-8", { fatal: true }).decode(content)
    );
    if (value?.version !== 1 || !value.farms || typeof value.farms !== "object" || Array.isArray(value.farms))
      throw new Error("Invalid farming project state");
    return value;
  } catch (error) {
    throw new ErrorType("INVALID_SNAPSHOT", error);
  }
}

/** FarmSnapshot is the sole gameplay record, atomically committed in memory; the host checkpoints it asynchronously. */
export class PlanningFarmRepository implements FarmRepository {
  private readonly owner: ReturnType<RuntimeProjectSession["ownRuntimeAsset"]>;
  private readonly listeners = new Map<string, Map<FarmRepositoryListener, FarmSubscriber>>();
  private cached?: { content: string | Uint8Array | undefined; data: FarmingProjectData };
  /** Use the same settlement origin across checkpoints and farm reactivation in this project. */
  private readonly clocks = new Map<string, FarmSnapshot>();
  private readonly frozen = new WeakMap<FarmSnapshot, FarmSnapshot>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private replacing = false;
  get replacementPending(): boolean {
    return this.replacing;
  }
  constructor(
    private readonly project: Pick<RuntimeProjectSession, "projectPackage" | "ownRuntimeAsset">,
    private readonly ErrorType: typeof FarmingInitializationError = FarmingInitializationError,
    readonly path = PLANNING_FARMING_PROJECT_PATH,
    private readonly readResource?: () => JSONAsset | null | undefined,
    private readonly validateSave: (snapshot: FarmSnapshot, farmId: string) => void = validatePlanningFarmSave
  ) {
    this.owner = project.ownRuntimeAsset(
      {
        virtualPath: path,
        path: "runtime-world:farming",
        type: PLANNING_FARMING_PROJECT_TYPE
      },
      "owner",
      (content, current) => this.prepareReplacement(content, current ?? this.content())
    );
  }
  private prepareReplacement(content: string | Uint8Array, current: string | Uint8Array | undefined) {
    const data = parsePlanningFarmingState(content, this.ErrorType);
    const cached = this.cached?.content === current ? this.cached : undefined;
    const previous = cached?.data ?? parsePlanningFarmingState(current, this.ErrorType);
    planningFarmInitialization(data, "");
    const initializedIds = new Set([
      ...Object.keys(previous.initializations ?? {}),
      ...Object.keys(data.initializations ?? {})
    ]);
    for (const id of new Set([...initializedIds, ...this.listeners.keys()])) {
      if (!Object.hasOwn(data.farms, id)) throw new this.ErrorType("INVALID_SNAPSHOT", `Missing farm: ${id}`);
    }
    for (const id of initializedIds) {
      const before = planningFarmInitialization(previous, id).record;
      const after = planningFarmInitialization(data, id).record;
      if (before)
        (data.initializations ??= {})[id] = {
          initialized: true,
          requests: [...new Set([...before.requests, ...(after?.requests ?? [])])]
        };
    }
    const changed = new Map<
      string,
      {
        before?: FarmSnapshot;
        layout?: WaterLayoutChange;
        mergeSettlement?: (settled: FarmSnapshot) => FarmSnapshot;
        rebaseTime: boolean;
        validate: (snapshot: FarmSnapshot) => FarmSnapshot;
      }
    >();
    for (const [id, incoming] of Object.entries(data.farms)) {
      if (incoming?.farmId !== id || !Number.isSafeInteger(incoming.revision) || incoming.revision < 0)
        throw new this.ErrorType("INVALID_SNAPSHOT", `Invalid farm identity or revision: ${id}`);
      let snapshot = incoming;
      const participants = [...(this.listeners.get(id)?.values() ?? [])]
        .map((subscriber) => subscriber.replacement)
        .filter((replacement) => replacement !== undefined);
      const validate = (candidate: FarmSnapshot) => {
        if (participants.length) for (const participant of participants) candidate = participant.validate(candidate);
        else this.validateSave(candidate, id);
        return candidate;
      };
      snapshot = validate(snapshot);
      const before = previous.farms[id];
      if (before && stableRequest({ ...before, revision: 0 }) === stableRequest({ ...snapshot, revision: 0 })) {
        data.farms[id] = before;
        continue;
      }
      const authored = snapshot;
      const inheritSettlement = before && stableRequest(authored.simulation) === stableRequest(before.simulation);
      const clock = cached && this.clocks.get(id);
      let settled = clock && clock.revision === before?.revision ? clock : before;
      if (before) {
        // The live service and volatile clock can both belong to the previous package contents.
        if (cached)
          for (const participant of participants) {
            const live = participant.current();
            if (
              live?.revision === before.revision &&
              live.simulation.lastSystemTimeMs >= settled.simulation.lastSystemTimeMs
            ) settled = live;
          }
        if (settled !== before && inheritSettlement)
          snapshot = validate(mergeSettledState(before, snapshot, settled));
        const revision = Math.max(before.revision + 1, incoming.revision);
        if (!Number.isSafeInteger(revision))
          throw new this.ErrorType("INVALID_SNAPSHOT", `Farm revision exhausted: ${id}`);
        snapshot = { ...snapshot, revision };
      }
      data.farms[id] = snapshot;
      const layout = settled && diffWaterLayout(snapshot, settled);
      changed.set(id, {
        before: settled,
        layout,
        mergeSettlement:
          layout && inheritSettlement
            ? (advanced) => mergeSettledState(before, { ...authored, revision: snapshot.revision }, advanced)
            : undefined,
        validate,
        rebaseTime: snapshot.simulation.lastSystemTimeMs !== settled?.simulation.lastSystemTimeMs
      });
    }
    let serialized = JSON.stringify(data);
    this.replacing = changed.size > 0;
    return {
      content: serialized,
      finalizeContent: () => {
        let updated = false;
        for (const [id, { before, layout, mergeSettlement, rebaseTime, validate }] of changed) {
          if (!before || !layout) continue;
          const snapshot = data.farms[id];
          const active = [...(this.listeners.get(id)?.values() ?? [])].find((subscriber) => subscriber.replacement);
          const refreshed = active?.replacement
            ? active.replacement.refreshLayout(snapshot, layout, { previous: before, rebaseTime, mergeSettlement })
            : refreshWaterLayout(snapshot, layout, snapshot.simulation.lastSystemTimeMs);
          data.farms[id] = validate(refreshed);
          updated = true;
        }
        if (updated) serialized = JSON.stringify(data);
        return serialized;
      },
      accept: () => {
        if (this.disposed) return;
        this.cached = { content: serialized, data };
        for (const id of changed.keys()) this.clocks.delete(id);
        this.synchronizeResource();
        for (const [id, { rebaseTime }] of changed) {
          const snapshot = data.farms[id];
          for (const { replacement } of this.listeners.get(id)?.values() ?? [])
            replacement?.committed(snapshot, rebaseTime);
          this.notify(id, true, undefined, snapshot.revision);
        }
      },
      finish: () => { this.replacing = false; }
    };
  }
  private content() {
    const content = this.project.projectPackage.contents[this.path];
    if (content !== undefined) return content;
    const resource = this.readResource?.();
    return resource && !resource.destroyed ? JSON.stringify(resource.data) : undefined;
  }
  synchronizeResource(): void {
    const content = this.project.projectPackage.contents[this.path],
      resource = this.readResource?.();
    if (content !== undefined) {
      const data = this.parse(content);
      if (resource && !resource.destroyed && resource.data !== data) resource.data = data;
    }
  }
  private parse(content: string | Uint8Array | undefined): FarmingProjectData {
    if (this.cached && this.cached.content === content) return this.cached.data;
    const data = parsePlanningFarmingState(content, this.ErrorType);
    this.acceptExternal(content, data);
    return data;
  }
  private acceptExternal(content: string | Uint8Array | undefined, data: FarmingProjectData): void {
    const previous = this.cached;
    if (previous && previous.content === content) return;
    this.cached = { content, data };
    this.clocks.clear();
    if (previous) for (const id of this.listeners.keys()) this.notify(id, true);
  }
  async read(farmId: string): Promise<FarmSnapshot | undefined> {
    await this.queue;
    const saved = this.parse(this.content()).farms[farmId];
    if (saved !== undefined && (!saved || typeof saved !== "object" || saved.farmId !== farmId))
      throw new this.ErrorType("INVALID_SNAPSHOT", "Farm identity mismatch");
    return this.clocks.get(farmId) ?? (saved && this.freeze(saved));
  }
  private freeze(snapshot: FarmSnapshot): FarmSnapshot {
    try {
      const existing = this.frozen.get(snapshot);
      if (existing) return existing;
      const immutable = freezeSnapshot(snapshot);
      this.frozen.set(snapshot, immutable);
      return immutable;
    } catch (error) {
      throw new this.ErrorType("INVALID_SNAPSHOT", error);
    }
  }
  async initialization(farmId: string, requestId?: string) {
    await this.queue;
    const content = this.content();
    // Snapshot corruption is handled by the existing load policy. Initialization
    // metadata, when present, is never silently discarded to authorize a reset.
    let state: unknown;
    try { state = content === undefined ? undefined : JSON.parse(typeof content === "string" ? content : new TextDecoder("utf-8", {fatal:true}).decode(content)); }
    catch { state = undefined; }
    return planningFarmInitialization(state, farmId, requestId);
  }
  /** A request is consumed only by a successful initialization transaction. */
  forInitialization(selection: { requestId?: string; recover?: boolean } = {}): FarmRepository {
    let initialize = true;
    const origin = Symbol();
    const projectRepository = this;
    return {
      get replacementPending() { return projectRepository.replacementPending; },
      read: (farmId) => this.read(farmId),
      transact: async (farmId, createInitial, operation, signal) => {
        const result = await this.transact(farmId, createInitial, operation, signal, initialize ? selection : undefined, origin);
        initialize = false;
        return result;
      },
      subscribe: (farmId, listener, replacement) => this.subscribe(farmId, listener, replacement, origin),
      dispose() {} // The runtime owns the project asset.
    };
  }
  transact<T>(
    farmId: string,
    createInitial: () => FarmSnapshot,
    operation: (current: FarmSnapshot) => FarmRepositoryTransaction<T>,
    signal?: AbortSignal,
    initialization?: { requestId?: string; recover?: boolean },
    origin?: symbol
  ): Promise<T> {
    const task = this.queue.then(async () => {
      if (this.disposed) throw new Error("Farm project repository disposed");
      let changed = false;
      let written: typeof this.cached;
      const value = await this.owner.update((content) => {
        signal?.throwIfAborted();
        const currentContent = content ?? this.content();
        let data: FarmingProjectData;
        try {
          data = this.parse(currentContent);
        } catch (error) {
          if (!initialization || !(initialization.requestId || initialization.recover) || !(error instanceof this.ErrorType)) throw error;
          // Preserve sibling records whenever the envelope can still be decoded.
          let farms = {}, initializations: FarmingProjectData["initializations"];
          try {
            const decoded = JSON.parse(
              typeof currentContent === "string"
                ? currentContent
                : new TextDecoder("utf-8", { fatal: true }).decode(currentContent)
            );
            initializations = decoded?.initializations;
            if (decoded?.farms && typeof decoded.farms === "object" && !Array.isArray(decoded.farms))
              farms = decoded.farms;
          } catch {}
          data = { version: 1, farms, ...(initializations === undefined ? {} : { initializations }) };
        }
        const policy = planningFarmInitialization(data, farmId, initialization?.requestId);
        if (initialization?.recover && policy.resume) throw Error("Refusing to reset initialized farm progress");
        const replace = !!initialization && (policy.replace || !!initialization.recover);
        const before = data.farms[farmId];
        if (policy.resume && !before) throw Error("Farm resume state is missing; refusing to reset progress");
        const current = before && !replace ? this.clocks.get(farmId) ?? this.freeze(before) : createInitial();
        const result = operation(current);
        if (result.snapshot.farmId !== farmId) throw new Error("Farm transaction changed identity");
        if (before && !replace && (!initialization || policy.record)) {
          if (result.clockOnly === "volatile") {
            this.clocks.set(farmId, result.snapshot);
            return { value: result.value };
          }
          const baseline = result.clockOnly === "persist" ? this.freeze(before) : current;
          if (result.snapshot === baseline) return { value: result.value };
        }
        changed = replace || !before || (!result.clockOnly && result.snapshot !== current);
        const next: FarmingProjectData = { ...data, farms: { ...data.farms, [farmId]: result.snapshot } };
        if (initialization) {
          const requests = new Set(policy.record?.requests);
          if (initialization.requestId) requests.add(initialization.requestId);
          next.initializations = { ...data.initializations, [farmId]: { initialized: true, requests: [...requests] } };
        }
        written = { content: JSON.stringify(next), data: next };
        return { content: written.content, value: result.value };
      });
      if (written && this.project.projectPackage.contents[this.path] === written.content) {
        this.cached = written;
        this.clocks.delete(farmId);
        this.synchronizeResource();
        if (changed) this.notify(farmId, false, origin);
      }
      return value;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  private notify(farmId: string, external: boolean, origin?: symbol, replacementRevision?: number): void {
    for (const [listener, subscriber] of this.listeners.get(farmId) ?? []) {
      if (origin !== undefined && origin === subscriber.origin) continue;
      try {
        listener(external, replacementRevision);
      } catch (error) {
        console.warn("Farm project committed; notification failed", error);
      }
    }
  }
  subscribe(
    farmId: string,
    listener: FarmRepositoryListener,
    replacement?: FarmSnapshotReplacement,
    origin?: symbol
  ): () => void {
    const listeners = this.listeners.get(farmId) ?? new Map();
    listeners.set(listener, { origin, replacement });
    this.listeners.set(farmId, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(farmId);
    };
  }
  whenIdle(): Promise<void> {
    return this.queue.then(() => undefined);
  }
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.clocks.clear();
    this.cached = undefined;
    this.owner.dispose();
  }
}
