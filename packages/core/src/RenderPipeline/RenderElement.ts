import { ShaderPass } from "../shader/ShaderPass";
import { RenderState } from "../shader/state/RenderState";
import { IPoolElement } from "./IPoolElement";
import { RenderData } from "./RenderData";

export class RenderElement implements IPoolElement {
  data: RenderData;
  shaderPass: ShaderPass;
  renderState: RenderState;

  set(data: RenderData, shaderPass: ShaderPass, renderState: RenderState): void {
    this.data = data;
    this.shaderPass = shaderPass;
    this.renderState = renderState;
  }

  dispose(): void {
    this.data = this.shaderPass = this.renderState = null;
  }
}
