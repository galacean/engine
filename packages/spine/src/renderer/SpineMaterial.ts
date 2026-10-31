import { Engine, Material, Shader } from "@galacean/engine";

/**
 * Material for Spine rendering. Defaults to the built-in `2D/Spine` shader.
 * Texture and blend inputs are supplied per draw batch; tint is a renderer input.
 * Inputs use straight alpha; the shader premultiplies its final linear output for the supplied blend factors.
 */
export class SpineMaterial extends Material {
  constructor(engine: Engine, shader: Shader = Shader.find("2D/Spine")) {
    super(engine, shader);
  }

  override clone(): SpineMaterial {
    const dest = new SpineMaterial(this.engine, this.shader);
    this._cloneToAndModifyName(dest);
    return dest;
  }
}
