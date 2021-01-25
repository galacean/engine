import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { CompareFunction } from "../shader/enums/CompareFunction";
import { CullMode } from "../shader/enums/CullMode";
import { Shader } from "../shader/Shader";

/**
 * SkyboxMaterial
 */
export class SkyBoxMaterial extends Material {
  constructor(engine: Engine) {
    super(engine, Shader.find("skybox"));

    this.renderState.rasterState.cullMode = CullMode.Off;
    this.renderState.depthState.compareFunction = CompareFunction.LessEqual;
  }
}
