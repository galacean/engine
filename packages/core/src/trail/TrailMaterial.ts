import { Engine } from "../Engine";
import { EffectMaterial } from "../material/EffectMaterial";
import { Shader } from "../shader";

/**
 * Trail material.
 */
export class TrailMaterial extends EffectMaterial {
  /**
   * Create a trail material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("Effect/Trail"));
  }

  /**
   * @inheritdoc
   */
  override clone(): TrailMaterial {
    const dest = new TrailMaterial(this._engine);
    this._cloneToAndModifyName(dest);
    return dest;
  }
}
