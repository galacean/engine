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
  private static _decayProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightDecay");
  private static _angleProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightAngle");
  private static _penumbraProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightPenumbra");
  private static _penumbraCosProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightPenumbraCos");
  private static _coneCosProperty: ShaderProperty = Shader.getPropertyByName("u_spotLightConeCos");

  private static _combinedData = {
    color: new Float32Array(3 * Light._maxLight),
    position: new Float32Array(3 * Light._maxLight),
    direction: new Float32Array(3 * Light._maxLight),
    distance: new Float32Array(Light._maxLight),
    decay: new Float32Array(Light._maxLight),
    angle: new Float32Array(Light._maxLight),
    penumbra: new Float32Array(Light._maxLight),
    penumbraCos: new Float32Array(Light._maxLight),
    coneCos: new Float32Array(Light._maxLight)
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
    shaderData.setFloatArray(SpotLight._decayProperty, data.decay);
    shaderData.setFloatArray(SpotLight._angleProperty, data.angle);
    shaderData.setFloatArray(SpotLight._penumbraProperty, data.penumbra);
    shaderData.setFloatArray(SpotLight._penumbraCosProperty, data.penumbraCos);
    shaderData.setFloatArray(SpotLight._coneCosProperty, data.coneCos);
  }

  color: Color = new Color(1, 1, 1, 1);
  penumbra: number = 0.2;
  distance: number = 100;
  intensity: number = 1.0;
  decay: number = 0;
  angle: number = Math.PI / 6;

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
    const decayStart = lightIndex;
    const angleStart = lightIndex;
    const penumbraStart = lightIndex;
    const penumbraCosStart = lightIndex;
    const coneCosStart = lightIndex;

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
    data.decay[decayStart] = this.decay;
    data.angle[angleStart] = this.angle;
    data.penumbra[penumbraStart] = this.penumbra;
    data.penumbraCos[penumbraCosStart] = Math.cos(this.angle * (1 - this.penumbra));
    data.coneCos[coneCosStart] = Math.cos(this.angle);
  }
}
