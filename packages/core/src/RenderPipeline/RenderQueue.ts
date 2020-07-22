import { MaskList } from "@alipay/o3-base";
import { vec3 } from "@alipay/o3-math";
import { Camera } from "../Camera";
import { Component } from "../Component";

/** @todo: monorepo circle dependence */
type RenderTarget = any;
type Material = any;

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
  pushPrimitive(component, primitive, mtl) {
    this._items.push({
      component,
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
      this._items = items.sort(function (item1, item2) {
        if (item1.component.renderPriority === item2.component.renderPriority) {
          const pos1 = item1.component.node.worldPosition;
          const pos2 = item2.component.node.worldPosition;

          const dis = vec3.squaredDistance(pos2, eyePos) - vec3.squaredDistance(pos1, eyePos);
          return dis;
        } else {
          return item1.component.renderPriority - item2.component.renderPriority;
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
      this._items = items.sort(function (item1, item2) {
        if (item1.component.renderPriority === item2.component.renderPriority) {
          const tech1 = item1.mtl.technique;
          const tech2 = item2.mtl.technique;
          if (tech1 && tech2) {
            return tech1.name.localeCompare(tech2.name);
          } else {
            return 0;
          }
        } else {
          return item1.component.renderPriority - item2.component.renderPriority;
        }
      });
    } // end of if
  }

  /**
   * 把一个 Sprite 绘制需要的信息传进来
   * @param {Component} component
   * @param {object} positionQuad  Sprite四个顶点的位置
   * @param {object} uvRect        Sprite在texture上的纹理坐标
   * @param {vec4}   tintColor     颜色
   * @param {Texture}   texture    纹理信息
   * @param {String}    renderMode    绘制方式， '2D' 或者 '3D'
   * @param {ACamera}   camera        相机信息
   */
  pushSprite(component: Component, positionQuad, uvRect, tintColor, texture, renderMode, camera) {
    this._items.push({
      component,
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
  render(camera: Camera, replaceMaterial: Material, mask: MaskList) {
    const rhi = camera.scene.engine._hardwareRenderer;
    const items = this._items;

    // 如果没有items不需要渲染
    if (items.length === 0) {
      return;
    }

    this.updateMaxJointsNum(this._items, replaceMaterial);

    for (let i = 0, len = items.length; i < len; i++) {
      const item = items[i];
      const { component, primitive, mtl } = item;

      //-- filter by mask
      const renderPassFlag = component.renderPassFlag;
      if (!(renderPassFlag & mask)) continue;

      //-- draw
      if (this._isPrimitive(item)) {
        //-- 如果有缓存的Sprite尚未绘制，则先绘制缓存的Sprite
        rhi.flushSprite();

        const material = replaceMaterial ? replaceMaterial : mtl;
        material.preRender?.(item.component, item.primitive);

        material.prepareDrawing(camera, item.component, item.primitive, mtl);
        rhi.drawPrimitive(item.primitive, material);

        material.postRender?.(item.component, item.primitive);
      } else {
        rhi.drawSprite(item.positionQuad, item.uvRect, item.tintColor, item.texture, item.renderMode, item.camera);
      }
    } // end of for

    rhi.flushSprite();
  }

  /**
   * 更新当前 renderQueue 中各个材质的最大骨骼节点数
   * @param items
   * @param {Material} replaceMaterial
   */
  updateMaxJointsNum(items, replaceMaterial: Material) {
    for (let i = 0, len = items.length; i < len; i++) {
      const { component, mtl } = items[i];

      const materialControl = replaceMaterial ? replaceMaterial : mtl;
      // 仅当 component 为 SkinnedMeshRenderer 时需要计算
      if (component.jointNodes) {
        materialControl.maxJointsNum = Math.max(materialControl.maxJointsNum, component.jointNodes.length);
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
