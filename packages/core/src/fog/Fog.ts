import { Vector3 } from "@alipay/o3-math";
import { FogFeature } from "./FogFeature";
import { Component } from "../Component";

/**
 * 雾基类
 */
export class Fog extends Component {
  public color: Vector3;

  constructor(node, props) {
    super(node, props);

    /**
     * 雾颜色
     * @member {Vector3}
     */
    this.color = props.color === undefined ? new Vector3(1, 0, 0) : props.color;
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
