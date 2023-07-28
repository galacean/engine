import { Entity, Engine, Component } from "@galacean/engine-core";
import { IEntity, IPrefabFile } from "../schema";
import { ParserContext } from "./ParserContext";

export class PrefabParserContext extends ParserContext<Entity,IPrefabFile> {
}
