import { ShaderPass } from "../shader/ShaderPass";
import { RenderState } from "../shader/state/RenderState";
import { RenderData } from "./RenderData";

export class RenderElement {
  data: RenderData;
  shaderPass: ShaderPass;
  renderState: RenderState;

  set(data: RenderData, shaderPass: ShaderPass, renderState: RenderState): void {
    this.data = data;
    this.shaderPass = shaderPass;
    this.renderState = renderState;
  }
}
