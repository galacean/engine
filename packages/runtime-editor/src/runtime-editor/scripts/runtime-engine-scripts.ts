import { projectComponentScripts } from "./runtime-project-scripts";
import { runtimeScriptExternals } from "./runtime-script-host";
import { UnavailableProjectScript } from "./runtime-unavailable-script";
import * as Engine from "@galacean/engine";
import type { RuntimeProjectSession } from "../../project/runtime-project-session.ts";

const unavailableClasses = new WeakMap<RuntimeProjectSession, Map<string, typeof UnavailableProjectScript>>();

/** Publish healthy classes and explicitly unavailable carriers independently. */
export async function installRuntimeProjectScripts(
  project: RuntimeProjectSession,
  signal?: AbortSignal
): Promise<string[]> {
  const entries = projectComponentScripts(project.projectPackage);
  const failures = new Map<string, string>();
  const failed = (path: string, error: unknown) => failures.set(path, `Script ${path} unavailable: ${String(error)}`);
  let classes = new Map<string, unknown>();
  try {
    classes = await project.scriptClasses(runtimeScriptExternals, signal, failed);
  } catch (error) {
    signal?.throwIfAborted();
    // A failed project build supplies no executable graph. Keep editing available.
    for (const path of entries) failed(path, error);
  }
  signal?.throwIfAborted();
  const carriers = unavailableClasses.get(project) ?? new Map<string, typeof UnavailableProjectScript>();
  unavailableClasses.set(project, carriers);
  for (const path of entries) {
    const value = classes.get(path);
    if (!failures.has(path) && (typeof value !== "function" || !(value.prototype instanceof Engine.Script))) {
      failed(path, "must default-export a Script subclass");
    }
    if (failures.has(path)) {
      if (!carriers.has(path)) carriers.set(path, class extends UnavailableProjectScript {});
      Engine.Loader.registerClass(path, carriers.get(path)!);
    } else {
      Engine.Loader.registerClass(path, value as typeof Engine.Script);
      carriers.delete(path);
    }
  }
  for (const path of carriers.keys()) if (!entries.includes(path)) carriers.delete(path);
  project.setUnavailableScripts(failures);
  return [...failures.values()];
}
