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
    this.component = this.material = this.renderState = this.shaderPass = null;
    this.charElements.length = 0;
  }
}
