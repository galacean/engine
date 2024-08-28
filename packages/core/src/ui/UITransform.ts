import { Vector2 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { Transform } from "../Transform";
import { deepClone, ignoreClone } from "../clone/CloneManager";

export class UITransform extends Transform {
  @deepClone
  private _rect: Vector2 = new Vector2(100, 100);
  @deepClone
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  @ignoreClone
  private _writeable: boolean = true;

  /** @internal */
  get writeable(): boolean {
    return this._writeable;
  }

  /** @internal */
  set writeable(val: boolean) {
    this._writeable = val;
  }

  get rect(): Vector2 {
    return this._rect;
  }

  set rect(val: Vector2) {
    const { _rect: rect } = this;
    if (rect === val) return;
    (rect.x !== val.x || rect.y !== val.y) && rect.copyFrom(val);
  }

  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(val: Vector2) {
    const { _pivot: pivot } = this;
    if (pivot === val) return;
    (pivot.x !== val.x || pivot.y !== val.y) && pivot.copyFrom(val);
  }

  constructor(entity: Entity) {
    super(entity);
    // @ts-ignore
    entity._transform.destroy();
    // @ts-ignore
    entity._transform = this;
    // @ts-ignore
    entity._inverseWorldMatFlag = this.registerWorldChangeFlag();
    // @ts-ignore
    this._rect._onValueChanged = this._onRectChange.bind(this);
    // @ts-ignore
    this._pivot._onValueChanged = this._onPivotChange.bind(this);

    const _this = this;
    const proxyHandler = {
      set: function (target, prop, value, receiver): boolean {
        if (_this.writeable) {
          return Reflect.set(target, prop, value, receiver);
        } else {
          console.log(`Setting readonly property `, prop, ` is not allowed.`);
          return true;
        }
      }
    };

    this._scale = new Proxy(this._scale, proxyHandler);
    this._position = new Proxy(this._position, proxyHandler);
    this._rotation = new Proxy(this._rotation, proxyHandler);
    this._rotationQuaternion = new Proxy(this._rotationQuaternion, proxyHandler);
    this._worldPosition = new Proxy(this._worldPosition, proxyHandler);
    this._worldRotation = new Proxy(this._worldRotation, proxyHandler);
    this._worldRotationQuaternion = new Proxy(this._worldRotationQuaternion, proxyHandler);
  }

  private _onRectChange(): void {
    this._updateFlagManager.dispatch(UITransformModifyFlags.Rect);
  }

  private _onPivotChange(): void {
    this._updateFlagManager.dispatch(UITransformModifyFlags.Pivot);
  }
}

/**
 * @internal
 * extends TransformModifyFlags
 */
export enum UITransformModifyFlags {
  /** Rect. */
  Rect = 0x100,
  /** Pivot. */
  Pivot = 0x200
}
