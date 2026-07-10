import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { Shader } from "../shader/Shader";
import { ShaderProperty } from "../shader/ShaderProperty";

/**
 * Material used by {@link GaussianSplatRenderer}. Holds only the Mip-Splatting kernel-dilation sigma; splat
 * data / magic / SH state live on the renderer so one instance can be shared across many renderers.
 */
export class GaussianSplatMaterial extends Material {
  private static _kernelSizeProp = ShaderProperty.getByName("material_KernelSize");

  /**
   * Create a gaussian-splat material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("GaussianSplat"));
    this.shaderData.setFloat(GaussianSplatMaterial._kernelSizeProp, 0.3);
  }

  /**
   * @inheritdoc
   */
  override clone(): GaussianSplatMaterial {
    const dest = new GaussianSplatMaterial(this._engine);
    this._cloneToAndModifyName(dest);
    return dest;
  }
}
