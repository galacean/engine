import { Vector3 } from "@oasis-engine/math";
import { ClearMode } from "../base";
import { Camera } from "../Camera";
import { RenderPass } from "./RenderPass";

/**
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
    const material = camera._renderPipeline._defaultSpriteMaterial;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      rhi.drawSprite(
        material,
        item.positionQuad,
        item.uvRect,
        item.tintColor,
        item.texture,
        item.renderMode,
        item.camera
      );
    }

    items.length = 0;
  }

  postRender(camera) {
    if (this.enabled) {
      camera.renderHardware.flushSprite(camera.engine, camera._hardwareRenderer._defaultSpriteMaterial);
    }
  }

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
    }
  }

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
