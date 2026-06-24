import type { ISpineRuntime } from "./ISpineRuntime";

let _runtime: ISpineRuntime | null = null;

/**
 * Register the spine runtime backend. Called for its side effect when a spine core package
 * (e.g. `@galacean/engine-spine-core-4.2`) is imported. The last registration wins.
 */
export function registerSpineRuntime(runtime: ISpineRuntime): void {
  _runtime = runtime;
}

/**
 * Get the registered spine runtime backend.
 * @throws If no core package has been imported.
 */
export function getSpineRuntime(): ISpineRuntime {
  if (!_runtime) {
    throw new Error(
      "@galacean/engine-spine: no spine runtime registered. Import a spine core package, " +
        'e.g. `import "@galacean/engine-spine-core-4.2"`.'
    );
  }
  return _runtime;
}
