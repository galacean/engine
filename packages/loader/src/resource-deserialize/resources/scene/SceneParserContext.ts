import { Component, Entity, Scene } from "@galacean/engine-core";
import type { IEntity, IScene } from "../schema";
import { ParserContext } from "../parser/ParserContext";

export class SceneParserContext extends ParserContext<Scene,IScene> {
}
