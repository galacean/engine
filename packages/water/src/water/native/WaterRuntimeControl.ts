import type {
  WaterDevelopmentObserver,
  WaterDevelopmentTarget,
  WaterDevelopmentTargetSource
} from "../runtime/body/WaterBodyLoader";
import { createWaterResourceMemoryMetrics } from "../runtime/resources/WaterResourceMetrics";
import type {
  WaterLookAuthoringSnapshot,
  WaterLookAuthoringComponents
} from "../authoring/surface/WaterLookAuthoringSnapshot";

export interface WaterRuntimeState {
  readonly requestedEnabled: boolean;
  readonly effectiveEnabled: boolean;
  readonly phase: "enabled" | "enabling" | "disabling" | "disabled" | "error";
  readonly error?: string;
  /** Passive cleanup diagnostics. Retained owners are distinct from active GPU resources. */
  readonly residualResources?: string;
}

/** DOM-free system control; a panel never owns Water activation. */
export interface WaterRuntimeControl {
  readonly runtimeState: Readonly<WaterRuntimeState>;
  setRuntimeEnabled(enabled: boolean): Promise<void>;
  observeRuntimeState(observer: (state: Readonly<WaterRuntimeState>) => void): () => void;
}

const EMPTY_METRICS = Object.freeze({
  activeBodyCount: 0,
  cachedResourceCount: 0,
  compileCount: 0,
  cacheHitCount: 0,
  cacheMissCount: 0,
  failedActivationCount: 0,
  cacheEvictionCount: 0,
  compileCacheEntryLimit: 0,
  compileCacheBudgetBytes: 0,
  cachedResourceMemory: createWaterResourceMemoryMetrics()
});

/** Stable discovery identity across complete Host destruction. Holds no retired handles. */
export class WaterDevelopmentRelay implements WaterDevelopmentTargetSource, WaterDevelopmentObserver {
  private source?: WaterDevelopmentTargetSource;
  private unsubscribe?: () => void;
  private readonly targets = new Set<WaterDevelopmentTarget>();
  private readonly observers = new Set<WaterDevelopmentObserver>();
  get metrics() {
    return this.source?.metrics ?? EMPTY_METRICS;
  }
  bind(source?: WaterDevelopmentTargetSource): void {
    if (source === this.source) return;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const target of [...this.targets]) this.detach(target);
    this.source = source;
    this.unsubscribe = source?.observeDevelopmentTargets(this);
  }
  observeDevelopmentTargets(observer: WaterDevelopmentObserver): () => void {
    this.observers.add(observer);
    for (const target of this.targets) this.deliver(observer, () => observer.attach(target), target);
    return () => {
      this.observers.delete(observer);
    };
  }
  attach(target: WaterDevelopmentTarget): void {
    this.targets.add(target);
    for (const observer of this.observers) this.deliver(observer, () => observer.attach(target), target);
  }
  replace(previous: WaterDevelopmentTarget, next: WaterDevelopmentTarget): void {
    this.targets.delete(previous);
    this.targets.add(next);
    for (const observer of this.observers) this.deliver(observer, () => observer.replace(previous, next), next);
  }
  detach(target: WaterDevelopmentTarget): void {
    this.targets.delete(target);
    for (const observer of this.observers) this.deliver(observer, () => observer.detach(target), target);
  }
  reportError(target: WaterDevelopmentTarget, error: unknown): void {
    for (const observer of this.observers) observer.reportError?.(target, error);
  }
  destroy(): void {
    this.bind();
    for (const observer of [...this.observers]) observer.destroy?.();
    this.observers.clear();
  }
  private deliver(observer: WaterDevelopmentObserver, action: () => void, target: WaterDevelopmentTarget): void {
    try {
      action();
    } catch (error) {
      console.error("[water] Development observer failed", error);
      try {
        observer.reportError?.(target, error);
      } catch {
        /* Diagnostics cannot change runtime publication. */
      }
    }
  }
}

