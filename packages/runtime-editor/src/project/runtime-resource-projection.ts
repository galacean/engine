import { Material, type ResourceManager } from "@galacean/engine";
import type { RuntimeProjectManifest } from "@galacean/engine-project/runtime-editor/project/runtime-project";

/** Native resource updates. Domain-owned clones remain the responsibility of their consumers. */
export class RuntimeResourceProjection {
  private readonly materials = new Map<string, Material>();
  async apply(
    manager: ResourceManager,
    resources: RuntimeProjectManifest["files"],
    signal: AbortSignal
  ): Promise<void> {
    // Capture before remapping URLs, including materials only referenced through Prefabs.
    const active = new Set(resources.filter((file) => file.type === "Material").map((file) => file.virtualPath));
    for (const path of this.materials.keys()) if (!active.has(path)) this.materials.delete(path);
    const materials = resources
      .filter((file) => file.type === "Material")
      .map((file) => ({
        path: file.virtualPath,
        previous:
          this.materials.get(file.virtualPath)?.destroyed === false
            ? this.materials.get(file.virtualPath)!
            : manager.getFromCache<Material>(file.virtualPath)
      }))
      .filter(
        (entry): entry is { path: string; previous: Material } =>
          entry.previous instanceof Material && !entry.previous.destroyed
      );
    for (const entry of materials) this.materials.set(entry.path, entry.previous);
    manager.registerVirtualResources(resources);
    for (const { path, previous } of materials) {
      signal.throwIfAborted();
      const next = await manager.load<Material>({ url: path });
      signal.throwIfAborted();
      if (next === previous) continue;
      next.cloneTo(previous);
      previous.name = next.name;
      manager.replaceCachedResource(path, previous);
      next.destroy();
    }
  }
}
