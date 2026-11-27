import type {
  SeedWorldEngineChange, SeedWorldEngineEdit, SeedWorldEnginePort,
  SeedWorldEnvironmentUpdateInput, SeedWorldLiveState, SeedWorldRef,
  SeedWorldEditorSettings
} from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { applyEnvironmentChange, captureEnvironmentChange, environmentChangeInput,
  type SeedWorldEnvironmentChange } from "@galacean/engine-world-planning/agent-adapter/SeedWorldEnvironmentChange";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";

export interface SeedWorldDraftProjection {
  environment(state: SeedWorldLiveState, input: SeedWorldEnvironmentUpdateInput): {
    state: SeedWorldLiveState;
    forward: SeedWorldEnvironmentUpdateInput;
    previous: Partial<SeedWorldEnvironmentUpdateInput>;
  };
  teleport(input: { x: number; z: number; heightOffset: number }): { cameraPosition: readonly [number, number, number]; navigation?: SeedWorldLiveState["camera"]["navigation"]; [key: string]: unknown };
  restoreCamera(camera: SeedWorldLiveState["camera"]): void;
  validateMount(): void;
}

/** Editor requests are data until their owner commits; animation/gameplay follows publication. */
export function createSeedWorldEngineDraft(
  base: SeedWorldEnginePort,
  projection: SeedWorldDraftProjection,
  executionId: string,
  initialSettings: SeedWorldEditorSettings = {}
): SeedWorldEngineEdit {
  const initial = base.readWorldState();
  if (!initial) throw new Error("Seed World is not ready for editing");
  let state = structuredClone(initial);
  let settings = structuredClone(initialSettings);
  if (settings.environment) state = projection.environment(state, { ...settings.environment, timeHours: undefined, fromTimeHours: undefined, waitForIbl: false }).state;
  let phase: "open" | "sealed" | "discarded" = "open";
  const changes: SeedWorldEngineChange[] = [];
  let navigationGround: ((x: number, z: number) => number) | undefined;
  const acceptEnvironmentChange = (change: SeedWorldEnvironmentChange, projected: SeedWorldLiveState) => {
    const environment = applyEnvironmentChange(settings.environment, change);
    if (environment === undefined) delete settings.environment;
    else settings.environment = environment;
    state = projected;
    changes.push(change);
  };
  const check = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (phase !== "open") throw new Error("Seed World edit is closed");
  };
  const unsupported = () => {
    check();
    throw new Error("NOT_SUPPORTED: Legacy resource CRUD is not mapped to this host's editing document; no changes were made.");
  };
  const overrides: Partial<SeedWorldEnginePort> = {
    readWorldState: () => { check(); return structuredClone(state); },
    readWaterColor: ref => { check(); return base.readWaterColor?.(ref); },
    updateEnvironment: (input, signal) => {
      check(signal);
      const next = projection.environment(state, input);
      acceptEnvironmentChange(captureEnvironmentChange(settings.environment, next.forward), next.state);
      return { requested: toAgentValue({ ...input, appliedTo: "draft" }), state: structuredClone(state) };
    },
    teleport: input => {
      check();
      const projected = { ...projection.teleport(input) };
      if (navigationGround) {
        const ground = navigationGround(input.x, input.z);
        const previous = projected.navigationSurfaceHeight;
        if (!Number.isFinite(ground) || typeof previous !== "number") throw new Error("Draft navigation surface is unavailable");
        const delta = ground - previous;
        projected.cameraPosition = [projected.cameraPosition[0], projected.cameraPosition[1] + delta, projected.cameraPosition[2]];
        projected.navigationSurfaceHeight = ground;
        if (Array.isArray(projected.orbitTarget)) projected.orbitTarget = [projected.orbitTarget[0], projected.orbitTarget[1] + delta, projected.orbitTarget[2]];
      }
      changes.push({ kind: "command", forward: { kind: "teleport", input: { ...input } } });
      state = { ...state, camera: { ...state.camera, position: [...projected.cameraPosition],
        ...(projected.navigation ? { navigation: projected.navigation } : {}) } };
      settings.camera = structuredClone(state.camera);
      return { ...projected, appliedTo: "draft" };
    },
    commandMount: (input, signal) => {
      check(signal); projection.validateMount();
      changes.push({ kind: "command", forward: { kind: "mount", input: { ...input } } });
      settings.mount = { ...input };
      // The receipt identifies the queued intent, not completed gameplay.
      return { status: "accepted", intent: input.intent, commandId: `${executionId}:mount:${changes.length}` };
    },
    mutateWorldResource: unsupported,
    mutateWorldResources: unsupported,
  };
  const port = new Proxy(base, {
    get(target, property) {
      const override = Reflect.get(overrides, property);
      if (override !== undefined) return override;
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => { check(); return value.apply(target, args); };
    }
  });
  return {
    port, changes,
    setNavigationGround(sample) { check(); navigationGround = sample; },
    get settings() { return structuredClone(settings); },
    restoreSettings: async (saved, signal, force = false) => {
      check(signal);
      if (saved.environment) {
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(saved.environment)) {
          if (["transitionDuration", "waitForIbl", "fromTimeHours"].includes(key)) continue;
          const previous = (settings.environment as unknown as Record<string, unknown> | undefined)?.[key];
          if (key === "weatherChannels" || key === "atmosphere") {
            const changed = Object.fromEntries(Object.entries(value as object).filter(([field, next]) =>
              force || JSON.stringify(next) !== JSON.stringify((previous as Record<string, unknown> | undefined)?.[field])));
            if (Object.keys(changed).length) patch[key] = changed;
          } else if (force || JSON.stringify(value) !== JSON.stringify(previous)) patch[key] = value;
        }
        if (patch.season !== undefined) patch.weatherChannels = saved.environment.weatherChannels;
        if (Object.keys(patch).length) await port.updateEnvironment({ ...patch, transitionDuration: 0, waitForIbl: false }, signal);
      }
      if (saved.camera && (force || JSON.stringify(saved.camera) !== JSON.stringify(settings.camera))) {
        changes.push({ kind: "command", forward: { kind: "camera", camera: structuredClone(saved.camera) } });
        state = { ...state, camera: structuredClone(saved.camera) };
      }
      if (saved.mount && (force || JSON.stringify(saved.mount) !== JSON.stringify(settings.mount))) await port.commandMount!(saved.mount, signal);
      check(signal);
      settings = structuredClone(saved);
    },
    prepare: signal => { check(signal); if (!base.readWorldState()) throw new Error("Seed World is no longer available"); },
    seal: () => { check(); phase = "sealed"; },
    discard: () => { phase = "discarded"; },
    activate: async signal => {
      if (phase !== "sealed") throw new Error("Cannot activate an uncommitted editor request");
      const errors: Error[] = [];
      for (const change of changes) {
        signal.throwIfAborted();
        try {
          if (change.kind === "environment") {
            await base.updateEnvironment(environmentChangeInput(change), signal);
            continue;
          }
          const command = change.forward;
          if (command.kind === "teleport") base.teleport(command.input);
          else if (command.kind === "camera") projection.restoreCamera(command.camera);
          else await base.commandMount!(command.input, signal);
        } catch (error) { errors.push(error instanceof Error ? error : new Error(String(error))); }
      }
      if (errors.length) throw new AggregateError(errors, `Committed editor requests encountered runtime errors: ${errors.map(error => error.message).join("; ")}`);
    }
  };
}
