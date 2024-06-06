import { Scene } from "@galacean/engine-core";
import { IScene } from "../schema";
import { ParserContext } from "../parser/ParserContext";

export class SceneParserContext extends ParserContext<IScene, Scene> {
  constructor(public override readonly engine) {
    super(engine);
  }
}
