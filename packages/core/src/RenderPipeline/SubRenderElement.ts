import { ShaderPass, StencilOperation } from "../shader";
import { IPoolElement } from "../utils/ObjectPool";
import { RenderData } from "./RenderData";
import { SubRenderData } from "./SubRenderData";

export class SubRenderElement implements IPoolElement {
  data: RenderData;
  subData: SubRenderData;
  shaderPasses: ReadonlyArray<ShaderPass>;
  stencilOperation: StencilOperation;

  set(data: RenderData, subData: SubRenderData, shaderPasses: ReadonlyArray<ShaderPass>): void {
    this.data = data;
    this.subData = subData;
    this.shaderPasses = shaderPasses;
  }

  dispose(): void {
    this.data = null;
    this.subData = null;
    this.shaderPasses = null;
  }

  updateShaderData(): void {
    const shaderDataInfos = this.subData.shaderDataInfos;
    for (let i = 0, n = shaderDataInfos.length; i < n; ++i) {
      const shaderDataInfo = shaderDataInfos[i];
      shaderDataInfo.applyFunc(shaderDataInfo.property, shaderDataInfo.value);
    }
  }
}
