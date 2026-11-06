import { ReferResource, EngineObject, type ResourceManager } from "@galacean/engine";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import { extractAssetDependencies } from "@galacean/engine-project/runtime-editor/project/runtime-project-dependencies";
import type { RuntimeAssetFormat } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";

type Content = RuntimeProjectPackage["contents"][string];
type File = RuntimeProjectPackage["project"]["files"][number];

/** Borrowed for the duration of withAsset(). Return computed data, not live resources. */
export interface RuntimePreparedAsset<T extends EngineObject> {
  resource: T;
  content: Content;
}

/** Prepare only the dependency closure, using the edit's own author snapshot. */
export async function prepareAssetInputs(
  pack: RuntimeProjectPackage,
  path: string,
  formats: ReadonlyMap<string, RuntimeAssetFormat>,
  hydrate: (path: string) => Promise<Content | undefined>,
  signal: AbortSignal
): Promise<string[]> {
  const files = new Map(pack.project.files.map((file) => [file.virtualPath, file]));
  const visited = new Set<string>(),
    visiting = new Set<string>(),
    order: string[] = [];
  async function visit(path: string): Promise<void> {
    signal.throwIfAborted();
    if (visited.has(path)) return;
    if (visiting.has(path)) throw new Error(`Cyclic native asset dependency: '${path}'`);
    const file = files.get(path);
    if (!file) throw new Error(`Unknown asset '${path}'`);
    if (file.type.toLowerCase() === "script")
      throw new Error(`Preparing a Script dependency requires an isolated script runtime: '${path}'`);
    visiting.add(path);
    const format = formats.get(file.type);
    // Opaque leaves keep their native loader URL; do not download/decode meshes and textures twice.
    if (pack.contents[path] === undefined && (path === root || format?.referenceTypes?.length !== 0)) {
      const content = await hydrate(path);
      if (content !== undefined) pack.contents[path] = content;
    }
    const dependencies = extractAssetDependencies(file, pack.contents[path], format) ?? file.dependencies;
    if (!dependencies) throw new Error(`Asset dependencies are unavailable: '${path}'`);
    file.dependencies = dependencies;
    for (const dependency of dependencies) await visit(dependency);
    visiting.delete(path);
    visited.add(path);
    order.push(path);
  }
  const root = path;
  await visit(path);
  return order;
}

/** Remap only native reference fields, never arbitrary strings or component properties. */
export function compilePreparedAsset(
  pack: RuntimeProjectPackage,
  file: File,
  resolve: (path: string) => string
): Content | undefined {
  const content = compileProjectResource(pack, file.virtualPath);
  if (typeof content !== "string") {
    if (file.dependencies?.length) throw new Error(`No native reference compiler for '${file.type}'`);
    return content;
  }
  const remap = (ref: { url?: string } | undefined) => {
    if (ref?.url) ref.url = resolve(ref.url);
  };
  switch (file.type) {
    case "Prefab":
    case "Scene": {
      const value = JSON.parse(content);
      for (const ref of value.refs ?? []) remap(ref);
      return JSON.stringify(value);
    }
    case "Material": {
      const value = JSON.parse(content);
      remap(value.shaderRef);
      for (const entry of Object.values(value.shaderData ?? {}) as { type: string; value: { url?: string } }[]) {
        if (entry.type === "Texture") remap(entry.value);
      }
      return JSON.stringify(value);
    }
    case "AnimatorController": {
      const value = JSON.parse(content);
      for (const layer of value.layers ?? []) for (const state of layer.stateMachine?.states ?? []) remap(state.clip);
      return JSON.stringify(value);
    }
    default:
      if (file.dependencies?.length) throw new Error(`No native reference compiler for '${file.type}'`);
      return content;
  }
}

/** A separate reference namespace keeps author reads from activating or rebinding the live Scene. */
export async function withPreparedAsset<T extends EngineObject, R>(
  manager: ResourceManager,
  pack: RuntimeProjectPackage,
  path: string,
  order: readonly string[],
  signal: AbortSignal,
  use: (asset: RuntimePreparedAsset<T>) => R | Promise<R>
): Promise<R> {
  const prefix = `prepared/${crypto.randomUUID()}/`;
  const paths = new Set(order),
    urls: string[] = [];
  const owned = new Set<EngineObject>();
  let resource: T | undefined;
  let resources: File[] = [];
  let unregister: (() => void) | undefined;
  const resolve = (path: string) => {
    if (!paths.has(path)) throw new Error(`Unprepared native asset reference: '${path}'`);
    return prefix + path;
  };
  try {
    resources = order.map((path) => {
      const file = pack.project.files.find((file) => file.virtualPath === path)!;
      const content = compilePreparedAsset(pack, file, resolve);
      let url = file.path;
      if (content !== undefined) {
        const bytes = typeof content === "string" ? content : (new Uint8Array(content).buffer as ArrayBuffer);
        url = URL.createObjectURL(
          new Blob([bytes], { type: typeof content === "string" ? "application/json" : "application/octet-stream" })
        );
        urls.push(url);
      }
      return { ...file, virtualPath: resolve(path), path: url };
    });
    unregister = manager.registerVirtualResources(resources);
    // Let native loaders resolve their dependencies, including non-cached resources.
    // Await a cancelled load as well, so a late result cannot escape cleanup.
    signal.throwIfAborted();
    resource = await manager.load<T>({ url: resolve(path) });
    if (manager.engine.destroyed) throw new Error("Engine destroyed during asset preparation");
    if (resource instanceof ReferResource) {
      resource._addReferCount(1);
    }
    if (urls.includes(resources.find((file) => file.virtualPath === resolve(path))!.path)) owned.add(resource);
    signal.throwIfAborted();
    const result = await use({ resource: resource!, content: pack.contents[path] });
    if (manager.engine.destroyed) throw new Error("Engine destroyed during asset preparation");
    signal.throwIfAborted();
    return result;
  } finally {
    // Cached resources created for this snapshot are released consumer-first. Non-cached
    // dependencies follow native ReferResource/Prefab ownership and Engine GC.
    for (const file of manager.engine.destroyed ? [] : resources.slice().reverse()) {
      if (!urls.includes(file.path)) continue;
      const loaded = manager.getFromCache(file.virtualPath);
      if (loaded instanceof EngineObject) owned.add(loaded);
    }
    if (resource instanceof ReferResource && !resource.destroyed) {
      resource._addReferCount(-1);
    }
    for (const resource of owned) if (!resource.destroyed) resource.destroy();
    unregister?.();
    for (const url of urls) URL.revokeObjectURL(url);
  }
}
