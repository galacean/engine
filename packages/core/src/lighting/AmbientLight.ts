import { Color } from "@oasis-engine/math";
import { Entity } from "../Entity";
import { Shader } from "../shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Light } from "./Light";

/**
 * Ambient light.
 */
export class AmbientLight extends Light {
  private static _colorProperty: ShaderProperty = Shader.getPropertyByName("u_ambientLightColor");

  /**
   * Ambient light color.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    this._color = value;
    this.scene.shaderData.setColor(AmbientLight._colorProperty, this.lightColor);
  }

  /**
   * Ambient light intensity.
   */
  get intensity(): number {
    return this._intensity;
  }

  set intensity(value: number) {
    this._intensity = value;
    this.scene.shaderData.setColor(AmbientLight._colorProperty, this.lightColor);
  }

  /**
   * Get the final light color.
   * @readonly
   */
  get lightColor(): Color {
    this._lightColor.r = this._color.r * this._intensity;
    this._lightColor.g = this._color.g * this._intensity;
    this._lightColor.b = this._color.b * this._intensity;
    this._lightColor.a = this._color.a * this._intensity;
    return this._lightColor;
  }

  private _color: Color = new Color(1, 1, 1, 1);
  private _intensity: number = 1;
  private _lightColor: Color = new Color(1, 1, 1, 1);

  constructor(entity: Entity) {
    super(entity);
    this.color = this._color;
  }
}
