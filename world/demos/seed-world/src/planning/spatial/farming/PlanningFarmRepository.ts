import { planningFarmInitialization, PLANNING_FARMING_PROJECT_PATH, type PlanningFarmInitialization } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmInitialization";
import type { JSONAsset } from "@galacean/engine-core";
import type { FarmRepository, FarmSnapshot } from "@galacean/engine-farming/farming/api/index";
import type { FarmRepositoryTransaction } from "@galacean/engine-farming/farming/persistence/FarmRepository";
import { freezeSnapshot } from "@galacean/engine-farming/farming/domain/FarmState";
import { FarmingInitializationError } from "@galacean/engine-farming/farming/application/FarmingInitializationError";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";

export { PLANNING_FARMING_PROJECT_PATH } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmInitialization";
export const PLANNING_FARMING_PROJECT_TYPE = "SeedWorldFarming";
interface FarmingProjectData {
  version: 1;
  farms: Record<string, FarmSnapshot>;
  initializations?: Record<string, PlanningFarmInitialization>;
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
  private readonly listeners = new Map<string, Set<() => void>>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  constructor(
    private readonly project: Pick<RuntimeProjectSession, "projectPackage" | "ownRuntimeAsset">,
    private readonly ErrorType: typeof FarmingInitializationError = FarmingInitializationError,
    readonly path = PLANNING_FARMING_PROJECT_PATH,
    private readonly readResource?: () => JSONAsset | null | undefined
  ) {
    this.owner = project.ownRuntimeAsset(
      {
        virtualPath: path,
        path: "runtime-world:farming",
        type: PLANNING_FARMING_PROJECT_TYPE
      },
      "owner"
    );
  }
  private content() {
    const resource = this.readResource?.();
    return (
      this.project.projectPackage.contents[this.path] ??
      (resource && !resource.destroyed ? JSON.stringify(resource.data) : undefined)
    );
  }
  synchronizeResource(): void {
    const content = this.project.projectPackage.contents[this.path],
      resource = this.readResource?.();
    if (content !== undefined && resource && !resource.destroyed)
      resource.data = parsePlanningFarmingState(content, this.ErrorType);
  }
  async read(farmId: string): Promise<FarmSnapshot | undefined> {
    await this.queue;
    const saved = parsePlanningFarmingState(this.content(), this.ErrorType).farms[farmId];
    if (saved !== undefined && (!saved || typeof saved !== "object" || saved.farmId !== farmId))
      throw new this.ErrorType("INVALID_SNAPSHOT", "Farm identity mismatch");
    return saved;
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
    return {
      read: (farmId) => this.read(farmId),
      transact: async (farmId, createInitial, operation, signal) => {
        const result = await this.transact(farmId, createInitial, operation, signal, initialize ? selection : undefined);
        initialize = false;
        return result;
      },
      subscribe: (farmId, listener) => this.subscribe(farmId, listener),
      dispose() {} // The runtime owns the project asset.
    };
  }
  transact<T>(
    farmId: string,
    createInitial: () => FarmSnapshot,
    operation: (current: FarmSnapshot) => FarmRepositoryTransaction<T>,
    signal?: AbortSignal,
    initialization?: { requestId?: string; recover?: boolean }
  ): Promise<T> {
    const task = this.queue.then(async () => {
      if (this.disposed) throw new Error("Farm project repository disposed");
      let changed = false;
      const value = await this.owner.update((content) => {
        signal?.throwIfAborted();
        const currentContent = content ?? this.content();
        let data: FarmingProjectData;
        try {
          data = parsePlanningFarmingState(currentContent, this.ErrorType);
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
        let current: FarmSnapshot;
        if (before && !replace) {
          try {
            current = freezeSnapshot(before);
          } catch (error) {
            throw new this.ErrorType("INVALID_SNAPSHOT", error);
          }
        } else current = createInitial();
        const result = operation(current);
        if (result.snapshot.farmId !== farmId) throw new Error("Farm transaction changed identity");
        changed = replace || !before || result.snapshot !== current;
        return {
          content: JSON.stringify({ ...data, farms: { ...data.farms, [farmId]: result.snapshot },
            ...(initialization ? { initializations: { ...data.initializations, [farmId]: {
              initialized: true,
              requests: [...new Set([...(policy.record?.requests ?? []), ...(initialization.requestId ? [initialization.requestId] : [])])]
            } } } : {})
          }),
          value: result.value
        };
      });
      this.synchronizeResource();
      if (changed)
        for (const listener of this.listeners.get(farmId) ?? []) {
          try {
            listener();
          } catch (error) {
            console.warn("Farm project committed; notification failed", error);
          }
        }
      return value;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  subscribe(farmId: string, listener: () => void): () => void {
    const listeners = this.listeners.get(farmId) ?? new Set();
    listeners.add(listener);
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
    this.owner.dispose();
  }
}
