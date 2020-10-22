import { Fog } from "./Fog";

/**
 * 指数雾
 */
export class EXP2Fog extends Fog {
  public density: number = 0.0025;

  /**
   * @private
   */
  bindMaterialValues(mtl) {
    mtl.setValue("u_fogColor", this.color);
    mtl.setValue("u_fogDensity", this.density);
  }
}
