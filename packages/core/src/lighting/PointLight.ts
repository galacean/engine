import { Vector3 } from "@galacean/engine-math";
import { ShaderData } from "../shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Light } from "./Light";

/**
 * Point light.
 */
export class PointLight extends Light {
  private static _cullingMaskProperty: ShaderProperty = ShaderProperty.getByName("scene_PointLightCullingMask");
  private static _colorProperty: ShaderProperty = ShaderProperty.getByName("scene_PointLightColor");
  private static _positionProperty: ShaderProperty = ShaderProperty.getByName("scene_PointLightPosition");
  private static _distanceProperty: ShaderProperty = ShaderProperty.getByName("scene_PointLightDistance");

  /**
   * @internal
   */
  static _updateShaderData(shaderData: ShaderData, data: IPointLightShaderData): void {
    shaderData.setIntArray(PointLight._cullingMaskProperty, data.cullingMask);
    shaderData.setFloatArray(PointLight._colorProperty, data.color);
    shaderData.setFloatArray(PointLight._positionProperty, data.position);
    shaderData.setFloatArray(PointLight._distanceProperty, data.distance);
  }

  /** Defines a distance cutoff at which the light's intensity must be considered zero. */
  distance: number = 100;

  /**
   * Get light position.
   */
  get position(): Vector3 {
    return this.entity.transform.worldPosition;
  }

  /**
   * @internal
   */
  _appendData(lightIndex: number, data: IPointLightShaderData): void {
    const cullingMaskStart = lightIndex * 2;
    const colorStart = lightIndex * 3;
    const positionStart = lightIndex * 3;
    const distanceStart = lightIndex;
    const { color, position } = this;

    const cullingMask = this.cullingMask;
    data.cullingMask[cullingMaskStart] = cullingMask & 65535;
    data.cullingMask[cullingMaskStart + 1] = (cullingMask >>> 16) & 65535;

    data.color[colorStart] = color.r;
    data.color[colorStart + 1] = color.g;
    data.color[colorStart + 2] = color.b;

    data.position[positionStart] = position.x;
    data.position[positionStart + 1] = position.y;
    data.position[positionStart + 2] = position.z;
    data.distance[distanceStart] = this.distance;
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this.scene._lightManager._attachPointLight(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene._lightManager._detachPointLight(this);
  }
}

/**
 * Shader properties data of point lights in the scene.
 */
export interface IPointLightShaderData {
  // Culling mask - which layers the light affect.
  cullingMask: Int32Array;
  // Light color.
  color: Float32Array;
  // Light position.
  position: Float32Array;
  // Defines a distance cutoff at which the light's intensity must be considered zero.
  distance: Float32Array;
}
