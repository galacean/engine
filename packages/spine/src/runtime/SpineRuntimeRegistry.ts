import type { Engine } from "@galacean/engine";
import type { ISpineRuntime } from "./ISpineRuntime";

const runtimes = new WeakMap<Engine, Map<string, ISpineRuntime>>();

/**
 * Register a backend for an engine before loading assets of its export major.minor version.
 * Registrations are isolated per engine. Registering the same instance again is allowed;
 * another instance for an already registered version is rejected. Existing resources keep their backend.
 * @param engine - The engine that will load assets using this backend.
 * @param runtime - The backend instance to reuse for assets of its version.
 */
export function registerSpineRuntime(engine: Engine, runtime: ISpineRuntime): void {
  if (!/^\d+\.\d+$/.test(runtime.version)) {
    throw new Error(`Invalid Spine runtime version: ${runtime.version}`);
  }
  let engineRuntimes = runtimes.get(engine);
  const existing = engineRuntimes?.get(runtime.version);
  if (existing && existing !== runtime) {
    throw new Error(`Spine ${runtime.version} runtime is already registered.`);
  }
  if (!engineRuntimes) {
    engineRuntimes = new Map();
    runtimes.set(engine, engineRuntimes);
  }
  engineRuntimes.set(runtime.version, runtime);
}

/** Resolve the backend from an asset's export version. No fallback to another runtime. */
export function getSpineRuntime(engine: Engine, version: string | null | undefined): ISpineRuntime {
  const majorMinor = /^(\d+\.\d+)(?:\.|$)/.exec(version ?? "")?.[1];
  const runtime = runtimes.get(engine)?.get(majorMinor);
  if (!runtime) {
    throw new Error(
      `No Spine runtime registered for asset version "${version}" on this engine. ` +
        "Pass spine when creating the engine, or call registerSpineRuntime(engine, runtime) before loading assets."
    );
  }
  return runtime;
}
