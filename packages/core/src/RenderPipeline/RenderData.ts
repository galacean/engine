import { Material } from "../material";
import { Renderer } from "../Renderer";

export class RenderData {
  component: Renderer;
  material: Material;

  multiRenderData: boolean;
}
