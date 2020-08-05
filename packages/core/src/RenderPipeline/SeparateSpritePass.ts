import { ClearMode } from "../base";
import { Vector3 } from "@alipay/o3-math";
import { Camera } from "../Camera";
import { RenderPass } from "./RenderPass";

/**
 * Sprite 的 RenderPass，在后处理后绘制，不受后处理影响
 * @private
 */
export class SeparateSpritePass extends RenderPass {
  private _spriteItems;

  constructor(name = "SeparateSprite", priority = 10) {
    super(name, priority);

    this.clearMode = ClearMode.DONT_CLEAR;
    this.renderOverride = true;

    this._spriteItems = [];
  }

  /**
   * 给 RenderPipeline 调用，判断是否需要绘制 Sprite
   */
  get isUsed() {
    return this._spriteItems.length > 0;
  }

  preRender() {
    this.enabled = this.isUsed;
  }

  render(camera) {
    const rhi = camera.renderHardware;

    this._sortByDistance(camera.eyePos);
    const items = this._spriteItems;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      rhi.drawSprite(item.positionQuad, item.uvRect, item.tintColor, item.texture, item.renderMode, item.camera);
    }

    items.length = 0;
  }

  postRender(camera) {
    if (this.enabled) {
      // 确保所有缓冲的 Sprites 都绘制到画布中
      camera.renderHardware.flushSprite();
    }
  }

  /**
   * 对于透明对象，按照离摄像机由远及近的顺序渲染，有助于减少视觉错误
   * @param {vec3} eyePos
   */
  _sortByDistance(eyePos) {
    if (this._spriteItems.length > 1) {
      this._spriteItems = this._spriteItems.sort(function (item1, item2) {
        if (item1.component.renderPriority === item2.component.renderPriority) {
          const pos1 = item1.component.node.worldPosition;
          const pos2 = item2.component.node.worldPosition;

          const dis = Vector3.distanceSquared(pos2, eyePos) - Vector3.distanceSquared(pos1, eyePos);
          return dis;
        } else {
          return item1.component.renderPriority - item2.component.renderPriority;
        }
      });
    } // end of if
  }

  /**
   * 把一个 Sprite 绘制需要的信息传进来
   * @param {Component} component
   * @param {Object} positionQuad  Sprite四个顶点的位置
   * @param {Object} uvRect        Sprite在texture上的纹理坐标
   * @param {vec4}   tintColor     颜色
   * @param {Texture}   texture    纹理信息
   * @param {String}    renderMode    绘制方式， '2D' 或者 '3D'
   * @param {Camera}   camera        相机信息
   */
  pushSprite(component, positionQuad, uvRect, tintColor, texture, renderMode, camera: Camera) {
    this._spriteItems.push({
      component,
      positionQuad,
      uvRect,
      tintColor,
      texture,
      renderMode,
      camera
    });
  }
}
