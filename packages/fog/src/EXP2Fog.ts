import { Fog } from "./Fog";

/**
 * 指数雾
 */
export class EXP2Fog extends Fog {
  public density: number;
  /**
   * 指数变换的雾
   * @param {*} node 节点
   * @param {Object} [props] 包含以下参数
   * @param {Vector3} [props.color=new Vector3(1, 0, 0)] 雾颜色
   * @param {Number} [props.density=0.0025] 雾的浓度（0-1）
   */
  constructor(node, props) {
    super(node, props);

    /**
     * 浓度
     * @member {Number}
     */
    this.density = props.density === undefined ? 0.0025 : props.density;
  }

  /**
   * @private
   */
  bindMaterialValues(mtl) {
    mtl.setValue("u_fogColor", this.color);
    mtl.setValue("u_fogDensity", this.density);
  }
}
