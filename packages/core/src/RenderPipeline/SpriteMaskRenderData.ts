import { VertexData2D } from "../2d/data/VertexData2D";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { RenderData } from "./RenderData";

export class SpriteMaskRenderData extends RenderData {
  isAdd: boolean = true;
  renderData: VertexData2D;

  constructor() {
    super();
    this.multiRenderData = false;
  }

  setValue(component: Renderer, material: Material, renderData: VertexData2D): void {
    this.component = component;
    this.material = material;

    this.renderData = renderData;
  }
}