interface WaterRuntimeValues {
  readonly look?: Readonly<WaterLookAuthoringSnapshot>;
  readonly body: Readonly<{ visible: boolean; query: boolean; buoyancy: boolean; wake: boolean }>;
  readonly commands: Readonly<Record<string, unknown>>;
}
interface WaterRuntimeDraft {
  readonly backendId: string;
  readonly changes: readonly LookChange[];
  readonly body: Partial<WaterRuntimeValues["body"]>;
  readonly commands: readonly (readonly [string, readonly LookChange[]])[];
}
const BACKEND_PARAMETERS = [
  ["tuning", "setTuning"],
  ["debugMode", "setDebugMode"],
  ["debugView", "setDebugView"],
  ["surfaceDebugMode", "setSurfaceDebugMode"],
  ["lodDebugEnabled", "setLodDebug"],
  ["surfaceTimeOverride", "setSurfaceTimeOverride"]
] as const;

function runtimeValues(target: WaterDevelopmentTarget, visible = target.handle.visible): WaterRuntimeValues {
  const adapter = target.development?.adapter as Record<string, unknown> | undefined;
  return {
    look: target.lookAuthoring?.read(),
    body: {
      visible,
      query: target.handle.queryEnabled,
      buoyancy: target.handle.buoyancyEnabled,
      wake: target.handle.wakeEnabled
    },
    commands: Object.fromEntries(
      BACKEND_PARAMETERS.flatMap(([property, command]) =>
        adapter && typeof adapter[command] === "function" ? [[command, structuredClone(adapter[property])]] : []
      )
    )
  };
}

interface LookChange {
  readonly path: readonly string[];
  readonly value: unknown;
  readonly removed?: boolean;
}
const LOOK_COMPONENTS = ["look", "appearance", "optics", "reflectionPolicy", "renderState"] as const;
const LOOK_IDENTITIES = new Set([
  "id",
  "appearanceAssetId",
  "opticalProfileId",
  "reflectionPolicyId",
  "renderStatePresetId"
]);

/** Arrays are ordered values, not dictionaries of independently replayable indices. */
function equalDraftValue(before: unknown, after: unknown): boolean {
  if (Object.is(before, after)) return true;
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return false;
  if (Array.isArray(before) !== Array.isArray(after)) return false;
  if (Array.isArray(before) && Array.isArray(after) && before.length !== after.length) return false;
  const previous = before as Record<string, unknown>,
    next = after as Record<string, unknown>;
  const keys = Object.keys(previous);
  return (
    keys.length === Object.keys(next).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(next, key) && equalDraftValue(previous[key], next[key]))
  );
}

function lookChanges(before: unknown, after: unknown, path: readonly string[] = []): LookChange[] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) || Array.isArray(after)) {
    return equalDraftValue(before, after) ? [] : [{ path, value: after }];
  }
  if (before && after && typeof before === "object" && typeof after === "object") {
    const previous = before as Record<string, unknown>,
      next = after as Record<string, unknown>;
    return [...new Set([...Object.keys(previous), ...Object.keys(next)])].flatMap((key) =>
      LOOK_IDENTITIES.has(key)
        ? []
        : !Object.prototype.hasOwnProperty.call(next, key)
          ? [{ path: [...path, key], value: undefined, removed: true }]
          : lookChanges(previous[key], next[key], [...path, key])
    );
  }
  return [{ path, value: after }];
}

function applyLookChange(value: unknown, path: readonly string[], replacement: unknown, removed = false): unknown {
  if (!path.length) return replacement;
  if (!value || typeof value !== "object") return value;
  const [key, ...rest] = path;
  const result = { ...value } as Record<string, unknown>;
  if (!rest.length && removed) delete result[key];
  else result[key] = applyLookChange(result[key], rest, replacement, removed);
  return result;
}

/** CPU parameter values only. No compiled resources, controllers or scene objects survive unloading. */
export class WaterRuntimeDrafts {
  private readonly drafts = new Map<string, WaterRuntimeDraft>();
  private readonly baselines = new Map<string, { backendId: string; values: WaterRuntimeValues }>();

