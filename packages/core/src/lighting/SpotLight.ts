import { Color, Matrix, Vector3 } from "@galacean/engine-math";
import { ShaderData } from "../shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Light } from "./Light";

/**
 * Spot light.
 */
export class SpotLight extends Light {
  private static _cullingMaskProperty: ShaderProperty = ShaderProperty.getByName("scene_SpotLightCullingMask");
  private static _colorProperty: ShaderProperty = ShaderProperty.getByName("scene_SpotLightColor");
  private static _positionProperty: ShaderProperty = ShaderProperty.getByName("scene_SpotLightPosition");
  private static _directionProperty: ShaderProperty = ShaderProperty.getByName("scene_SpotLightDirection");
  private static _distanceProperty: ShaderProperty = ShaderProperty.getByName("scene_SpotLightDistance");
  private static _angleCosProperty: ShaderProperty = ShaderProperty.getByName("scene_SpotLightAngleCos");
  private static _penumbraCosProperty: ShaderProperty = ShaderProperty.getByName("scene_SpotLightPenumbraCos");

  /**
   * @internal
   */
  static _updateShaderData(shaderData: ShaderData, data: ISpotLightShaderData): void {
    shaderData.setIntArray(SpotLight._cullingMaskProperty, data.cullingMask);
    shaderData.setFloatArray(SpotLight._colorProperty, data.color);
    shaderData.setFloatArray(SpotLight._positionProperty, data.position);
    shaderData.setFloatArray(SpotLight._directionProperty, data.direction);
    shaderData.setFloatArray(SpotLight._distanceProperty, data.distance);
    shaderData.setFloatArray(SpotLight._angleCosProperty, data.angleCos);
    shaderData.setFloatArray(SpotLight._penumbraCosProperty, data.penumbraCos);
  }

  /** Defines a distance cutoff at which the light's intensity must be considered zero. */
  distance: number = 100;
  /** Angle, in radians, from centre of spotlight where falloff begins. */
  angle: number = Math.PI / 6;
  /** Angle, in radians, from falloff begins to ends. */
  penumbra: number = Math.PI / 12;

  private _inverseDirection: Vector3 = new Vector3();
  private _projectMatrix: Matrix = new Matrix();

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
    return this.entity.transform.worldForward;
  }

  /**
   * Get the opposite direction of the spotlight.
   */
  get reverseDirection(): Vector3 {
    Vector3.scale(this.direction, -1, this._inverseDirection);
    return this._inverseDirection;
  }

  /**
   * @internal
   */
  _appendData(lightIndex: number, data: ISpotLightShaderData): void {
    const cullingMaskStart = lightIndex * 2;
    const colorStart = lightIndex * 3;
    const positionStart = lightIndex * 3;
    const directionStart = lightIndex * 3;
    const distanceStart = lightIndex;
    const penumbraCosStart = lightIndex;
    const angleCosStart = lightIndex;

    const lightColor = this._getLightIntensityColor();
    const position = this.position;
    const direction = this.direction;

    const cullingMask = this.cullingMask;
    data.cullingMask[cullingMaskStart] = cullingMask & 65535;
    data.cullingMask[cullingMaskStart + 1] = (cullingMask >>> 16) & 65535;

    data.color[colorStart] = Color.sRGBToLinearSpace(lightColor.r);
    data.color[colorStart + 1] = Color.sRGBToLinearSpace(lightColor.g);
    data.color[colorStart + 2] = Color.sRGBToLinearSpace(lightColor.b);

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

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this.scene._lightManager._attachSpotLight(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene._lightManager._detachSpotLight(this);
  }
}

/**
 * Shader properties data of spot lights in the scene.
 */
export interface ISpotLightShaderData {
  // Culling mask - which layers the light affect.
  cullingMask: Int32Array;
  // Light Color.
  color: Float32Array;
  // Light position.
  position: Float32Array;
  // Light direction
  direction: Float32Array;
  // Defines a distance cutoff at which the light's intensity must be considered zero.
  distance: Float32Array;
  // Angle, in radians, from centre of spotlight where falloff begins.
  angleCos: Float32Array;
  // Angle, in radians, from falloff begins to ends.
  penumbraCos: Float32Array;
}
