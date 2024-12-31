import { Entity, Transform, Vector2, deepClone, ignoreClone } from "@galacean/engine";

/**
 * The Transform component exclusive to the UI element.
 */
export class UITransform extends Transform {
  @deepClone
  private _size: Vector2 = new Vector2(1, 1);
  @deepClone
  private _pivot: Vector2 = new Vector2(0.5, 0.5);

  /**
   * Width and height of UI element.
   */
  get size(): Vector2 {
    return this._size;
  }

  set size(value: Vector2) {
    const { _size: size } = this;
    if (size === value) return;
    (size.x !== value.x || size.y !== value.y) && size.copyFrom(value);
  }

  /**
   * Pivot of UI element.
   */
  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(value: Vector2) {
    const { _pivot: pivot } = this;
    if (pivot === value) return;
    (pivot.x !== value.x || pivot.y !== value.y) && pivot.copyFrom(value);
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    // @ts-ignore
    this._size._onValueChanged = this._onSizeChange.bind(this);
    // @ts-ignore
    this._pivot._onValueChanged = this._onPivotChange.bind(this);
  }

  @ignoreClone
  private _onSizeChange(): void {
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Size);
  }

  @ignoreClone
  private _onPivotChange(): void {
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Pivot);
  }
}

/**
 * @internal
 * extends TransformModifyFlags
 */
export enum UITransformModifyFlags {
  /** Size. */
  Size = 0x200,
  /** Pivot. */
  Pivot = 0x400
}
