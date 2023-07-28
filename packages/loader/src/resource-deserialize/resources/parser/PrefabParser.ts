import { Entity, Engine, Loader } from "@galacean/engine-core";
import type { IEntity, IPrefabFile } from "../schema";
import { PrefabParserContext } from "./PrefabParserContext";
import { ReflectionParser } from "./ReflectionParser";
import CompositionParser from "./CompositionParser";

export class PrefabParser extends CompositionParser<Entity>{

  /**
   * Parse prefab data.
   * @param engine - the engine of the parser context
   * @param sceneData - scene data which is exported by editor
   * @returns a promise of scene
   */
  static parse(engine: Engine, prefabData: IPrefabFile): Promise<Entity> {
    const prefabEntity = new Entity(engine, "prefab");
    const context = new PrefabParserContext(prefabData, prefabEntity);
    const parser = new PrefabParser(context);
    parser.start();
    return parser.promise;
  }

  constructor(public override readonly context: PrefabParserContext) {
    super(context);
    this._engine = this.context.target.engine;
    this._organizeEntities = this._organizeEntities.bind(this);
    this._parseComponents = this._parseComponents.bind(this);
    this._clearAndResolve = this._clearAndResolve.bind(this);
  }

  /** start parse the prefab */
  start() {
    this._parseEntities()
      .then(this._organizeEntities)
      .then(this._parseComponents)
      .then(this._clearAndResolve)
      .then(this._resolve)
      .catch(this._reject);
  }

  _organizeEntities() {
    const { entityConfigMap, entityMap,target, rootIds } = this.context;
    for (const rootId of rootIds) {
      PrefabParser.parseChildren(entityConfigMap, entityMap, rootId);
    }
    const rootEntities = rootIds.map((id) => entityMap.get(id));
    for (let i = 0; i < rootEntities.length; i++) {
      target.addChild(rootEntities[i]);
    }
  }
  
}
