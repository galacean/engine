import { Engine } from "../Engine";
import { Material } from "../material";
import { Shader } from "../shader";

/**
 * Shadow Map material.
 */
export class ShadowMapMaterial extends Material {
  constructor(engine: Engine) {
    super(engine, Shader.find("shadow-map"));
  }
}
