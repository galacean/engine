import { RenderData2D } from "../2d/data/RenderData2D";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { IPoolElement } from "./IPoolElement";
import { RenderElement } from "./RenderElement";

export class SpriteMaskElement extends RenderElement implements IPoolElement {
  renderData: RenderData2D;
  isAdd: boolean = true;

  constructor() {
    super();
    this.multiRenderData = false;
  }

  setValue(component: Renderer, renderData: RenderData2D, material: Material): void {
    this.component = component;
    this.renderData = renderData;
    this.material = material;
  }

  dispose() {
    this.component = this.renderData = this.material = null;
  }
}
