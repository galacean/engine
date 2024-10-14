import { Vector2 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { Transform } from "../Transform";
import { deepClone, ignoreClone } from "../clone/CloneManager";

export class UITransform extends Transform {
  @deepClone
  private _size: Vector2 = new Vector2(100, 100);
  @deepClone
  private _pivot: Vector2 = new Vector2(0.5, 0.5);

  get size(): Vector2 {
    return this._size;
  }

  set size(val: Vector2) {
    const { _size: size } = this;
    if (size === val) return;
    (size.x !== val.x || size.y !== val.y) && size.copyFrom(val);
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
    this._size._onValueChanged = this._onSizeChange.bind(this);
    // @ts-ignore
    this._pivot._onValueChanged = this._onPivotChange.bind(this);
  }

  @ignoreClone
  private _onSizeChange(): void {
    this._updateFlagManager.dispatch(UITransformModifyFlags.Size);
  }

  @ignoreClone
  private _onPivotChange(): void {
    this._updateFlagManager.dispatch(UITransformModifyFlags.Pivot);
  }
}

/**
 * @internal
 * extends TransformModifyFlags
 */
export enum UITransformModifyFlags {
  /** Size. */
  Size = 0x100,
  /** Pivot. */
  Pivot = 0x200
}
