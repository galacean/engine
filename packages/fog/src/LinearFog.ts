import { Fog } from "./Fog";

/**
 * 线性雾，根据镜头距离线性差值雾浓度
 */
export class LinearFog extends Fog {
  public near;
  public far;
  public color;
  /**
   * 线性雾
   * @param {*} node 节点
   * @param {Object} [props] 包含以下参数
   * @param {Array} [props.color=[1, 1, 1]] 雾颜色
   * @param {Number} [props.near=1] 最近距离
   * @param {Number} [props.far=1000] 最远距离
   */
  constructor(node, props) {
    super(node, props);

    /**
     * 最近距离
     * @member {Number}
     */
    this.near = props.near === undefined ? 1 : props.near;
    /**
     * 最远距离
     * @member {Number}
     */
    this.far = props.far === undefined ? 1000 : props.far;
  }

  /**
   * @private
   */
  bindMaterialValues(mtl) {
    mtl.setValue("u_fogColor", this.color);
    mtl.setValue("u_fogNear", this.near);
    mtl.setValue("u_fogFar", this.far);
  }
}
