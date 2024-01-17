import { Entity } from "@galacean/engine-core";
import { IPrefabFile } from "../schema";
import { ParserContext } from "../parser/ParserContext";

export class PrefabParserContext extends ParserContext<IPrefabFile, Entity> {}
