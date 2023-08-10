import { Engine, Entity, Scene } from "@galacean/engine-core";
import type { IScene } from "../schema";
import { SceneParserContext } from "./SceneParserContext";
import HierarchyParser from "../parser/HierarchyParser";

/** @Internal */
export class SceneParser extends HierarchyParser<Scene, SceneParserContext> {
  /**
   * Parse scene data.
   * @param engine - the engine of the parser context
   * @param sceneData - scene data which is exported by editor
   * @returns a promise of scene
   */
  static parse(engine: Engine, sceneData: IScene): Promise<Scene> {
    const scene = new Scene(engine);
    const context = new SceneParserContext(sceneData, engine, scene);
    const parser = new SceneParser(context);
    parser.start();
    return parser.promise;
  }

  protected override handleRootEntity(id: string): void {
    const { target, entityMap } = this.context;
    target.addRootEntity(entityMap.get(id));
  }
}
