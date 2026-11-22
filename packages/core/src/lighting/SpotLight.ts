import { Vector3 } from "@galacean/engine-math";
import { ShaderData } from "../shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Light } from "./Light";
import { ignoreClone } from "../clone/CloneDecorators";

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
  private static readonly _minDistance = 1e-4;

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

  private _distance: number = 100;
  /** Angle, in radians, from centre of spotlight where falloff begins. */
  angle: number = Math.PI / 6;
  /** Angle, in radians, from falloff begins to ends. */
  penumbra: number = Math.PI / 12;

  @ignoreClone
  private _inverseDirection: Vector3 = new Vector3();

  /**
   * Defines a distance cutoff at which the light's intensity reaches zero.
   * @remarks Set to `Infinity` for unlimited range (pure inverse-square falloff). Values `<= 0` are clamped to a minimal positive cutoff.
   * @defaultValue `100`
   */
  get distance(): number {
    return this._distance;
  }

  set distance(value: number) {
    if (!Number.isNaN(value)) {
      this._distance = Math.max(value, SpotLight._minDistance);
    }
  }

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
    const { color, position, direction } = this;

    const cullingMask = this.cullingMask;
    data.cullingMask[cullingMaskStart] = cullingMask & 65535;
    data.cullingMask[cullingMaskStart + 1] = (cullingMask >>> 16) & 65535;

    data.color[colorStart] = color.r;
    data.color[colorStart + 1] = color.g;
    data.color[colorStart + 2] = color.b;

    data.position[positionStart] = position.x;
    data.position[positionStart + 1] = position.y;
    data.position[positionStart + 2] = position.z;
    data.direction[directionStart] = direction.x;
    data.direction[directionStart + 1] = direction.y;
    data.direction[directionStart + 2] = direction.z;

    // GPU convention: cutoffDistance <= 0.0 represents unlimited range (Infinity or > FP32 max).
    data.distance[distanceStart] = Number.isFinite(Math.fround(this._distance)) ? this._distance : 0.0;
    data.angleCos[angleCosStart] = Math.cos(this.angle);
    data.penumbraCos[penumbraCosStart] = Math.cos(this.angle + this.penumbra);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this.scene!._lightManager._attachSpotLight(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene!._lightManager._detachSpotLight(this);
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
  // Defines a distance cutoff at which the light's intensity must be considered zero (0 represents unlimited range).
  distance: Float32Array;
  // Angle, in radians, from centre of spotlight where falloff begins.
  angleCos: Float32Array;
  // Angle, in radians, from falloff begins to ends.
  penumbraCos: Float32Array;
}
