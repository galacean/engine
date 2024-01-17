import { Scene } from "@galacean/engine-core";
import { IScene } from "../schema";
import { ParserContext } from "../parser/ParserContext";

export class SceneParserContext extends ParserContext<IScene, Scene> {
  constructor(
    public override readonly originalData: IScene,
    public override readonly engine,
    public readonly scene: Scene
  ) {
    super(originalData, engine, scene);
  }
}
