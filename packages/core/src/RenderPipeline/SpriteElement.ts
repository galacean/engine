import { RenderData2D } from "../2d/data/RenderData2D";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { ShaderPass } from "../shader";
import { RenderState } from "../shader/state/RenderState";
import { Texture2D } from "../texture";

export class SpriteElement {
  component: Renderer;
  renderData: RenderData2D;
  material: Material;
  texture: Texture2D;
  renderState: RenderState;
  shaderPass: ShaderPass;

  setValue(
    component: Renderer,
    renderDate: RenderData2D,
    material: Material,
    texture: Texture2D,
    renderState: RenderState,
    shaderPass: ShaderPass
  ): void {
    this.component = component;
    this.renderData = renderDate;
    this.material = material;
    this.texture = texture;
    this.renderState = renderState;
    this.shaderPass = shaderPass;
  }
}
