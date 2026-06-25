import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { BlendFactor } from "../shader/enums/BlendFactor";
import { CullMode } from "../shader/enums/CullMode";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { ShaderProperty } from "../shader/ShaderProperty";
import { getGaussianSplatShader } from "./GaussianSplatShader";

/**
 * Material for {@link GaussianSplatRenderer}. The render state is invariant — always transparent, straight-alpha
 * "over" blending with depth-write off and culling disabled — so it is baked here rather than exposed as knobs.
 */
export class GaussianSplatMaterial extends Material {
  private static _kernelSizeProp = ShaderProperty.getByName("material_KernelSize");

  /**
   * Low-pass dilation added to the projected covariance (anti-aliasing, in pixels). Default 0.3.
   */
  get kernelSize(): number {
    return this.shaderData.getFloat(GaussianSplatMaterial._kernelSizeProp);
  }

  set kernelSize(value: number) {
    this.shaderData.setFloat(GaussianSplatMaterial._kernelSizeProp, value);
  }

  constructor(engine: Engine) {
    super(engine, getGaussianSplatShader(engine));

    const shaderData = this.shaderData;
    shaderData.setInt("blendEnabled", 1);
    shaderData.setInt("depthWriteEnabled", 0);
    shaderData.setInt("renderQueueType", RenderQueueType.Transparent);
    shaderData.setInt("sourceColorBlendFactor", BlendFactor.SourceAlpha);
    shaderData.setInt("destinationColorBlendFactor", BlendFactor.OneMinusSourceAlpha);
    shaderData.setInt("sourceAlphaBlendFactor", BlendFactor.One);
    shaderData.setInt("destinationAlphaBlendFactor", BlendFactor.OneMinusSourceAlpha);
    shaderData.setInt("rasterStateCullMode", CullMode.Off);

    this.kernelSize = 0.3;
  }
}
