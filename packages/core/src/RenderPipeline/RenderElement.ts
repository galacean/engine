import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { ShaderPass } from "../shader";
import { RenderState } from "../shader/state/RenderState";

export class RenderElement {
  component: Renderer;
  material: Material;
  multiRenderData: boolean;
  renderState: RenderState;
  shaderPass: ShaderPass;
}
