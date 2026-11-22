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
  private static readonly _minDistance = 1e-4;

  /**
   * @internal
   */
  static _updateShaderData(shaderData: ShaderData, data: IPointLightShaderData): void {
    shaderData.setIntArray(PointLight._cullingMaskProperty, data.cullingMask);
    shaderData.setFloatArray(PointLight._colorProperty, data.color);
    shaderData.setFloatArray(PointLight._positionProperty, data.position);
    shaderData.setFloatArray(PointLight._distanceProperty, data.distance);
  }

  private _distance: number = 100;

  /**
   * Defines a distance cutoff at which the light's intensity reaches zero.
   * @remarks Set to `Infinity` for unlimited range (pure inverse-square falloff). Values `<= 0` are clamped to a minimal positive cutoff.
   * @defaultValue `100`
   */
  get distance(): number {
    return this._distance;
  }

  set distance(value: number) {
    if (Number.isNaN(value)) {
      return;
    }
    this._distance = Math.max(value, PointLight._minDistance);
  }

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

    const distance = this._distance;
    // GPU convention: cutoffDistance <= 0.0 represents unlimited range (distance === Infinity).
    data.distance[distanceStart] = Number.isFinite(distance) ? distance : 0.0;
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this.scene!._lightManager._attachPointLight(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene!._lightManager._detachPointLight(this);
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
  // Defines a distance cutoff at which the light's intensity must be considered zero (0 represents unlimited range).
  distance: Float32Array;
}
