import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { CompareFunction } from "../shader/enums/CompareFunction";
import { CullMode } from "../shader/enums/CullMode";
import { Shader } from "../shader/Shader";
import { TextureCubeMap } from "../texture";

/**
 * SkyboxMaterial
 */
export class SkyBoxMaterial extends Material {
  constructor(engine: Engine) {
    super(engine, Shader.find("skybox"));

    this.renderState.rasterState.cullMode = CullMode.Off;
    this.renderState.depthState.compareFunction = CompareFunction.LessEqual;
    this.renderQueueType = 0;
  }

  /** Texture cube map of the sky box material. */
  get textureCubeMap(): TextureCubeMap {
    return this.shaderData.getTexture("u_cube") as TextureCubeMap;
  }

  set textureCubeMap(v: TextureCubeMap) {
    this.shaderData.setTexture("u_cube", v);
  }
}
