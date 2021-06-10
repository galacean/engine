import { Color, Vector3 } from "@oasis-engine/math";
import { Shader } from "../shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Light } from "./Light";

/**
 * Spot light.
 */
export class SpotLight extends Light {
  private static _colorProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightColor");
  private static _positionProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightPosition");
  private static _directionProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightDirection");
  private static _distanceProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightDistance");
  private static _angleCosProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightAngleCos");
  private static _penumbraCosProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightPenumbraCos");

  private static _combinedData = {
    color: new Float32Array(3 * Light._maxLight),
    position: new Float32Array(3 * Light._maxLight),
    direction: new Float32Array(3 * Light._maxLight),
    distance: new Float32Array(Light._maxLight),
    angleCos: new Float32Array(Light._maxLight),
    penumbraCos: new Float32Array(Light._maxLight)
  };

  /**
   * @internal
   */
  static _updateShaderData(shaderData: ShaderData): void {
    const data = SpotLight._combinedData;

    shaderData.setFloatArray(SpotLight._colorProperty, data.color);
    shaderData.setFloatArray(SpotLight._positionProperty, data.position);
    shaderData.setFloatArray(SpotLight._directionProperty, data.direction);
    shaderData.setFloatArray(SpotLight._distanceProperty, data.distance);
    shaderData.setFloatArray(SpotLight._angleCosProperty, data.angleCos);
    shaderData.setFloatArray(SpotLight._penumbraCosProperty, data.penumbraCos);
  }

  /** Light color. */
  color: Color = new Color(1, 1, 1, 1);
  /** Light intensity. */
  intensity: number = 1.0;
  /** Defines a distance cutoff at which the light's intensity must be considered zero. */
  distance: number = 100;
  /** Angle, in radians, from centre of spotlight where falloff begins. */
  angle: number = Math.PI / 6;
  /** Angle, in radians, from falloff begins to ends. */
  penumbra: number = Math.PI / 12;

  private _forward: Vector3 = new Vector3();
  private _lightColor: Color = new Color(1, 1, 1, 1);
  private _inverseDirection: Vector3 = new Vector3();

  /**
   * Get light position.
   */
  get position(): Vector3 {
    return this.entity.transform.worldPosition;
  }

  /**
   * Get light direction.
   */
  get direction(): Vector3 {
    this.entity.transform.getWorldForward(this._forward);
    return this._forward;
  }

  /**
   * Get the opposite direction of the spotlight.
   */
  get reverseDirection(): Vector3 {
    Vector3.scale(this.direction, -1, this._inverseDirection);
    return this._inverseDirection;
  }

  /**
   * Get the final light color.
   */
  get lightColor(): Color {
    this._lightColor.r = this.color.r * this.intensity;
    this._lightColor.g = this.color.g * this.intensity;
    this._lightColor.b = this.color.b * this.intensity;
    this._lightColor.a = this.color.a * this.intensity;
    return this._lightColor;
  }

  /**
   * @internal
   */
  _appendData(lightIndex: number): void {
    const colorStart = lightIndex * 3;
    const positionStart = lightIndex * 3;
    const directionStart = lightIndex * 3;
    const distanceStart = lightIndex;
    const penumbraCosStart = lightIndex;
    const angleCosStart = lightIndex;

    const color = this.lightColor;
    const position = this.position;
    const direction = this.direction;

    const data = SpotLight._combinedData;

    data.color[colorStart] = color.r;
    data.color[colorStart + 1] = color.g;
    data.color[colorStart + 2] = color.b;
    data.position[positionStart] = position.x;
    data.position[positionStart + 1] = position.y;
    data.position[positionStart + 2] = position.z;
    data.direction[directionStart] = direction.x;
    data.direction[directionStart + 1] = direction.y;
    data.direction[directionStart + 2] = direction.z;
    data.distance[distanceStart] = this.distance;
    data.angleCos[angleCosStart] = Math.cos(this.angle);
    data.penumbraCos[penumbraCosStart] = Math.cos(this.angle + this.penumbra);
  }
}
