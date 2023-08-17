import { ShaderPass } from "../shader/ShaderPass";
import { IPoolElement } from "./IPoolElement";
import { RenderData } from "./RenderData";

export class RenderElement implements IPoolElement {
  data: RenderData;
  shaderPasses: ReadonlyArray<ShaderPass>;

  set(data: RenderData, shaderPasses: ReadonlyArray<ShaderPass>): void {
    this.data = data;
    this.shaderPasses = shaderPasses;
  }

  dispose(): void {
    this.data = this.shaderPasses = null;
  }
}
