import { ACamera } from "./ACamera";
import { NodeAbility } from "./NodeAbility";
import { vec3 } from "@alipay/o3-math";

/**
 * @internal
 * 可渲染的组件。
 */
export abstract class RenderableComponent extends NodeAbility {
  /* @internal */
  _onUpdateIndex: number = -1;
  /* @internal */
  _rendererIndex: number = -1;

  abstract render(camera: ACamera): void;

  update(deltaTime: number): void {} //CM:未来整合为update更合理
  onUpdate(deltaTime: number): void {}

  _onActive() {
    const prototype = RenderableComponent.prototype;
    if (this.onUpdate !== prototype.onUpdate || this.update !== prototype.update) {
      if (this.update !== prototype.update) {
        this.onUpdate = this.update;
      }
      this.scene._componentsManager.addOnUpdateRenderers(this);
    }
    this.scene._componentsManager.addRenderer(this);
  }

  _onInActive() {
    const prototype = RenderableComponent.prototype;
    if (this.onUpdate !== prototype.onUpdate || this.update !== prototype.update) {
      this.scene._componentsManager.removeOnUpdateComponent(this);
    }
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

  //----------------------------------------@deprecated----------------------------------------------------
  /* @internal */
  _renderable: boolean = true;
}
