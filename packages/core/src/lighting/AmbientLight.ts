import { Vector3 } from "@alipay/o3-math";
import { DataType } from "../base/Constant";
import { Light } from "./Light";

/**
 * 环境光创建类
 */
export class AmbientLight extends Light {
  private _lightColor: Vector3;
  public color: Vector3;
  public intensity: number;

  /**
   * 生成 Technique 所需的 uniform 定义
   * @param {string} uniformName
   */
  static getUniformDefine(uniformName: string) {
    return {
      [uniformName + ".color"]: {
        name: uniformName + ".color",
        type: DataType.FLOAT_VEC3
      },
      [uniformName + ".lightColor"]: {
        name: uniformName + ".lightColor",
        type: DataType.FLOAT_VEC3
      },
      [uniformName + ".intensity"]: {
        name: uniformName + ".intensity",
        type: DataType.FLOAT
      }
    };
  }

  /**
   * @param {Entity} entity 节点对象
   */
  constructor(entity) {
    super(entity);
    this.name = "ambientLight";
    this.color = new Vector3(1, 1, 1);
    this.intensity = 1.0;

    this._lightColor = new Vector3();
  }

  /** 获取环境光最终颜色
   * @return {Vector3} 颜色
   * @readonly
   */
  get lightColor() {
    Vector3.scale(this.color, this.intensity, this._lightColor);
    return this._lightColor;
  }

  /**
   * 将灯光参数值提交到材质对象
   */
  bindMaterialValues(mtl, uniformName) {
    mtl.setValue(uniformName + ".color", this.color);
    mtl.setValue(uniformName + ".lightColor", this.lightColor);
    mtl.setValue(uniformName + ".intensity", this.intensity);
  }
}
