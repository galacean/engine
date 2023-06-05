import { IPoolElement } from "./IPoolElement";
import { RenderElement } from "./RenderElement";
import { SpriteElement } from "./SpriteElement";

export class TextRenderElement extends RenderElement implements IPoolElement {
  charElements: SpriteElement[] = [];

  constructor() {
    super();
    this.multiRenderData = true;
  }

  dispose() {
    const elements = this.charElements;
    for (let i = elements.length; i >= 0; i--) {
      elements[i].dispose();
    }
  }
}
