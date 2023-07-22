import { ShaderPass } from "../shader/ShaderPass";
import { RenderData } from "./RenderData";

export class RenderElement {
  data: RenderData;
  shaderPasses: ReadonlyArray<ShaderPass>;

  set(data: RenderData, shaderPasses: ReadonlyArray<ShaderPass>): void {
    this.data = data;
    this.shaderPasses = shaderPasses;
  }
}
