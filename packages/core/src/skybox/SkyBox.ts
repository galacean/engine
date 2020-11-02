import { CuboidGeometry } from "../geometry-shape/CuboidGeometry";
import { GeometryRenderer } from "../geometry/GeometryRenderer";
import { SkyBoxMaterial } from "./SkyBoxMaterial";

/**
 * 天空盒组件
 * @class
 */
export class SkyBox extends GeometryRenderer {
  private _skyBoxMap: any;

  /**
   * 天空盒组件
   * @param {Entity} entity 挂载节点
   */
  constructor(entity) {
    super(entity);
    this.geometry = new CuboidGeometry(this.engine, 2, 2, 2);
    this.material = new SkyBoxMaterial(this.engine);
  }

  update() {
    (this.material as SkyBoxMaterial).setModel(this.entity.transform.worldMatrix);
  }

  render(camera) {
    if (!this._skyBoxMap) return;
    super.render(camera);
  }

  /**
   * 天空盒贴图
   * @type {TextureCubeMap}
   */
  get skyBoxMap() {
    return this._skyBoxMap;
  }

  set skyBoxMap(v) {
    this._skyBoxMap = v;
    this.material.setValue("u_cube", v);
  }
}
