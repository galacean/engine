import { Engine, ReferResource, Scene } from "@galacean/engine-core";
import type { IScene } from "../schema";
import { HierarchyParser } from "../parser/HierarchyParser";
import { ParserContext, ParserType } from "../parser/ParserContext";

/** @Internal */
export class SceneParser extends HierarchyParser<Scene, ParserContext<IScene, Scene>> {
  /**
   * Parse scene data.
   * @param engine - the engine of the parser context
   * @param sceneData - scene data which is exported by editor
   * @returns a promise of scene
   */
  static parse(engine: Engine, sceneData: IScene): Promise<Scene> {
    const scene = new Scene(engine);
    const context = new ParserContext<IScene, Scene>(engine, ParserType.Scene, scene);
    const parser = new SceneParser(sceneData, context, scene);
    parser.start();
    return parser.promise.then(() => scene);
  }

  constructor(
    data: IScene,
    context: ParserContext<IScene, Scene>,
    public readonly scene: Scene
  ) {
    super(data, context);
  }

  protected override _handleRootEntity(id: string): void {
    const { entityMap } = this.context;
    this.scene.addRootEntity(entityMap.get(id));
  }

  protected override _clearAndResolve() {
    this.context.clear();
    return this.scene;
  }
}
