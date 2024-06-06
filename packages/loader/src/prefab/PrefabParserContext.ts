import { Engine, Entity } from "@galacean/engine-core";
import { ParserContext } from "../resource-deserialize/resources/parser/ParserContext";
import { IHierarchyFile } from "../resource-deserialize";

export class PrefabParserContext extends ParserContext<IHierarchyFile, Entity> {
  constructor(engine: Engine) {
    super(engine);
  }
}
