import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { BlendFactor, Shader } from "../shader";
import FRAG_SHADER from "./trail.fs.glsl";
import VERT_SHADER from "./trail.vs.glsl";

export class TrailMaterial extends Material {
  constructor(engine: Engine) {
    if (!Shader.find("trail")) {
      Shader.create(engine, "trail", VERT_SHADER, FRAG_SHADER);
    }

    super(engine, Shader.find("trail"));

    const target = this.renderState.blendState.targetBlendState;
    target.enabled = true;
    target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.One;

    this.renderState.depthState.writeEnabled = false;
  }
}
