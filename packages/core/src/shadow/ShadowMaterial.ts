import { Engine } from "../Engine";
import { RenderQueueType } from "../material";
import { Material } from "../material/Material";
import { BlendFactor } from "../shader/enums/BlendFactor";
import { CompareFunction } from "../shader/enums/CompareFunction";
import { Shader } from "../shader/Shader";

/**
 * Shadow material.
 */
export class ShadowMaterial extends Material {
  constructor(engine: Engine) {
    super(engine, Shader.find("shadow"));

    const targetBlendState = this.renderState.blendState.targetBlendState;
    targetBlendState.enabled = true;
    targetBlendState.sourceColorBlendFactor = targetBlendState.sourceAlphaBlendFactor = BlendFactor.DestinationColor;
    targetBlendState.destinationColorBlendFactor = targetBlendState.destinationAlphaBlendFactor = BlendFactor.Zero;
    this.renderState.depthState.compareFunction = CompareFunction.LessEqual;

    this.renderQueueType = RenderQueueType.Transparent;
  }
}
