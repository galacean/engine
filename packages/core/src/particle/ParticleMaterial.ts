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
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("particle-shader"));
  }

  /**
   * @inheritdoc
   */
  override clone(): ParticleMaterial {
    const dest = new ParticleMaterial(this._engine);
    this._cloneToAndModifyName(dest);
    return dest;
  }
}
