import { visitSourceComponents } from "./runtime-source-components";
import {
  compileSourcePrefabToRuntime,
  compileSourceSceneToRuntime,
  getBuiltinComponentRuntimeCapabilitySnapshot
} from "../generated/editor-source-compiler";
import type { RuntimeProjectPackage } from "../project/runtime-project";

/** Compile editable hierarchy files only at the engine resource boundary. */
export function compileProjectResource(
  pack: RuntimeProjectPackage,
  virtualPath: string,
  unavailableScript?: (path: string) => boolean
): string | Uint8Array | undefined {
  const content = pack.contents[virtualPath];
  const file = pack.project.files.find((entry) => entry.virtualPath === virtualPath);
  if (typeof content === "string" && file?.type === "AnimatorController") {
    const controller = JSON.parse(content);
    for (const layer of controller.layers ?? [])
      for (const state of layer.stateMachine?.states ?? []) {
        if (!state.clip?.url) continue;
        const dependency = pack.project.files.find((asset) => asset.virtualPath === state.clip.url);
        if (!dependency) throw new Error(`Cannot resolve animation asset '${state.clip.url}'`);
        state.clip.url = dependency.virtualPath;
      }
    return JSON.stringify(controller);
  }
  if (typeof content !== "string" || !file || !/^(Scene|Prefab)$/i.test(file.type)) return content;
  const source = JSON.parse(content);
  // Published engine hierarchies have no source asset header.
  if (!source?.asset) return content;
  const resolve = (path: string) => {
    const matches = pack.project.files.filter((entry) => entry.virtualPath === path);
    if (matches.length !== 1) throw new Error(`Cannot resolve project asset '${path}' unambiguously`);
    return matches[0];
  };
  const registeredScripts = (hierarchy: typeof source) => {
    // Keep Script identity until selectors have been lowered. The compiler uses
    // it to distinguish registered script classes from native component inheritance.
    visitSourceComponents(hierarchy, (component) => {
      if (component.type !== "Script") return;
      const reference = component.script?.$ref ?? component.refId;
      if (!reference) throw new Error("Script component has no asset reference");
      const script = resolve(reference);
      if (script.type.toLowerCase() !== "script") throw new Error(`Invalid Script asset '${script.virtualPath}'`);
      component.script = { $ref: script.virtualPath };
      // Nested Editor override records serialize Script identity through refId.
      if (component.refId !== undefined) component.refId = script.virtualPath;
    });
    return hierarchy;
  };
  const nativeCapabilities = getBuiltinComponentRuntimeCapabilitySnapshot();
  const options = {
    // Override selectors already contain the registered Script path. Its props
    // still use ordinary assignment, including names such as `material` that
    // native Renderers lower to methods.
    componentRuntimeCapabilitySnapshot: {
      ...nativeCapabilities,
      capabilities: {
        ...nativeCapabilities.capabilities,
        ...Object.fromEntries(
          pack.project.files
            .filter((file) => file.type.toLowerCase() === "script")
            .map((file) => [file.virtualPath, { propertySetters: {} }])
        )
      }
    },
    resolveAssetContentRevision: (path: string): string | undefined => {
      const revision = resolve(path).params?.sourceContentRevision;
      return typeof revision === "string" ? revision : undefined;
    },
    resolveInstanceAssetKind: (path: string): "Prefab" | "glTF" | undefined => {
      const type = resolve(path).type.toLowerCase();
      return type === "prefab" ? "Prefab" : type === "gltf" ? "glTF" : undefined;
    },
    resolveInstanceSourceFile: (path: string) => {
      const dependency = resolve(path);
      if (dependency.type.toLowerCase() !== "prefab") return undefined;
      const text = pack.contents[dependency.virtualPath];
      if (typeof text !== "string")
        throw new Error(`Load Prefab source '${dependency.virtualPath}' before compilation`);
      const parsed = JSON.parse(text);
      if (!parsed?.asset) throw new Error(`Prefab '${dependency.virtualPath}' has no editable source topology`);
      return registeredScripts(parsed);
    }
  };
  const compile = file.type.toLowerCase() === "scene" ? compileSourceSceneToRuntime : compileSourcePrefabToRuntime;
  const runtime = compile(registeredScripts(source), (path) => resolve(path).virtualPath, options);
  const lowered = lowerRegisteredScripts(runtime, (path) => resolve(path).type.toLowerCase() === "script");
  return JSON.stringify(unavailableScript ? suppressUnavailableScriptPayloads(lowered, unavailableScript) : lowered);
}

/** Flattened runtime schemas are the shared boundary for resources and live Prefab replacement.
 * Keep the author/compiled diff baseline intact so repair can replay the original payload. */
