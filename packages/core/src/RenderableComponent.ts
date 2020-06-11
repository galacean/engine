import { ACamera } from "./ACamera";
import { NodeAbility } from "./NodeAbility";
import { vec3 } from "@alipay/o3-math";
/**
 * 渲染组件
 */
//CM:应该写成抽象类
export class RenderableComponent extends NodeAbility {
  _renderable: boolean = true;
  /**
   * @override
   */
  render(camera: ACamera): void {} //CM:应该写成抽象方法

  _onActive() {
    super._onActive();
    this.scene._componentsManager.addRenderer(this);
  }

  _onInActive() {
    super._onInActive();
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
