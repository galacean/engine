import { Material } from "../material/Material";
import { Renderer } from "../Renderer";

export class RenderElement {
  component: Renderer;
  material: Material;
  multiRenderData: boolean;
}
