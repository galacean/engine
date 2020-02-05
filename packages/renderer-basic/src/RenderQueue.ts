import { vec3 } from "@alipay/o3-math";
import { Logger, MaskList } from "@alipay/o3-base";
import { ACamera, NodeAbility } from "@alipay/o3-core";
import { Material } from "@alipay/o3-material";

/**
 * 渲染队列管理
 * @class
 * @private
 */
export class RenderQueue {
  private _items;

  constructor() {
    this._items = [];
  }

  /**
   * 需要渲染的对象数组
   * @member {Object}
   * @readonly
   */
  get items() {
    return this._items;
  }

  /**
   * 情况内部数据
   */
  clear() {
    this._items = [];
  }

  /**
   * 把一个 Primitive 对象添加进来
   */
  pushPrimitive(nodeAbility, primitive, mtl) {
    this._items.push({
      nodeAbility,
      primitive,
      mtl
    });
  }

  /**
   * 对于透明对象，按照离摄像机由远及近的顺序渲染，有助于减少视觉错误
   * @param {vec3} eyePos
   */
  sortByDistance(eyePos) {
    const items = this._items;

    if (items.length > 1) {
      this._items = items.sort(function(item1, item2) {
        if (item1.nodeAbility.renderPriority === item2.nodeAbility.renderPriority) {
          const pos1 = item1.nodeAbility.node.worldPosition;
          const pos2 = item2.nodeAbility.node.worldPosition;

          const dis = vec3.squaredDistance(pos2, eyePos) - vec3.squaredDistance(pos1, eyePos);
          return dis;
        } else {
          return item1.nodeAbility.renderPriority - item2.nodeAbility.renderPriority;
        }
      });
    } // end of if
  }

  /**
   * 对于不透明对象，按照 Technique 排序，可以减少渲染状态切换，提升效率
   */
  sortByTechnique() {
    const items = this._items;

    if (items.length > 1) {
      this._items = items.sort(function(item1, item2) {
        if (item1.nodeAbility.renderPriority === item2.nodeAbility.renderPriority) {
          const tech1 = item1.mtl.technique;
          const tech2 = item2.mtl.technique;
          if (tech1 && tech2) {
            return tech1.name.localeCompare(tech2.name);
          } else {
            return 0;
          }
        } else {
          return item1.nodeAbility.renderPriority - item2.nodeAbility.renderPriority;
        }
      });
    } // end of if
  }

  /**
   * 把一个 Sprite 绘制需要的信息传进来
   * @param {NodeAbility} nodeAbility
   * @param {object} positionQuad  Sprite四个顶点的位置
   * @param {object} uvRect        Sprite在texture上的纹理坐标
   * @param {vec4}   tintColor     颜色
   * @param {Texture}   texture    纹理信息
   * @param {String}    renderMode    绘制方式， '2D' 或者 '3D'
   * @param {ACamera}   camera        相机信息
   */
  pushSprite(nodeAbility: NodeAbility, positionQuad, uvRect, tintColor, texture, renderMode, camera) {
    this._items.push({
      nodeAbility,
      positionQuad,
      uvRect,
      tintColor,
      texture,
      renderMode,
      camera
    });
  }

  /**
   * 执行渲染操作
   * @param {ACamera} camera 当前的摄像机
   * @param {Material} replaceMaterial 替换模型自身的材质
   * @param {number} mask 渲染过滤使用的mask
   */
  render(camera: ACamera, replaceMaterial: Material, mask: MaskList) {
    const rhi = camera.renderHardware;
    const items = this._items;

    // 如果没有items不需要渲染
    if (items.length === 0) {
      return;
    }

    this.updateMaxJointsNum(this._items);

    for (let i = 0, len = items.length; i < len; i++) {
      const item = items[i];
      const { nodeAbility, primitive, mtl } = item;

      //-- filter by mask
      const renderPassFlag = nodeAbility.renderPassFlag;
      if (!(renderPassFlag & mask)) continue;

      //-- draw
      if (this._isPrimitive(item)) {
        //-- 如果有缓存的Sprite尚未绘制，则先绘制缓存的Sprite
        rhi.flushSprite();

        if (replaceMaterial) {
          replaceMaterial.prepareDrawing(camera, nodeAbility, primitive, mtl);
          rhi.drawPrimitive(primitive, replaceMaterial);
        } else {
          mtl.prepareDrawing(camera, nodeAbility, primitive);
          rhi.drawPrimitive(primitive, mtl);
        }
      } else {
        rhi.drawSprite(item.positionQuad, item.uvRect, item.tintColor, item.texture, item.renderMode, item.camera);
      }
    } // end of for

    rhi.flushSprite();
  }

  /**
   * 更新当前 renderQueue 中各个材质的最大骨骼节点数
   * @param items
   */
  updateMaxJointsNum(items) {
    for (let i = 0, len = items.length; i < len; i++) {
      const { nodeAbility, mtl } = items[i];

      // 仅当 nodeAbility 为 ASkinnedMeshRenderer 时需要计算
      if (nodeAbility.jointNodes) {
        mtl.maxJointsNum = Math.max(mtl.maxJointsNum, nodeAbility.jointNodes.length);
      }
    }
  }

  /**
   * 判断是否是sprite
   * @private
   */
  _isPrimitive(item) {
    return !!item.primitive;
  }
}
