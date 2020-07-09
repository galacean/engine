import { Component } from "@alipay/o3-core";
import { FogFeature } from "./FogFeature";

/**
 * 雾基类
 */
export class Fog extends Component {
  public color;

  constructor(node, props) {
    super(node, props);

    /**
     * 雾颜色
     * @member {Array}
     */
    this.color = props.color === undefined ? [1, 0, 0] : props.color;
  }

  /**
   * @private
   */
  _onEnable() {
    this.scene.findFeature(FogFeature).fog = this;
  }

  /**
   * @private
   */
  _onDisable() {
    this.scene.findFeature(FogFeature).fog = null;
  }

  /**
   * @private
   */
  bindMaterialValues(mtl) {}
}