  /** Called only after an authored publication, before exposing it to session editors. */
  acceptBaseline(
    source?: WaterDevelopmentTargetSource,
    bodyIds?: ReadonlySet<string>,
    readVisibility: (target: WaterDevelopmentTarget) => boolean = (target) => target.handle.visible
  ): void {
    source?.observeDevelopmentTargets({
      attach: (target) => {
        if (!bodyIds || bodyIds.has(target.bodyId))
          this.baselines.set(target.bodyId, {
            backendId: target.backendId,
            values: runtimeValues(target, readVisibility(target))
          });
      },
      replace() {},
      detach() {}
    })();
  }

  capture(
    source?: WaterDevelopmentTargetSource,
    baseline?: (bodyId: string) => Readonly<WaterLookAuthoringComponents> | undefined,
    readVisibility: (target: WaterDevelopmentTarget) => boolean = (target) => target.handle.visible
  ): void {
    if (!source) return;
    const capture = (target: WaterDevelopmentTarget) => {
      const saved = this.baselines.get(target.bodyId);
      const current = runtimeValues(target, readVisibility(target));
      const initial = saved?.backendId === target.backendId ? saved.values : current;
      const initialLook = baseline?.(target.bodyId) ?? initial.look;
      this.drafts.set(target.bodyId, {
        backendId: target.backendId,
        changes:
          current.look && initialLook
            ? LOOK_COMPONENTS.flatMap((key) => lookChanges(initialLook[key], current.look![key], [key]))
            : [],
        body: Object.fromEntries(
          Object.entries(current.body).filter(
            ([key, value]) => value !== initial.body[key as keyof WaterRuntimeValues["body"]]
          )
        ),
        commands: Object.entries(current.commands).flatMap(([command, value]) => {
          const changes = lookChanges(initial.commands[command], value);
          return changes.length ? [[command, changes] as const] : [];
        })
      });
    };
    source.observeDevelopmentTargets({ attach: capture, replace: (_previous, next) => capture(next), detach() {} })();
  }
  async restore(source: WaterDevelopmentTargetSource, signal: AbortSignal): Promise<void> {
    const targets = new Map<string, WaterDevelopmentTarget>();
    const unsubscribe = source.observeDevelopmentTargets({
      attach: (target) => targets.set(target.bodyId, target),
      replace: (_previous, target) => targets.set(target.bodyId, target),
      detach: (target) => {
        if (targets.get(target.bodyId) === target) targets.delete(target.bodyId);
      }
    });
    try {
      for (const [id, draft] of this.drafts) {
        signal.throwIfAborted();
        let target = targets.get(id);
        if (!target || target.backendId !== draft.backendId) continue;
        if (target.lookAuthoring && draft.changes.length)
          await target.lookAuthoring.update(
            (current) =>
              draft.changes.reduce<WaterLookAuthoringComponents>(
                (look, change) =>
                  applyLookChange(look, change.path, change.value, change.removed) as WaterLookAuthoringComponents,
                current
              ),
            signal
          );
        signal.throwIfAborted();
        target = targets.get(id)!;
        const adapter = target.development?.adapter as Record<string, unknown> | undefined;
        for (const [command, changes] of draft.commands) {
          const property = BACKEND_PARAMETERS.find(([, setter]) => setter === command)![0];
          const value = changes.reduce(
            (value, change) => applyLookChange(value, change.path, change.value, change.removed),
            adapter?.[property]
          );
          (adapter?.[command] as ((value: unknown) => void) | undefined)?.(value);
        }
        if (Object.keys(draft.body).length) {
          const body = { ...runtimeValues(target).body, ...draft.body };
          // Explicit dependent edits also request their prerequisite; disabling query withdraws both dependents.
          if (draft.body.query === false) body.buoyancy = body.wake = false;
          else if (draft.body.buoyancy || draft.body.wake) body.query = true;
          target.handle.setWakeEnabled(false);
          target.handle.setBuoyancyEnabled(false);
          target.handle.setQueryEnabled(body.query);
          if (body.buoyancy) target.handle.setBuoyancyEnabled(true);
          if (body.wake) target.handle.setWakeEnabled(true);
          target.handle.setVisible(body.visible);
        }
      }
    } finally {
      unsubscribe();
    }
  }
  clear(): void {
    this.drafts.clear();
    this.baselines.clear();
  }
}
