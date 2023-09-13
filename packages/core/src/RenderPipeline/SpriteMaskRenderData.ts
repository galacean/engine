import { VertexData2D } from "../2d/data/VertexData2D";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { IPoolElement } from "./IPoolElement";
import { RenderData } from "./RenderData";

export class SpriteMaskRenderData extends RenderData implements IPoolElement {
  isAdd: boolean = true;
  verticesData: VertexData2D;

  constructor() {
    super();
    this.multiRenderData = false;
  }

  set(component: Renderer, material: Material, verticesData: VertexData2D): void {
    this.component = component;
    this.material = material;
    this.verticesData = verticesData;
  }

  override dispose(): void {
    this.component = this.material = this.verticesData = null;
  }
}
