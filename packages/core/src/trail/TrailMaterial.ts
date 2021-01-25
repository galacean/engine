import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { BlendFactor, Shader } from "../shader";
import FRAG_SHADER from "./trail.fs.glsl";
import VERT_SHADER from "./trail.vs.glsl";

Shader.create("trail", VERT_SHADER, FRAG_SHADER);

export class TrailMaterial extends Material {
  constructor(engine: Engine) {
    super(engine, Shader.find("trail"));

    const target = this.renderState.blendState.targetBlendState;
    target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.One;

    this.renderState.depthState.writeEnabled = false;
  }
}
