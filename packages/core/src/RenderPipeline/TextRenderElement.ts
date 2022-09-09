import { RenderElement } from "./RenderElement";
import { SpriteElement } from "./SpriteElement";

export class TextRenderElement extends RenderElement {
  charElements: SpriteElement[] = [];

  constructor() {
    super();
    this.multiRenderData = true;
  }
}
