import { Camera } from "./Camera";
import { Component } from "./Component";
import { Vector3 } from "@alipay/o3-math";
import { Entity } from "./Entity";

/**
 * 可渲染的组件。
 */
export abstract class RenderableComponent extends Component {
  /* @internal */
  _onUpdateIndex: number = -1;
  /* @internal */
  _rendererIndex: number = -1;

  /* @internal */
  protected _overrideUpdate: boolean = false;

  constructor(entity: Entity, props: object = {}) {
    super(entity, props);
    const prototype = RenderableComponent.prototype;
    this._overrideUpdate = this.update !== prototype.update;
  }

  abstract render(camera: Camera): void;
  update(deltaTime: number): void {}

  _onEnable() {
    const componentsManager = this.scene._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.addOnUpdateRenderers(this);
    }
    componentsManager.addRenderer(this);
  }

  _onDisable() {
    const componentsManager = this.scene._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.removeOnUpdateRenderers(this);
    }
    componentsManager.removeRenderer(this);
  }

  _render(camera: Camera) {
    let culled = false;

    // distance cull
    if (this.cullDistanceSq > 0) {
      const distanceSq = Vector3.distanceSquared(
        camera._entity.transform.worldPosition,
        this.entity.transform.worldPosition
      );
      culled = this.cullDistanceSq < distanceSq;
    }

    if (!culled) {
      this.render(camera);
    }
  }
}
