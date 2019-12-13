import { vec3 } from "@alipay/o3-math";
import { ALight } from "./ALight";
import { DataType } from "@alipay/o3-base";

/**
 * 环境光创建类
 * @extends ALight
 */
export class AAmbientLight extends ALight {
  private _lightColor;
  public color;
  public intensity;

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
      [uniformName + ".intensity"]: {
        name: uniformName + ".intensity",
        type: DataType.FLOAT
      }
    };
  }

  /**
   * @constructor
   * @param {Node} node 节点对象
   * @param {Object} props 参数对象
   * @param {string} [props.name = ambientLight] props.name 名称
   * @param {Vec3} [props.color = vec3.fromValues(1, 1, 1)] 颜色
   * @param {number} [props.intensity = 1] 光照强度
   */
  constructor(node, props) {
    super(node);
    this.name = props.name || "ambientLight";

    /**
     * 颜色
     * @member {Vec3}
     */
    this.color = props.color || vec3.fromValues(1, 1, 1);

    /**
     * 光照强度
     * @member {number}
     */
    this.intensity = props.intensity || 1.0;

    this._lightColor = vec3.create();
  }

  /** 获取环境光最终颜色
   * @return {vec3} 颜色
   * @readonly
   */
  get lightColor() {
    vec3.scale(this._lightColor, this.color, this.intensity);
    return this._lightColor;
  }

  /**
   * 将灯光参数值提交到材质对象
   */
  bindMaterialValues(mtl, uniformName) {
    mtl.setValue(uniformName + ".color", this.color);
    mtl.setValue(uniformName + ".intensity", this.intensity);
  }
}
