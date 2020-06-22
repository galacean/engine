import { ACamera } from "./ACamera";
import { NodeAbility } from "./NodeAbility";
import { vec3 } from "@alipay/o3-math";
import { Node } from "./Node";

/**
 * 可渲染的组件。
 */
export abstract class RenderableComponent extends NodeAbility {
  /* @internal */
  _onUpdateIndex: number = -1;
  /* @internal */
  _rendererIndex: number = -1;

  constructor(node: Node, props: object = {}) {
    super(node, props);
    const prototype = RenderableComponent.prototype;
    this._overrideOnUpdate = this.onUpdate !== prototype.onUpdate;
    this._overrideUpdate = this.update !== prototype.update;
  }

  abstract render(camera: ACamera): void;

  update(deltaTime: number): void {} //CM:未来整合为update更合理
  onUpdate(deltaTime: number): void {}

  _onActive() {
    if (this._overrideOnUpdate || this._overrideUpdate) {
      if (this._overrideUpdate) {
        this.onUpdate = this.update;
      }
      this.scene._componentsManager.addOnUpdateRenderers(this);
    }
    this.scene._componentsManager.addRenderer(this);
  }

  _onInActive() {
    if (this._overrideOnUpdate || this._overrideUpdate) {
      this.scene._componentsManager.removeOnUpdateRenderers(this);
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
