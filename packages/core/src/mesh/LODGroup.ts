import { Vector3 } from "@alipay/o3-math";
import { RenderableComponent } from "../RenderableComponent";

/**
 * 离散 LOD 层级渲染控制：根据对象占用屏幕高度的百分比，切换不同的 Renderer
 */
export class LODGroup extends RenderableComponent {
  private _lods;
  /**
   * 构造函数
   * @param {Entity} entity 对象所在节点
   * @param {Object} props  配置参数
   */
  constructor(entity, props) {
    super(entity, props);
    this._lods = [];
  }

  /**
   * 添加一个 LOD 层级
   * @param {number} distance 对象距离Camera的距离
   * @param {Component} rendererAbility 当前 LOD 层级激活时的 Renderer 组件对象，可以是 MeshRenderer 或者 SkinnedMeshRenderer 等
   */
  addLod(distance, rendererAbility) {
    // 关闭原因的 Render，由 ALODGroup 接手
    rendererAbility.enabled = false;

    this._lods.push({
      distance,
      rendererAbility
    });

    this._lods.sort((a, b) => b.distance - a.distance);
  }

  /**
   * 计算当前的激活的LOD层级，并调用它的渲染
   */
  render(camera) {
    if (this._lods.length <= 0) return;

    const dist = Vector3.distance(camera.eyePos, this.entity.worldPosition);

    const lods = this._lods;
    let activeLevel = 0;
    for (let i = lods.length - 1; i >= 0; i--) {
      const lod = lods[i];
      if (dist < lod.distance) {
        activeLevel = i;
        break;
      }
    } // end of for

    const lod = lods[activeLevel];
    lod.rendererAbility.render(camera);
  }
}
