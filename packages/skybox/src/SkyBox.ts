import { GeometryRenderer } from "@alipay/o3-geometry";
import { CuboidGeometry } from "@alipay/o3-geometry-shape";
import { SkyBoxMaterial } from "./SkyBoxMaterial";

/**
 * 天空盒组件
 * @class
 */
export class SkyBox extends GeometryRenderer {
  private _skyBoxMap: any;

  /**
   * 天空盒组件
   * @param {Node} node 挂载节点
   * @param {Object} props Object对象包含以下参数
   * @param {TextureCubeMap} props.skyBoxMap 天空盒纹理
   */
  constructor(node, props) {
    super(node, props);

    const { skyBoxMap } = props;

    /**
     * 天空盒纹理
     * @member {TextureCubeMap}
     */
    this.geometry = new CuboidGeometry(2, 2, 2);
    this.setMaterial(new SkyBoxMaterial());
    this.skyBoxMap = skyBoxMap;
  }

  update() {
    (this.material as SkyBoxMaterial).setModel(this.node.transform.worldMatrix);
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
