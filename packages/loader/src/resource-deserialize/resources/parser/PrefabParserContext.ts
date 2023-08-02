import { Entity } from "@galacean/engine-core";
import { IPrefabFile } from "../schema";
import { ParserContext } from "./ParserContext";

export class PrefabParserContext extends ParserContext<Entity, IPrefabFile> {}