export function suppressUnavailableScriptPayloads(
  runtime: Record<string, any>,
  unavailable: (path: string) => boolean
): Record<string, any> {
  let changed = false;
  const suppress = (value: Record<string, any>) => {
    changed = true;
    return { ...value, props: { enabled: false }, calls: [] };
  };
  const projected = {
    ...runtime,
    components: runtime.components.map((component: Record<string, any>) =>
      unavailable(component.type) ? suppress(component) : component
    ),
    entities: runtime.entities.map((entity: Record<string, any>) => {
      const overrides = entity.instance?.overrides;
      if (!overrides?.componentProps) return entity;
      return {
        ...entity,
        instance: {
          ...entity.instance,
          overrides: {
            ...overrides,
            componentProps: overrides.componentProps.map((override: Record<string, any>) =>
              unavailable(override.selector.type) ? suppress(override) : override
            )
          }
        }
      };
    })
  };
  if (!changed) return runtime;
  // SceneLoader eagerly loads every ref. Payloads that no longer execute must
  // not keep their private assets in that load barrier; shared refs stay live.
  const used = new Set<number>();
  mapHierarchyAssetIndices(projected, (index) => {
    used.add(index);
    return index;
  });
  const indices = new Map<number, number>();
  const refs = runtime.refs.filter((_reference: unknown, index: number) => {
    if (!used.has(index)) return false;
    indices.set(index, indices.size);
    return true;
  });
  return { ...mapHierarchyAssetIndices(projected, (index) => indices.get(index)!), refs };
}

/** Materialize only Prefab topology referenced by editable hierarchy sources. */
export async function prepareProjectSources(
  pack: RuntimeProjectPackage,
  load: (virtualPath: string) => Promise<void>
): Promise<void> {
  const visited = new Set<string>();
  async function visit(path: string): Promise<void> {
    if (visited.has(path)) return;
    visited.add(path);
    const content = pack.contents[path];
    if (typeof content !== "string") return;
    const source = JSON.parse(content);
    if (!source?.asset) return;
    const pending: unknown[] = [source];
    while (pending.length) {
      const value = pending.pop();
      if (!value || typeof value !== "object") continue;
      const ref = (value as { $ref?: unknown }).$ref;
      if (typeof ref === "string") {
        const matches = pack.project.files.filter((file) => file.virtualPath === ref);
        if (matches.length !== 1) throw new Error(`Cannot resolve project asset '${ref}' unambiguously`);
        const dependency = matches[0];
        if (dependency.type.toLowerCase() === "prefab" && !visited.has(dependency.virtualPath)) {
          await load(dependency.virtualPath);
          await visit(dependency.virtualPath);
        }
      }
      pending.push(...Object.values(value));
    }
  }
  for (const file of pack.project.files) {
    if (/^(Scene|Prefab)$/i.test(file.type)) await visit(file.virtualPath);
  }
}

/** SceneLoader eagerly loads refs. Script modules are registered by the project
 * script runtime, so remove only their resource slots after native selector lowering. */
function lowerRegisteredScripts(
  runtime: Record<string, any>,
  isScript: (path: string) => boolean
): Record<string, any> {
  const references: Array<{ url: string }> = runtime.refs;
  const indices = new Map<number, number>();
  const refs = references.filter((reference, index) => {
    if (isScript(reference.url)) return false;
    indices.set(index, indices.size);
    return true;
  });
  const assetIndex = (index: number): number => {
    const target = indices.get(index);
    if (target === undefined) throw new Error("Script modules cannot be loaded as asset values");
    return target;
  };
  for (const component of runtime.components) {
    if (component.type !== "Script") continue;
    const reference = references[component.script];
    if (!reference || !isScript(reference.url)) throw new Error("Script component has no registered module");
    component.type = reference.url;
    delete component.script;
  }
  return { ...mapHierarchyAssetIndices(runtime, assetIndex), refs };
}

/** Runtime hierarchy assets use both tagged property refs and fixed numeric schema slots. */
function mapHierarchyAssetIndices(runtime: Record<string, any>, map: (index: number) => number): Record<string, any> {
  const values = (value: any): any => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(values);
    if (typeof value.$ref === "number") return { ...value, $ref: map(value.$ref) };
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, values(child)]));
  };
  const result = values(runtime);
  for (const entity of result.entities) if (entity.instance) entity.instance.asset = map(entity.instance.asset);
  for (const [group, keys] of [
    ["background", ["texture", "skyMesh", "skyMaterial"]],
    ["ambient", ["ambientLight", "customAmbientLight"]]
  ] as const) {
    const settings = result.scene?.[group];
    for (const key of keys) if (settings?.[key] !== undefined) settings[key] = map(settings[key]);
  }
  return result;
}
