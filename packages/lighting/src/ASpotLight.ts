import { vec3, mat3, mat4 } from "@alipay/o3-math";
import { DataType } from "@alipay/o3-base";
import { ALight } from "./ALight";

/**
 * 聚光灯创建类
 * @extends ALight
 */
export class ASpotLight extends ALight {
  private _lightColor;
  private _inverseDirection;
  public color;
  public penumbra;
  public distance;
  public intensity;
  public decay;
  public angle;
  /**
   * @constructor
   * @param {Node} node 节点对象
   * @param {Object} props 参数对象
   * @param {string} [props.name = spotLight] 名称
   * @param {Vec3} [props.color = vec3.fromValues(1, 1, 1)] 颜色
   * @param {number} [props.intensity = 1] 光照强度
   * @param {number} [props.distance = 0] 辐射距离
   * @param {number} [props.decay = 0] 衰减系数
   * @param {number} [props.angle = Math.PI / 6] 散射角度
   * @param {number} [props.penumbra = 0] 半影衰减系数 ( 0 - 1 )
   */
  constructor(node, props) {
    super(node);
    this.name = props.name || "spotLight";

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

    /**
     * 辐射距离
     * @member {number}
     */
    this.distance = props.distance || 0;

    /**
     * 衰减系数
     * @member {number}
     */
    this.decay = props.decay || 0;

    /**
     * 半影衰减系数
     * @member {number}
     */
    this.penumbra = props.penumbra || 0;

    /**
     * 散射角(弧度)
     * @member {number}
     */
    this.angle = props.angle || Math.PI / 6;

    this._lightColor = vec3.create();
    this._inverseDirection = vec3.create();
  }

  /** 获取聚光灯位置
   * @return {vec3} 位置坐标
   * @readonly
   */
  get position() {
    return this.node.worldPosition;
  }

  /** 获取聚光灯方向
   * @return {vec3} 方向向量
   * @readonly
   */
  get direction() {
    return this.node.getForward();
  }

  /** 获取聚光灯方向的反方向
   * @return {vec3} 方向向量
   * @readonly
   */
  get reverseDirection() {
    vec3.scale(this._inverseDirection, this.direction, -1);
    return this._inverseDirection;
  }

  /** 最终光照颜色
   * @return {vec3} 最终光照颜色
   * @readonly
   */
  get lightColor() {
    vec3.scale(this._lightColor, this.color, this.intensity);
    return this._lightColor;
  }

  /**
   * 生成 Technique 所需的 uniform 定义
   * @param {string} uniformName
   */
  static getUniformDefine(uniformName) {
    /**
      struct SpotLight {
        vec3 position;
        vec3 direction;
        vec3 color;
        float intensity;
        float distance;
        float decay;
        float angle;
        float penumbra;
      };
     */
    const uniforms = {};

    uniforms[uniformName + ".position"] = {
      name: uniformName + ".position",
      type: DataType.FLOAT_VEC3
    };

    uniforms[uniformName + ".direction"] = {
      name: uniformName + ".direction",
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

    uniforms[uniformName + ".angle"] = {
      name: uniformName + ".angle",
      type: DataType.FLOAT
    };

    uniforms[uniformName + ".penumbra"] = {
      name: uniformName + ".penumbra",
      type: DataType.FLOAT
    };

    uniforms[uniformName + ".coneCos"] = {
      name: uniformName + ".coneCos",
      type: DataType.FLOAT
    };

    uniforms[uniformName + ".penumbraCos"] = {
      name: uniformName + ".penumbraCos",
      type: DataType.FLOAT
    };

    return uniforms;
  }

  /**
   * 将灯光参数值提交到材质对象
   */
  bindMaterialValues(mtl, uniformName) {
    mtl.setValue(uniformName + ".position", this.position);
    mtl.setValue(uniformName + ".direction", this.direction);
    mtl.setValue(uniformName + ".color", this.color);
    mtl.setValue(uniformName + ".lightColor", this.lightColor);
    mtl.setValue(uniformName + ".intensity", this.intensity);
    mtl.setValue(uniformName + ".distance", this.distance);
    mtl.setValue(uniformName + ".decay", this.decay);
    mtl.setValue(uniformName + ".angle", this.angle);
    mtl.setValue(uniformName + ".penumbra", this.penumbra);
    mtl.setValue(uniformName + ".coneCos", Math.cos(this.angle));
    mtl.setValue(uniformName + ".penumbraCos", Math.cos(this.angle * (1 - this.penumbra)));
  }
}
