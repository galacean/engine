import { Vector3 } from "@alipay/o3-math";
import { Light } from "./Light";
import { DataType } from "@alipay/o3-core";

/**
 * 环境光创建类
 * @extends Light
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
   * @constructor
   * @param {Entity} entity 节点对象
   * @param {Object} props 参数对象
   * @param {string} [props.name = ambientLight] props.name 名称
   * @param {Vector3} [props.color = vec3.fromValues(1, 1, 1)] 颜色
   * @param {number} [props.intensity = 1] 光照强度
   */
  constructor(entity, props) {
    super(entity);
    this.name = props.name || "ambientLight";

    /**
     * 颜色
     * @member {Vector3}
     */
    this.color = props.color || new Vector3(1, 1, 1);

    /**
     * 光照强度
     * @member {number}
     */
    this.intensity = props.intensity || 1.0;

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
