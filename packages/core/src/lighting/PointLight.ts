import { Vector3 } from "@alipay/o3-math";
import { DataType } from "../base/Constant";
import { Light } from "./Light";

/**
 * 点光源创建类
 * @extends Light
 */
export class PointLight extends Light {
  public color: Vector3 = new Vector3(1, 1, 1);
  public intensity: number = 1.0;
  public distance: number = 0;
  public decay: number = 0;
  private _lightColor: Vector3 = new Vector3();

  /** 获取点光源位置
   * @return {Vector3} 位置坐标
   * @readonly
   */
  get position(): Vector3 {
    return this.entity.worldPosition;
  }

  /** 获取点光源最终颜色
   * @return {Vector3} 光源最终颜色
   * @readonly
   */
  get lightColor(): Vector3 {
    Vector3.scale(this.color, this.intensity, this._lightColor);
    return this._lightColor;
  }

  /**
   * 生成 Technique 所需的 uniform 定义
   * @param {string} uniformName
   */
  static getUniformDefine(uniformName) {
    /**
      struct PointLight {
        vec3 position;
        vec3 color;
        float intensity;
        float distance;
        float decay;
      };
     */
    const uniforms = {};

    uniforms[uniformName + ".position"] = {
      name: uniformName + ".position",
      type: DataType.FLOAT_VEC3
    };

    uniforms[uniformName + ".color"] = {
      name: uniformName + ".color",
      type: DataType.FLOAT_VEC3
    };

    uniforms[uniformName + ".lightColor"] = {
      name: uniformName + ".lightColor",
      type: DataType.FLOAT_VEC3
    };

    uniforms[uniformName + ".intensity"] = {
      name: uniformName + ".intensity",
      type: DataType.FLOAT
    };

    uniforms[uniformName + ".distance"] = {
      name: uniformName + ".distance",
      type: DataType.FLOAT
    };

    uniforms[uniformName + ".decay"] = {
      name: uniformName + ".decay",
      type: DataType.FLOAT
    };

    return uniforms;
  }

  /**
   * 将灯光参数值提交到材质对象
   */
  bindMaterialValues(mtl, uniformName) {
    mtl.setValue(uniformName + ".position", this.position);
    mtl.setValue(uniformName + ".color", this.color);
    mtl.setValue(uniformName + ".lightColor", this.lightColor);
    mtl.setValue(uniformName + ".intensity", this.intensity);
    mtl.setValue(uniformName + ".distance", this.distance);
    mtl.setValue(uniformName + ".decay", this.decay);
  }
}
