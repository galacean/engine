import { Engine, Scene } from "@galacean/engine-core";
import type { IScene } from "../schema";
import { SceneParserContext } from "./SceneParserContext";
import CompositionParser from "../parser/CompositionParser";

/** @Internal */
export class SceneParser extends CompositionParser<Scene> {
  /**
   * Parse scene data.
   * @param engine - the engine of the parser context
   * @param sceneData - scene data which is exported by editor
   * @returns a promise of scene
   */
  static parse(engine: Engine, sceneData: IScene): Promise<Scene> {
    const scene = new Scene(engine);
    const context = new SceneParserContext(sceneData, scene);
    const parser = new SceneParser(context);
    parser.start();
    return parser.promise;
  }
}
