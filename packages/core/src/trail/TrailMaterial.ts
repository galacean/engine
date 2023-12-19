import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { BlendFactor } from "../shader";

export class TrailMaterial extends Material {
  constructor(engine: Engine) {
    super(engine, engine.shaderPool.find("trail"));

    const target = this.renderState.blendState.targetBlendState;
    target.enabled = true;
    target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.One;

    this.renderState.depthState.writeEnabled = false;
  }
}
