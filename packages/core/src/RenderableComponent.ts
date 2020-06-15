import { ACamera } from "./ACamera";
import { NodeAbility } from "./NodeAbility";
import { vec3 } from "@alipay/o3-math";
/**
 * 渲染组件
 */
//CM:应该写成抽象类
export class RenderableComponent extends NodeAbility {
  _renderable: boolean = true;
  render(camera: ACamera): void {} //CM:应该写成抽象方法,子类需要标记 @override，这里不需要
  /**
   * @deprecated 兼容
   */
  update(): void {}
  onUpdate(): void {}
  _onActive() {
    if (
      this.onUpdate !== RenderableComponent.prototype.onUpdate ||
      this.update !== RenderableComponent.prototype.update
    ) {
      if (this.update !== RenderableComponent.prototype.update) {
        this.onUpdate = this.update;
      }
      this.scene._componentsManager.addOnUpdateRenderers(this);
    }
    this.scene._componentsManager.addRenderer(this);
  }

  _onInActive() {
    this.scene._componentsManager.removeOnUpdateComponent(this);
    this.scene._componentsManager.removeRenderer(this);
  }

  _render(camera: ACamera) {
    let culled = false;

    // distance cull
    if (this.cullDistanceSq > 0) {
      const distanceSq = vec3.squaredDistance(camera.eyePos, this.node.worldPosition);
      culled = this.cullDistanceSq < distanceSq;
    }

    if (!culled) {
      this.render(camera);
    }
  }
}
