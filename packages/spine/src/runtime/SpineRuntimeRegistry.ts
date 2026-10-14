import type { ISpineRuntime } from "./ISpineRuntime";

const runtimes = new Map<string, ISpineRuntime>();

/** Register one backend per export major.minor. Registration never replaces an existing backend. */
export function registerSpineRuntime(runtime: ISpineRuntime): void {
  if (!/^\d+\.\d+$/.test(runtime.version)) {
    throw new Error(`Invalid Spine runtime version: ${runtime.version}`);
  }
  const existing = runtimes.get(runtime.version);
  if (existing && existing !== runtime) {
    throw new Error(`Spine ${runtime.version} runtime is already registered.`);
  }
  runtimes.set(runtime.version, runtime);
}

/** Resolve the backend from an asset's export version. No fallback to another runtime. */
export function getSpineRuntime(version: string | null | undefined): ISpineRuntime {
  const majorMinor = /^(\d+\.\d+)(?:\.|$)/.exec(version ?? "")?.[1];
  const runtime = runtimes.get(majorMinor);
  if (!runtime) {
    throw new Error(`No Spine runtime registered for asset version "${version}". Include the matching Spine backend.`);
  }
  return runtime;
}
