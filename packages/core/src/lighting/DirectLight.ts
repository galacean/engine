import { Color, Matrix, Vector3 } from "@galacean/engine-math";
import { ColorSpace } from "../enums/ColorSpace";
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

  private static _combinedData = {
    cullingMask: new Int32Array(Light._maxLight * 2),
    color: new Float32Array(Light._maxLight * 3),
    direction: new Float32Array(Light._maxLight * 3)
  };

  /**
   * @internal
   */
  static _updateShaderData(shaderData: ShaderData): void {
    const data = DirectLight._combinedData;

    shaderData.setIntArray(DirectLight._cullingMaskProperty, data.cullingMask);
    shaderData.setFloatArray(DirectLight._colorProperty, data.color);
    shaderData.setFloatArray(DirectLight._directionProperty, data.direction);
  }

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
  override get _shadowProjectionMatrix(): Matrix {
    throw "Unknown!";
  }

  /**
   * @internal
   */
  _appendData(lightIndex: number): void {
    const cullingMaskStart = lightIndex * 2;
    const colorStart = lightIndex * 3;
    const directionStart = lightIndex * 3;
    const lightColor = this._getLightIntensityColor();
    const direction = this.direction;

    const data = DirectLight._combinedData;

    const cullingMask = this.cullingMask;
    data.cullingMask[cullingMaskStart] = cullingMask & 65535;
    data.cullingMask[cullingMaskStart + 1] = (cullingMask >>> 16) & 65535;

    if (this.engine.settings.colorSpace === ColorSpace.Linear) {
      data.color[colorStart] = Color.gammaToLinearSpace(lightColor.r);
      data.color[colorStart + 1] = Color.gammaToLinearSpace(lightColor.g);
      data.color[colorStart + 2] = Color.gammaToLinearSpace(lightColor.b);
    } else {
      data.color[colorStart] = lightColor.r;
      data.color[colorStart + 1] = lightColor.g;
      data.color[colorStart + 2] = lightColor.b;
    }
    data.direction[directionStart] = direction.x;
    data.direction[directionStart + 1] = direction.y;
    data.direction[directionStart + 2] = direction.z;
  }

  /**
   * Mount to the current Scene.
   * @internal
   */
  override _onEnable(): void {
    this.engine._lightManager._attachDirectLight(this);
  }

  /**
   * Unmount from the current Scene.
   * @internal
   */
  override _onDisable(): void {
    this.engine._lightManager._detachDirectLight(this);
  }
}
