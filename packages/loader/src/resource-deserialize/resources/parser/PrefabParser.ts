import { Entity, Engine } from "@galacean/engine-core";
import type { IPrefabFile } from "../schema";
import { PrefabParserContext } from "./PrefabParserContext";
import CompositionParser from "./CompositionParser";

export class PrefabParser extends CompositionParser<Entity> {
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

  override _organizeEntities() {
    super._organizeEntities();
    const { entityMap, target, rootIds } = this.context;
    const rootEntities = rootIds.map((id) => entityMap.get(id));
    for (let i = 0; i < rootEntities.length; i++) {
      target.addChild(rootEntities[i]);
    }
  }
}
