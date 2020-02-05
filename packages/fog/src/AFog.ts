import { NodeAbility } from "@alipay/o3-core";
import { FogFeature } from "./FogFeature";

/**
 * 雾基类
 */
export class AFog extends NodeAbility {
  public color;

  constructor(node, props) {
    super(node, props);

    /**
     * 雾颜色
     * @member {Array}
     */
    this.color = props.color === undefined ? [1, 0, 0] : props.color;

    this.addEventListener("enabled", this.onEnable);
    this.addEventListener("disabled", this.onDisable);
  }

  /**
   * @private
   */
  onEnable() {
    this.scene.findFeature(FogFeature).fog = this;
  }

  /**
   * @private
   */
  onDisable() {
    this.scene.findFeature(FogFeature).fog = null;
  }

  /**
   * @private
   */
  bindMaterialValues(mtl) {}
}
