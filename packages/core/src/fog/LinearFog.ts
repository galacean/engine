import { Vector3 } from "@oasis-engine/math";
import { Fog } from "./Fog";

/**
 * 线性雾，根据镜头距离线性差值雾浓度
 */
export class LinearFog extends Fog {
  public near: number = 1;
  public far: number = 1000;
  public color: Vector3;

  /**
   * @private
   */
  bindMaterialValues(mtl) {
    mtl.setValue("u_fogColor", this.color);
    mtl.setValue("u_fogNear", this.near);
    mtl.setValue("u_fogFar", this.far);
  }
}
