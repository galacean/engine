import { Engine, Scene } from "@galacean/engine-core";
import { IScene } from "../schema";
import { ParserContext } from "./ParserContext";

export abstract class CustomParser {
  onSceneParse(engine: Engine, context: ParserContext<IScene, Scene>, data: IScene): Promise<void> {
    return Promise.resolve();
  }
}
