import { visitSourceComponents } from "./runtime-source-components";
import {
  compileSourcePrefabToRuntime,
  compileSourceSceneToRuntime,
  getBuiltinComponentRuntimeCapabilitySnapshot
} from "../generated/editor-source-compiler";
import type { RuntimeProjectPackage } from "../project/runtime-project";

type ProjectFile = RuntimeProjectPackage["project"]["files"][number];
type CompilationInputs = {
  scripts: string;
  files: Map<string, string>;
  contents: Map<string, string | undefined>;
};
// At most one output per hierarchy in the current namespace. Cache only successful
// pure compilation, and retain immutable text rather than detached project copies.
const compilations = new Map<string, { inputs: CompilationInputs; output: string }>();

function compilationFileKey(files: readonly ProjectFile[] | undefined): string {
  // These are the fields read by the source compiler. Keep multiplicity/order so
  // a formerly unambiguous reference cannot hide a newly added duplicate asset.
  return JSON.stringify(
    files?.map((file) => [
      file.type,
      typeof file.params?.sourceContentRevision === "string" ? file.params.sourceContentRevision : null
    ]) ?? []
  );
}

/** Compile editable hierarchy files only at the engine resource boundary. */
export function compileProjectResource(
  pack: RuntimeProjectPackage,
  virtualPath: string,
  unavailableScript?: (path: string) => boolean
): string | Uint8Array | undefined {
  return projectCompiler(pack, unavailableScript)(virtualPath);
}

/** Validate the shared source context once for a synchronous batch. */
export function compileProjectResources(pack: RuntimeProjectPackage, unavailableScript?: (path: string) => boolean) {
  const compile = projectCompiler(pack, unavailableScript);
  return pack.project.files.map((file) => compile(file.virtualPath));
}

/** The detached caller controls scheduling and cancellation between resource checks. */
export async function compileProjectResourcesAsync(
  pack: RuntimeProjectPackage,
  checkpoint: () => Promise<void> | undefined
) {
  const compile = projectCompiler(pack);
  for (const file of pack.project.files) {
    compile(file.virtualPath);
    const pending = checkpoint();
    if (pending) await pending;
  }
}

function projectCompiler(pack: RuntimeProjectPackage, unavailableScript?: (path: string) => boolean) {
  const files = new Map<string, ProjectFile[]>();
  for (const file of pack.project.files) {
    const entries = files.get(file.virtualPath);
    if (entries) entries.push(file);
    else files.set(file.virtualPath, [file]);
  }
  const scripts = JSON.stringify(
    pack.project.files.filter((file) => file.type.toLowerCase() === "script").map((file) => file.virtualPath)
  );
  for (const path of compilations.keys())
    if (!files.get(path)?.some((file) => /^(Scene|Prefab|AnimatorController)$/i.test(file.type)))
      compilations.delete(path);
  return (path: string): string | Uint8Array | undefined => {
    const file = files.get(path)?.[0],
      content = pack.contents[path];
    if (typeof content !== "string" || !file || !/^(Scene|Prefab|AnimatorController)$/i.test(file.type)) {
      compilations.delete(path);
      return content;
    }
    const cached = unavailableScript ? undefined : compilations.get(path);
    if (
      cached &&
      cached.inputs.scripts === scripts &&
      [...cached.inputs.files].every(([key, value]) => compilationFileKey(files.get(key)) === value) &&
      [...cached.inputs.contents].every(([key, value]) => pack.contents[key] === value)
    )
      return cached.output;
    const inputs: CompilationInputs = { scripts, files: new Map(), contents: new Map() };
    const readFiles = (key: string) => {
      const entries = files.get(key);
      inputs.files.set(key, compilationFileKey(entries));
      return entries ?? [];
    };
    const readContent = (key: string) => {
      const value = pack.contents[key];
      inputs.contents.set(key, typeof value === "string" ? value : undefined);
      return value;
    };
    const result = compileProjectResourceUncached(pack, path, readFiles, readContent, unavailableScript);
    if (!unavailableScript && typeof result === "string") compilations.set(path, { inputs, output: result });
    return result;
  };
}

