import { SkyBoxMaterial } from "./SkyBoxMaterial";
import { GeometryRenderer } from "../geometry/GeometryRenderer";
import { CuboidGeometry } from "../geometry-shape/Cuboid";

/**
 * 天空盒组件
 * @class
 */
export class SkyBox extends GeometryRenderer {
  private _skyBoxMap: any;

  /**
   * 天空盒组件
   * @param {Entity} entity 挂载节点
   * @param {Object} props Object对象包含以下参数
   * @param {TextureCubeMap} props.skyBoxMap 天空盒纹理
   */
  constructor(entity, props) {
    super(entity, props);

    const { skyBoxMap } = props;

    /**
     * 天空盒纹理
     * @member {TextureCubeMap}
     */
    this.geometry = new CuboidGeometry(2, 2, 2, this.engine);
    this.material = new SkyBoxMaterial();
    this.skyBoxMap = skyBoxMap;
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
    this.getMaterial().setValue("u_cube", v);
  }
}
