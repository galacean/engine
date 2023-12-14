import { Entity, Engine } from "@galacean/engine-core";
import type { IPrefabFile } from "../schema";
import { PrefabParserContext } from "./PrefabParserContext";
import HierarchyParser from "../parser/HierarchyParser";

export class PrefabParser extends HierarchyParser<Entity, PrefabParserContext> {
  /**
   * Parse prefab data.
   * @param engine - the engine of the parser context
   * @param prefabData - prefab data which is exported by editor
   * @returns a promise of prefab
   */
  static parse(engine: Engine, prefabData: IPrefabFile): PrefabParser {
    const context = new PrefabParserContext(prefabData, engine);
    const parser = new PrefabParser(context);
    parser.start();
    return parser;
  }

  protected override handleRootEntity(id: string): void {
    this.context.target = this.context.entityMap.get(id);
  }
}
