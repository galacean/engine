import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { CompareFunction } from "../shader/enums/CompareFunction";
import { CullMode } from "../shader/enums/CullMode";
import { Shader } from "../shader/Shader";
import { TextureCubeMap } from "../texture";

/**
 * HDRSkyBoxMaterial, use cube map with HDR(RGBE) format.
 */
export class HDRSkyBoxMaterial extends Material {
  constructor(engine: Engine) {
    super(engine, Shader.find("HDR-skybox"));

    this.renderState.rasterState.cullMode = CullMode.Off;
    this.renderState.depthState.compareFunction = CompareFunction.LessEqual;
  }

  /** TextureCubeMap with HDR(RGBE) format */
  get texture(): TextureCubeMap {
    return this.shaderData.getTexture("u_cube") as TextureCubeMap;
  }

  set texture(v: TextureCubeMap) {
    this.shaderData.setTexture("u_cube", v);
  }
}
