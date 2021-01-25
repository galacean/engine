import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { Shader } from "../shader/Shader";

/**
 * Shadow Map material.
 */
export class ShadowMapMaterial extends Material {
  constructor(engine: Engine) {
    super(engine, Shader.find("shadow-map"));
    this.shaderData.enableMacro("O3_GENERATE_SHADOW_MAP");
  }
}
