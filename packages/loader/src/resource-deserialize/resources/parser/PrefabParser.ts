import { Entity, Engine } from "@galacean/engine-core";
import type { IPrefabFile } from "../schema";
import { PrefabParserContext } from "./PrefabParserContext";
import CompositionParser from "./CompositionParser";

export class PrefabParser extends CompositionParser<Entity> {
  /**
   * Parse prefab data.
   * @param engine - the engine of the parser context
   * @param prefabData - prefab data which is exported by editor
   * @returns a promise of prefab
   */
  static parse(engine: Engine, prefabData: IPrefabFile): Promise<Entity> {
    const prefabEntity = new Entity(engine, "prefab");
    const context = new PrefabParserContext(prefabData, prefabEntity);
    const parser = new PrefabParser(context);
    parser.start();
    return parser.promise;
  }

  protected override appendChild(entity: Entity): void {
    const { target } = this.context;
    target.addChild(entity);
  }
}
