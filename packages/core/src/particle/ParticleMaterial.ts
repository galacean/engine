import { Engine } from "../Engine";
import { EffectMaterial } from "../material/EffectMaterial";
import { Shader } from "../shader/Shader";

/**
 * Particle Material.
 */
export class ParticleMaterial extends EffectMaterial {
  /**
   * Create a particle material instance.
   * @param engine - Engine to which the material belongs
   * @param shader - Shader used by the material
   */
  constructor(engine: Engine, shader: Shader = Shader.find("Effect/Particle")) {
    super(engine, shader);
  }

  /**
   * @inheritdoc
   */
  override clone(): ParticleMaterial {
    const dest = new ParticleMaterial(this._engine, this.shader);
    this._cloneToAndModifyName(dest);
    return dest;
  }
}
