import { BoundingBox, Vector3 } from "@oasis-engine/math";
import { Camera } from "./Camera";
import { deepClone, ignoreClone } from "./clone/CloneManager";
import { Component } from "./Component";
import { Entity } from "./Entity";
import { UpdateFlag } from "./UpdateFlag";

/**
 * 可渲染的组件。
 */
export abstract class RenderableComponent extends Component {
  /** @internal */
  @ignoreClone
  _onUpdateIndex: number = -1;
  /** @internal */
  @ignoreClone
  _rendererIndex: number = -1;

  /** @internal */
  @ignoreClone
  protected _overrideUpdate: boolean = false;

  @ignoreClone
  private _transformChangeFlag: UpdateFlag;
  @deepClone
  private _bounds: BoundingBox = new BoundingBox(new Vector3(), new Vector3());

  /**
   * 包围体。
   */
  get bounds(): BoundingBox {
    const changeFlag = this._transformChangeFlag;
    if (changeFlag.flag) {
      this._updateBounds(this._bounds);
      changeFlag.flag = false;
    }
    return this._bounds;
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    const prototype = RenderableComponent.prototype;
    this._overrideUpdate = this.update !== prototype.update;
    this._transformChangeFlag = this.entity.transform.registerWorldChangeFlag();
  }

  /**
   * @inheritdoc
   */
  destroy(): void {
    super.destroy();
    const flag = this._transformChangeFlag;
    if (flag) {
      flag.destroy();
      this._transformChangeFlag = null;
    }
  }

  abstract render(camera: Camera): void;

  update(deltaTime: number): void {}

  protected _updateBounds(worldBounds: any): void {}

  _onEnable() {
    const componentsManager = this.engine._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.addOnUpdateRenderers(this);
    }
    componentsManager.addRenderer(this);
  }

  _onDisable() {
    const componentsManager = this.engine._componentsManager;
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
