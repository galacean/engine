import type {} from "@galacean/engine-runtime-editor/runtime-editor/generated/editor-source-schema";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { affectedProjectAssets } from "@galacean/engine-project/runtime-editor/project/runtime-project-dependencies";
import {
  compileProjectResource,
  prepareProjectSources
} from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import { sourceNestedEntries } from "@galacean/engine-project/runtime-editor/scene/runtime-source-components";
import { importRuntimeHierarchy } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";
import {
  instanceMemberId,
  RuntimeInstanceSource
} from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-instance-source";

const quarantinePath = (scene: string) => `${scene}.farming-quarantine.json`;
export const farmingPresetPath = (scene: string) => `${scene}.farming-preset.json`;
export const FARMING_PRESET_VERSION = 3;
export const REBUILD_FARM_QUERY = "rebuildFarm";

export function hasQuarantinedFarm(pack: RuntimeProjectPackage): boolean {
  return pack.documents?.[quarantinePath(pack.project.scene)] !== undefined;
}

export function planningFarmingRecoveryNotice(pack: RuntimeProjectPackage): string | undefined {
  if (hasQuarantinedFarm(pack) && pack.documents?.[farmingPresetPath(pack.project.scene)] === undefined)
    return `旧农场已隔离，原存档仍保留。需要新建农场时，在同一世界的 3D 页面地址添加 ${REBUILD_FARM_QUERY}=1 后重新打开。`;
}

export function planningFarmingRecoveryUrl(pack: RuntimeProjectPackage, pageUrl: URL): URL | undefined {
  if (!planningFarmingRecoveryNotice(pack)) return;
  const url = new URL(pageUrl);
  url.searchParams.set(REBUILD_FARM_QUERY, "1");
  return url;
}

type ProjectFile = RuntimeProjectPackage["project"]["files"][number];
type SourceHierarchy = GalaceanSourceSceneFile | GalaceanSourcePrefabFile;
type RetiredInstanceTarget = (instance: string, target: string) => boolean;
type NestedTargetBuckets = Partial<
  Record<"componentProps" | "removedComponents", Record<string, Record<string, unknown>>>
>;
const isHierarchy = (file: ProjectFile) => file.type === "Scene" || file.type === "Prefab";
const QUARANTINE_READ_TIMEOUT_MS = 5000;