function compileProjectResourceUncached(
  pack: RuntimeProjectPackage,
  virtualPath: string,
  readFiles: (path: string) => readonly ProjectFile[],
  readContent: (path: string) => string | Uint8Array | undefined,
  unavailableScript?: (path: string) => boolean
): string | Uint8Array | undefined {
  const content = readContent(virtualPath);
  const file = readFiles(virtualPath)[0];
  if (typeof content === "string" && file?.type === "AnimatorController") {
    const controller = JSON.parse(content);
    for (const layer of controller.layers ?? [])
      for (const state of layer.stateMachine?.states ?? []) {
        if (!state.clip?.url) continue;
        const dependency = readFiles(state.clip.url)[0];
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
    const matches = readFiles(path);
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
      const text = readContent(dependency.virtualPath);
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
  const result = JSON.stringify(
    unavailableScript ? suppressUnavailableScriptPayloads(lowered, unavailableScript) : lowered
  );
  return result;
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

let preparedSources:
  | {
      roots: string;
      files: Map<string, string>;
      contents: Map<string, string | Uint8Array | undefined>;
    }
  | undefined;

/** Materialize only Prefab topology referenced by editable hierarchy sources. */
export async function prepareProjectSources(
  pack: RuntimeProjectPackage,
  load: (virtualPath: string) => Promise<void>
): Promise<void> {
  const files = new Map<string, ProjectFile[]>();
  for (const file of pack.project.files) {
    const entries = files.get(file.virtualPath);
    if (entries) entries.push(file);
    else files.set(file.virtualPath, [file]);
  }
  const roots = pack.project.files
    .filter((file) => /^(Scene|Prefab)$/i.test(file.type))
    .map((file) => file.virtualPath);
  const rootKey = JSON.stringify(roots);
  if (
    preparedSources?.roots === rootKey &&
    [...preparedSources.files].every(([path, key]) => compilationFileKey(files.get(path)) === key) &&
    [...preparedSources.contents].every(([path, text]) => pack.contents[path] === text)
  )
    return;
  const inputs = {
    roots: rootKey,
    files: new Map<string, string>(),
    contents: new Map<string, string | Uint8Array | undefined>()
  };
  const visited = new Set<string>();
  let complete = true;
  async function visit(path: string, required = false): Promise<void> {
    if (visited.has(path)) return;
    visited.add(path);
    const content = pack.contents[path];
    if (typeof content !== "string") {
      // Binary hierarchy inputs are not accepted compilation inputs; retry them.
      if (required || content !== undefined) complete = false;
      inputs.contents.set(path, content);
      return;
    }
    inputs.contents.set(path, content);
    const source = JSON.parse(content);
    if (!source?.asset) return;
    const pending: unknown[] = [source];
    const prefabRefs: string[] = [];
    while (pending.length) {
      const value = pending.pop();
      if (!value || typeof value !== "object") continue;
      const ref = (value as { $ref?: unknown }).$ref;
      if (typeof ref === "string") {
        // Loading a Prefab may hydrate additional source records. Resolve against
        // the live detached package after awaits, not the earlier cache-check index.
        const matches = pack.project.files.filter((file) => file.virtualPath === ref);
        inputs.files.set(ref, compilationFileKey(matches));
        if (matches.length !== 1) throw new Error(`Cannot resolve project asset '${ref}' unambiguously`);
        const dependency = matches[0];
        if (dependency.type.toLowerCase() === "prefab" && !visited.has(dependency.virtualPath)) {
          prefabRefs.push(dependency.virtualPath);
        }
      }
      pending.push(...Object.values(value));
    }
    if (prefabRefs.length) {
      const unique = [...new Set(prefabRefs)];
      await Promise.all(
        unique.map(async (virtualPath) => {
          if (visited.has(virtualPath)) return;
          await load(virtualPath);
          await visit(virtualPath, true);
        })
      );
    }
  }
  const hierarchyFiles = pack.project.files.filter((file) => /^(Scene|Prefab)$/i.test(file.type));
  for (const file of hierarchyFiles) {
    const path = file.virtualPath;
    inputs.files.set(path, compilationFileKey(pack.project.files.filter((entry) => entry.virtualPath === path)));
  }
  await Promise.all(hierarchyFiles.map((file) => visit(file.virtualPath)));
  if (complete) preparedSources = inputs;
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
