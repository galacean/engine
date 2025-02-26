import { Color, Vector3 } from "@galacean/engine-math";
import { ShaderData } from "../shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Light } from "./Light";

/**
 * Directional light.
 */
export class DirectLight extends Light {
  private static _cullingMaskProperty: ShaderProperty = ShaderProperty.getByName("scene_DirectLightCullingMask");
  private static _colorProperty: ShaderProperty = ShaderProperty.getByName("scene_DirectLightColor");
  private static _directionProperty: ShaderProperty = ShaderProperty.getByName("scene_DirectLightDirection");

  /**
   * @internal
   */
  static _updateShaderData(shaderData: ShaderData, data: IDirectLightShaderData): void {
    shaderData.setIntArray(DirectLight._cullingMaskProperty, data.cullingMask);
    shaderData.setFloatArray(DirectLight._colorProperty, data.color);
    shaderData.setFloatArray(DirectLight._directionProperty, data.direction);
  }

  /**
   * The offset distance in the opposite direction of light direction when generating shadows.
   * @remarks Increasing this value can avoid the holes in the shadow caused by low polygon models.
   */
  shadowNearPlaneOffset = 0.1;

  private _reverseDirection: Vector3 = new Vector3();

  /**
   * Get direction.
   */
  get direction(): Vector3 {
    return this.entity.transform.worldForward;
  }

  /**
   * Get the opposite direction of the directional light direction.
   */
  get reverseDirection(): Vector3 {
    Vector3.scale(this.direction, -1, this._reverseDirection);
    return this._reverseDirection;
  }

  /**
   * @internal
   */
  _appendData(lightIndex: number, data: IDirectLightShaderData): void {
    const cullingMaskStart = lightIndex * 2;
    const colorStart = lightIndex * 3;
    const directionStart = lightIndex * 3;
    const lightColor = this._getLightIntensityColor();
    const direction = this.direction;

    const cullingMask = this.cullingMask;
    data.cullingMask[cullingMaskStart] = cullingMask & 65535;
    data.cullingMask[cullingMaskStart + 1] = (cullingMask >>> 16) & 65535;

    data.color[colorStart] = Color.gammaToLinearSpace(lightColor.r);
    data.color[colorStart + 1] = Color.gammaToLinearSpace(lightColor.g);
    data.color[colorStart + 2] = Color.gammaToLinearSpace(lightColor.b);

    data.direction[directionStart] = direction.x;
    data.direction[directionStart + 1] = direction.y;
    data.direction[directionStart + 2] = direction.z;
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this.scene._lightManager._attachDirectLight(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene._lightManager._detachDirectLight(this);
  }
}

/**
 * Shader properties data of direct lights in the scene.
 */
export interface IDirectLightShaderData {
  // Culling mask - which layers the light affect.
  cullingMask: Int32Array;
  // Light color.
  color: Float32Array;
  // Light direction.
  direction: Float32Array;
}
