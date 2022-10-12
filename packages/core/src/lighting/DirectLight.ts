import { Matrix, Vector3 } from "@oasis-engine/math";
import { Shader, ShaderData } from "../shader";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Light } from "./Light";

/**
 * Directional light.
 */
export class DirectLight extends Light {
  private static _colorProperty: ShaderProperty = Shader.getPropertyByName("u_directLightColor");
  private static _directionProperty: ShaderProperty = Shader.getPropertyByName("u_directLightDirection");

  private static _combinedData = {
    color: new Float32Array(3 * Light._maxLight),
    direction: new Float32Array(3 * Light._maxLight)
  };

  /**
   * @internal
   */
  static _updateShaderData(shaderData: ShaderData): void {
    const data = DirectLight._combinedData;

    shaderData.setFloatArray(DirectLight._colorProperty, data.color);
    shaderData.setFloatArray(DirectLight._directionProperty, data.direction);
  }

  private _forward: Vector3 = new Vector3();

  private _reverseDirection: Vector3 = new Vector3();

  /**
   * Get direction.
   */
  get direction(): Vector3 {
    this.entity.transform.getWorldForward(this._forward);
    return this._forward;
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
   * @override
   */
  get _shadowProjectionMatrix(): Matrix {
    throw "Unknown!";
  }

  /**
   * @internal
   */
  _appendData(lightIndex: number): void {
    const colorStart = lightIndex * 3;
    const directionStart = lightIndex * 3;
    const lightColor = this._getLightColor();
    const direction = this.direction;

    const data = DirectLight._combinedData;

    data.color[colorStart] = lightColor.r;
    data.color[colorStart + 1] = lightColor.g;
    data.color[colorStart + 2] = lightColor.b;
    data.direction[directionStart] = direction.x;
    data.direction[directionStart + 1] = direction.y;
    data.direction[directionStart + 2] = direction.z;
  }

  /**
   * Mount to the current Scene.
   * @internal
   * @override
   */
  _onEnable(): void {
    this.engine._lightManager._attachDirectLight(this);
  }

  /**
   * Unmount from the current Scene.
   * @internal
   * @override
   */
  _onDisable(): void {
    this.engine._lightManager._detachDirectLight(this);
  }
}
