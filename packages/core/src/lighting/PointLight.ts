import { Color, Vector3 } from "@oasis-engine/math";
import { Shader } from "../shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Light } from "./Light";

/**
 * Point light.
 */
export class PointLight extends Light {
  private static _colorProperty: ShaderProperty = Shader.getPropertyByName("u_pointLightColor");
  private static _positionProperty: ShaderProperty = Shader.getPropertyByName("u_pointLightPosition");
  private static _distanceProperty: ShaderProperty = Shader.getPropertyByName("u_pointLightDistance");
  private static _decayProperty: ShaderProperty = Shader.getPropertyByName("u_pointLightDecay");

  private static _combinedData = {
    color: new Float32Array(3 * Light._maxLight),
    position: new Float32Array(3 * Light._maxLight),
    distance: new Float32Array(Light._maxLight),
    decay: new Float32Array(Light._maxLight)
  };

  /**
   * @internal
   */
  static _updateShaderData(shaderData: ShaderData): void {
    const data = PointLight._combinedData;

    shaderData.setFloatArray(PointLight._colorProperty, data.color);
    shaderData.setFloatArray(PointLight._positionProperty, data.position);
    shaderData.setFloatArray(PointLight._distanceProperty, data.distance);
    shaderData.setFloatArray(PointLight._decayProperty, data.decay);
  }

  color: Color = new Color(1, 1, 1, 1);
  intensity: number = 1.0;
  distance: number = 100;
  decay: number = 0;

  private _lightColor: Color = new Color(1, 1, 1, 1);

  /**
   * Get light position.
   * @readonly
   */
  get position(): Vector3 {
    return this.entity.transform.worldPosition;
  }

  /**
   * Get the final light color.
   * @readonly
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
    const distanceStart = lightIndex;
    const decayStart = lightIndex;

    const lightColor = this.lightColor;
    const lightPosition = this.position;

    const data = PointLight._combinedData;

    data.color[colorStart] = lightColor.r;
    data.color[colorStart + 1] = lightColor.g;
    data.color[colorStart + 2] = lightColor.b;
    data.position[positionStart] = lightPosition.x;
    data.position[positionStart + 1] = lightPosition.y;
    data.position[positionStart + 2] = lightPosition.z;
    data.distance[distanceStart] = this.distance;
    data.decay[decayStart] = this.decay;
  }
}
