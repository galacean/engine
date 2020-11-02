import { Vector3 } from "@oasis-engine/math";
import { Component } from "../Component";
import { FogFeature } from "./FogFeature";

/**
 * 雾基类
 */
export class Fog extends Component {
  public color: Vector3 = new Vector3(1, 0, 0);

  constructor(node) {
    super(node);
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
