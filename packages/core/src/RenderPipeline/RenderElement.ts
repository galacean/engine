import { StencilOperation } from "../shader";
import { ShaderPass } from "../shader/ShaderPass";
import { IPoolElement } from "../utils/ObjectPool";
import { RenderData } from "./RenderData";

export class RenderElement implements IPoolElement {
  data: RenderData;
  shaderPasses: ReadonlyArray<ShaderPass>;
  stencilOperation: StencilOperation;

  set(data: RenderData, shaderPasses: ReadonlyArray<ShaderPass>): void {
    this.data = data;
    this.shaderPasses = shaderPasses;
  }

  dispose(): void {
    this.data = this.shaderPasses = null;
  }
}
