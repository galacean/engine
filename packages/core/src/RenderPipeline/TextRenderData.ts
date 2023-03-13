import { RenderData } from "./RenderData";
import { SpriteRenderData } from "./SpriteRenderData";

export class TextRenderData extends RenderData {
  charsData: SpriteRenderData[] = [];

  constructor() {
    super();
    this.multiRenderData = true;
  }
}
