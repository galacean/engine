import { Engine, Scene } from "@galacean/engine-core";
import { HierarchyParser } from "../parser/HierarchyParser";
import { ParserContext, ParserType } from "../parser/ParserContext";
import type { IScene } from "../schema";

/** @Internal */
export class SceneParser extends HierarchyParser<Scene, ParserContext<IScene, Scene>> {
  static _extendParsers = new Map<
    string,
    {
      parse: (engine: Engine, context: ParserContext<IScene, Scene>, data: IScene) => Promise<any>;
    }
  >();

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

  protected override _extendParse(): Promise<any> {
    const promises = [];
    const { _engine: engine, context, data } = this;
    SceneParser._extendParsers.forEach((parser) => {
      promises.push(parser.parse(engine, context, data as IScene));
    });
    return Promise.all(promises);
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

/**
 * Register extend parser for scene parser.
 * @param key - parser key
 * @returns Parser decorator
 */
export function registerSceneExtendParser(key: string): ClassDecorator {
  return (target: any) => {
    SceneParser._extendParsers.set(key, target);
  };
}
