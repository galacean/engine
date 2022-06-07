import { RenderData2D } from "../2d/data/RenderData2D";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";

export class SpriteElement {
  component: Renderer;
  renderData: RenderData2D;
  material: Material;

  setValue(component: Renderer, renderDate: RenderData2D, material: Material): void {
    this.component = component;
    this.renderData = renderDate;
    this.material = material;
  }
}
