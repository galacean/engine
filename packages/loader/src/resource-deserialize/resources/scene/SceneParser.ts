import { Engine, Entity, Loader, Scene } from "@galacean/engine-core";
import { PrefabParser } from "../parser/PrefabParser";
import { ReflectionParser } from "../parser/ReflectionParser";
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

  constructor(public override readonly context: SceneParserContext) {
    super(context);
    this._engine = this.context.target.engine;
    this._organizeEntities = this._organizeEntities.bind(this);
    this._parseComponents = this._parseComponents.bind(this);
    this._clearAndResolve = this._clearAndResolve.bind(this);
  }

  /** start parse the scene */
  start() {
    this._parseEntities()
      .then(this._organizeEntities)
      .then(this._parseComponents)
      .then(this._clearAndResolve)
      .then(this._resolve)
      .catch(this._reject);
  }

  _organizeEntities() {
    const { entityConfigMap, entityMap, target, rootIds } = this.context;
    for (const rootId of rootIds) {
      SceneParser.parseChildren(entityConfigMap, entityMap, rootId);
    }
    const rootEntities = rootIds.map((id) => entityMap.get(id));
    for (let i = 0; i < rootEntities.length; i++) {
      target.addRootEntity(rootEntities[i]);
    }
  }
}
