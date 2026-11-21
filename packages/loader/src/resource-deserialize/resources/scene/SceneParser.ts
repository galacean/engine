import { Scene } from "@galacean/engine-core";
import type { SceneFile } from "../../../schema/SceneSchema";
import { HierarchyParser } from "../parser/HierarchyParser";

/** @Internal */
export class SceneParser extends HierarchyParser<Scene> {
  /**
   * @internal
   */
  _collectDependentAssets(): void {
    const context = this.context;
    const resourceManager = context.resourceManager;
    const refs = this.data.refs;
    for (let i = 0, n = refs.length; i < n; i++) {
      context._addDependentAsset(resourceManager.getResourceByRef(refs[i]));
    }
  }

  protected override _getRootIndices(): number[] {
    return (this.data as SceneFile).scene.rootEntities;
  }

  protected override _handleRootEntity(index: number): void {
    const context = this.context;
    context.resource.addRootEntity(context.entityInstances[index]);
  }
}
