import { IPoolElement } from "./IPoolElement";
import { RenderData } from "./RenderData";
import { SpriteRenderData } from "./SpriteRenderData";

export class TextRenderData extends RenderData implements IPoolElement {
  charsData: SpriteRenderData[] = [];

  constructor() {
    super();
    this.multiRenderData = true;
  }

  dispose(): void {
    this.component = this.material = null;
    this.charsData.length = 0;
  }
}
