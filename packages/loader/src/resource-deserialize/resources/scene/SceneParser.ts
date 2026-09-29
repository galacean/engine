import { Scene } from "@galacean/engine-core";
import type { SceneFile } from "../../../schema/SceneSchema";
import { HierarchyParser } from "../parser/HierarchyParser";
import { ParserContext } from "../parser/ParserContext";

/** @Internal */
export class SceneParser extends HierarchyParser<Scene, ParserContext> {
  constructor(
    data: SceneFile,
    context: ParserContext,
    public readonly scene: Scene
  ) {
    super(data, context);
  }

  /**
   * @internal
   */
  _collectDependentAssets(data: SceneFile): void {
    const context = this.context;
    const resourceManager = context.resourceManager;
    const refs = data.refs;
    for (let i = 0, n = refs.length; i < n; i++) {
      context._addDependentAsset(resourceManager.getResourceByRef(refs[i]));
    }
  }

  protected override _getRootIndices(): number[] {
    return (this.data as SceneFile).scene.rootEntities;
  }

  protected override _handleRootEntity(index: number): void {
    this.scene.addRootEntity(this.context.entityInstances[index]);
  }

  protected override _clearAndResolve() {
    this.context.clear();
    return this.scene;
  }
}