async function readQuarantinedContent(file: ProjectFile) {
  try {
    const response = await fetch(file.path, { signal: AbortSignal.timeout(QUARANTINE_READ_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // Retain original bytes, including a UTF-8 BOM or non-text payloads.
    return { content: Array.from(new Uint8Array(await response.arrayBuffer())) };
  } catch (error) {
    return { contentUnavailable: String(error) };
  }
}

function hasQuarantinedReference(
  value: unknown,
  paths: ReadonlySet<string>,
  componentIds: ReadonlySet<string>,
  retiredInstanceTarget: RetiredInstanceTarget,
  nestedSidecar = false
): boolean {
  if (!value || typeof value !== "object") return false;
  if ("$ref" in value && typeof value.$ref === "string" && paths.has(value.$ref)) return true;
  if (nestedSidecar && "refId" in value && typeof value.refId === "string" && paths.has(value.refId)) return true;
  if ("$component" in value) {
    const ref = value.$component;
    if (typeof ref === "string" && componentIds.has(ref)) return true;
    if (
      ref &&
      typeof ref === "object" &&
      "instance" in ref &&
      typeof ref.instance === "string" &&
      "target" in ref &&
      typeof ref.target === "string" &&
      retiredInstanceTarget(ref.instance, ref.target)
    )
      return true;
  }
  return Object.values(value).some((child) =>
    hasQuarantinedReference(child, paths, componentIds, retiredInstanceTarget, nestedSidecar)
  );
}

function pruneHierarchy(
  hierarchy: SourceHierarchy,
  ids: Set<string>,
  retirePreset: boolean,
  removedAssets: ReadonlySet<string>,
  removedPrefabIds: ReadonlyMap<string, ReadonlySet<string>>,
  retiredInstanceTarget: RetiredInstanceTarget
): boolean {
  const referencesQuarantined = (value: unknown) =>
    hasQuarantinedReference(value, removedAssets, ids, retiredInstanceTarget);
  const shouldDetach = (component: GalaceanInlineComponentSchema) =>
    (retirePreset && (component.type === "FarmingSystem" || component.type === "FarmingAreaComponent")) ||
    referencesQuarantined(component);
  // A consumer can itself be the target of another component in this Source file.
  const initialCount = ids.size;
  let previousCount: number;
  do {
    previousCount = ids.size;
    for (const component of hierarchy.components)
      if (!ids.has(component.id) && shouldDetach(component)) ids.add(component.id);
  } while (ids.size !== previousCount);
  let changed = ids.size !== initialCount;
  if (changed) hierarchy.components = hierarchy.components.filter((component) => !ids.has(component.id));
  const filterInline = (entity: GalaceanInlineEntitySchema, detach = shouldDetach) => {
    if (entity.components?.some(detach)) {
      entity.components = entity.components.filter((component) => !detach(component));
      changed = true;
    }
    entity.children?.forEach((child) => filterInline(child, detach));
  };
  for (const entity of hierarchy.entities) {
    if (entity.components?.some((id) => ids.has(id)))
      entity.components = entity.components.filter((id) => !ids.has(id));
    const instance = entity.instance;
    const overrides = instance?.overrides;
    if (!overrides) continue;
    // Override targets use the immediate Prefab's Source namespace, even if already hidden by this instance.
    const removedTargets = removedPrefabIds.get(instance.asset.$ref);
    if (overrides.removedComponents?.some((target) => removedTargets?.has(target))) {
      overrides.removedComponents = overrides.removedComponents.filter((target) => !removedTargets?.has(target));
      changed = true;
    }
    if (overrides.addedComponents?.some(({ component }) => shouldDetach(component))) {
      overrides.addedComponents = overrides.addedComponents.filter(({ component }) => !shouldDetach(component));
      changed = true;
    }
    if (overrides.componentProps) {
      const discarded = overrides.componentProps.filter(
        (props) => removedTargets?.has(props.target) || referencesQuarantined(props)
      );
      if (discarded.length) {
        const detached = discarded.filter(({ target }) => !removedTargets?.has(target));
        if (detached.length)
          overrides.removedComponents = [
            ...new Set([...(overrides.removedComponents ?? []), ...detached.map(({ target }) => target)])
          ];
        overrides.componentProps = overrides.componentProps.filter(
          ({ target }) => !removedTargets?.has(target) && !overrides.removedComponents?.includes(target)
        );
        changed = true;
      }
    }
    overrides.addedEntities?.forEach(({ entity: child }) => filterInline(child));
  }
  for (const entry of sourceNestedEntries(hierarchy)) {
    // Native nested sidecars index targets by Prefab asset, source owner and source component ID.
    const removed = removedPrefabIds.get(entry.assetId);
    if (!entry.overrides) continue;
    const overrides = entry.overrides as typeof entry.overrides & NestedTargetBuckets;
    const referencesRetiredSidecar = (value: unknown) =>
      hasQuarantinedReference(value, removedAssets, ids, retiredInstanceTarget, true);
    const detachAdded = (component: { type: string }) =>
      (retirePreset && (component.type === "FarmingSystem" || component.type === "FarmingAreaComponent")) ||
      referencesRetiredSidecar(component);
    for (const targets of Object.values(overrides.addedComponents ?? {})) {
      for (const [id, component] of Object.entries(targets)) {
        if (!detachAdded(component)) continue;
        delete targets[id];
        changed = true;
      }
    }
    entry.addedEntities?.forEach(({ entity }) => filterInline(entity, detachAdded));
    for (const targets of Object.values(overrides.removedComponents ?? {})) {
      for (const id of Object.keys(targets)) {
        if (!removed?.has(id)) continue;
        delete targets[id];
        changed = true;
      }
    }
    for (const [owner, targets] of Object.entries(overrides.componentProps ?? {})) {
      for (const [id, value] of Object.entries(targets)) {
        const retiredTarget = removed?.has(id);
        if (!retiredTarget) {
          if (!referencesRetiredSidecar(value)) continue;
          const removals = (overrides.removedComponents ??= {});
          (removals[owner] ??= {})[id] = true;
        }
        delete targets[id];
        changed = true;
      }
    }
  }
  return changed;
}

/** Keep unsupported bytes out of the active resource graph before any loaders or author validators run. */
export async function quarantineUnsupportedPlanningFarm(
  project: RuntimeProjectSession,
  isRegisteredComponent: (name: string) => boolean
): Promise<void> {
  const pack = project.projectPackage;
  const scene = pack.project.scene;
  const markerPath = farmingPresetPath(scene);
  const marker = pack.documents?.[markerPath];
  const unsupportedPreset = marker !== undefined && JSON.parse(marker)?.version !== FARMING_PRESET_VERSION;
  const unsupported = pack.project.files
    .filter((file) => file.type === "FarmingResource")
    .map((file) => file.virtualPath);
  if (!unsupportedPreset && !unsupported.length) return;

  // Scripts and other standalone consumers of unsupported assets are themselves unsafe to load.
  // Keep the hierarchy assets and detach only the components that reference isolated entries.
  const removed = affectedProjectAssets(
    pack.project.files.filter((file) => !isHierarchy(file)),
    unsupported
  );

  const hierarchies = pack.project.files.filter(
    (file) =>
      isHierarchy(file) &&
      (file.virtualPath === scene ||
        (removed.size > 0 && (file.dependencies === undefined || file.dependencies.some((path) => removed.has(path)))))
  );
  const affected = affectedProjectAssets(pack.project.files, [
    ...removed,
    ...hierarchies.map((file) => file.virtualPath)
  ]);
  const validationPaths = pack.project.files.filter((file) => isHierarchy(file) && affected.has(file.virtualPath));
  const provider = project.fileProvider();
  for (const file of validationPaths) await provider.prepare!(file.virtualPath);
  await prepareProjectSources(pack, (path) => provider.prepare!(path));
  // Read archives detached from the accepted VFS. Failure to read an obsolete URL must not block opening the world.
  const coldAssets = pack.project.files.filter(
    (file) => removed.has(file.virtualPath) && pack.contents[file.virtualPath] === undefined
  );
  const recovered = new Map(
    await Promise.all(coldAssets.map(async (file) => [file.virtualPath, await readQuarantinedContent(file)] as const))
  );
  const unavailable: string[] = [];

  await project.update((current) => {
    const contents = { ...current.contents };
    const documents = { ...current.documents };
    const originalHierarchies: Record<string, string> = {};
    const removedPrefabIds = new Map<string, Set<string>>();
    const sources = validationPaths.map((file) => {
      const path = file.virtualPath;
      const original = contents[path];
      if (typeof original !== "string") throw new Error(`Read farming hierarchy before isolation: ${path}`);
      const baseline = importRuntimeHierarchy(
        JSON.parse(original),
        path,
        current.project.files,
        isRegisteredComponent
      ) as unknown as SourceHierarchy;
      const hierarchy = structuredClone(baseline);
      const ids = new Set<string>();
      if (file.type === "Prefab") removedPrefabIds.set(path, ids);
      let instances: RuntimeInstanceSource | undefined;
      const retiredInstanceTarget: RetiredInstanceTarget = (instance, target) => {
        // Resolve against the original editable topology, while the member still exists.
        if (!instances) {
          const source = "scene" in baseline ? baseline : { ...baseline, scene: { rootEntities: [baseline.root] } };
          instances = new RuntimeInstanceSource(source, current);
        }
        const member = instances.components.get(instanceMemberId([instance], target));
        if (!member || member.added) return false;
        const overrides = hierarchy.entities.find(({ id }) => id === instance)?.instance?.overrides;
        return Boolean(
          removedPrefabIds.get(member.instance.asset.$ref)?.has(member.target) ||
            overrides?.removedComponents?.includes(member.target)
        );
      };
      return { path, hierarchy, ids, original, retiredInstanceTarget };
    });
    // A Prefab may appear after its consumers in the manifest. Repeat only while Source edits take effect.
    let changed: boolean;
    do {
      changed = false;
      for (const { path, hierarchy, ids, original, retiredInstanceTarget } of sources) {
        if (
          !pruneHierarchy(
            hierarchy,
            ids,
            unsupportedPreset && path === scene,
            removed,
            removedPrefabIds,
            retiredInstanceTarget
          )
        )
          continue;
        originalHierarchies[path] = original;
        contents[path] = JSON.stringify(hierarchy);
        changed = true;
      }
    } while (changed);

    const assets = current.project.files
      .filter((file) => removed.has(file.virtualPath))
      .map((file) => {
        const path = file.virtualPath;
        const content = contents[path];
        const metadata = documents[`${path}.meta`];
        delete contents[path];
        delete documents[`${path}.meta`];
        const body =
          content === undefined
            ? (recovered.get(path) ?? { contentUnavailable: "No archived content" })
            : { content: content instanceof Uint8Array ? Array.from(content) : content };
        if ("contentUnavailable" in body) unavailable.push(path);
        return { file, metadata, ...body };
      });
    if (unsupportedPreset || scene in originalHierarchies) delete documents[markerPath];
    const archive = quarantinePath(scene);
    const previous: unknown[] = documents[archive] === undefined ? [] : JSON.parse(documents[archive]);
    documents[archive] = JSON.stringify([...previous, { marker, assets, originalHierarchies }]);
    const candidate = {
      ...current,
      project: { ...current.project, files: current.project.files.filter((file) => !removed.has(file.virtualPath)) },
      contents,
      documents
    };
    // Project dependency validation only checks asset paths. Check effective Source before accepting the edit.
    for (const file of validationPaths) compileProjectResource(candidate, file.virtualPath);
    return candidate;
  });
  if (unavailable.length) console.warn("旧农场资产已隔离，以下资产原文无法读取，归档保留了路径和元数据。", unavailable);
}
