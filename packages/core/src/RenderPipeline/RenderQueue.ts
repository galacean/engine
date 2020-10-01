import { Vector3 } from "@alipay/o3-math";
import { MaskList } from "../base";
import { Camera } from "../Camera";
import { Component } from "../Component";
import { RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";

interface SpriteElement {
  component;
  positionQuad;
  uvRect;
  tintColor;
  texture;
  renderMode;
  camera;
}

/** @todo: monorepo circle dependence */
type RenderTarget = any;
type Material = any;

/**
 * 渲染队列管理。
 * @private
 */
export class RenderQueue {
  private _items: (RenderElement | SpriteElement)[] = [];

  constructor() {}

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
  pushPrimitive(element: RenderElement) {
    this._items.push(element);
  }

  /**
   * 对于透明对象，按照离摄像机由远及近的顺序渲染，有助于减少视觉错误
   * @param {Vector3} eyePos
   */
  sortByDistance(eyePos: Vector3) {
    const items = this._items;

    if (items.length > 1) {
      this._items = items.sort(function (item1, item2) {
        if (item1.component.renderPriority === item2.component.renderPriority) {
          const pos1 = item1.component.entity.transform.worldPosition;
          const pos2 = item2.component.entity.transform.worldPosition;

          const dis = Vector3.distanceSquared(pos2, eyePos) - Vector3.distanceSquared(pos1, eyePos);
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
      this._items = items.sort(function (item1: RenderElement, item2: RenderElement) {
        if (item1.component.renderPriority === item2.component.renderPriority) {
          const tech1 = item1.material.technique;
          const tech2 = item2.material.technique;
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
   * @param {Camera}   camera        相机信息
   */
  pushSprite(component: Component, positionQuad, uvRect, tintColor, texture, renderMode, camera: Camera) {
    const element: SpriteElement = {
      component,
      positionQuad,
      uvRect,
      tintColor,
      texture,
      renderMode,
      camera
    };
    this._items.push(element);
  }

  /**
   * 执行渲染操作
   * @param {Camera} camera 当前的摄像机
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

    const context = RenderContext._getRenderContext(camera);

    for (let i = 0, len = items.length; i < len; i++) {
      const item = items[i];
      const { component } = item;

      //-- filter by mask
      const renderPassFlag = component.renderPassFlag;
      if (!(renderPassFlag & mask)) continue;

      //-- draw
      if (this._isPrimitive(item)) {
        const element = <RenderElement>item;
        //-- 如果有缓存的Sprite尚未绘制，则先绘制缓存的Sprite
        rhi.flushSprite();

        const material = replaceMaterial ? replaceMaterial : element.material;
        material.preRender?.(element.component, element.primitive);

        material.prepareDrawing(context, element.component, element.primitive, element.material);
        rhi.drawPrimitive(element.primitive, element.subPrimitive, material);

        material.postRender?.(element.component, element.primitive);
      } else {
        const spirteElement = <SpriteElement>item;
        rhi.drawSprite(
          spirteElement.positionQuad,
          spirteElement.uvRect,
          spirteElement.tintColor,
          spirteElement.texture,
          spirteElement.renderMode,
          spirteElement.camera
        );
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
      const { component, material } = items[i];

      const materialControl = replaceMaterial ? replaceMaterial : material;
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
