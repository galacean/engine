import { Entity } from "../Entity";
import { Shader } from "../shader";
import { Fog } from "./Fog";

/**
 * Exponential fog.
 */
export class EXP2Fog extends Fog {
  private static _densityProperty = Shader.getPropertyByName("u_fogDensity");

  /**
   * Density of fog.
   */
  get density(): number {
    return this._density;
  }

  set density(value: number) {
    this._density = value;
    this.scene.shaderData.setFloat(EXP2Fog._densityProperty, value);
  }

  private _density: number = 0.0025;

  constructor(entity: Entity) {
    super(entity);
    this.density = this._density;
  }
  /**
   * @internal
   * @override
   */
  _onEnable() {
    this.scene.shaderData.enableMacro("O3_FOG_EXP2");
  }

  /**
   * @internal
   * @override
   */
  _onDisable() {
    this.scene.shaderData.disableMacro("O3_FOG_EXP2");
  }
}
