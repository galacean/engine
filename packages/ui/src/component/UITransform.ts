import { Entity, Rect, Transform, Vector2, deepClone, ignoreClone } from "@galacean/engine";

/**
 * The Transform component exclusive to the UI element.
 */
export class UITransform extends Transform {
  static _checkIsNull(value: number): boolean {
    return value === undefined || value === null || isNaN(value);
  }

  @deepClone
  private _size: Vector2 = new Vector2(100, 100);
  @deepClone
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  // 这里记录的是相对于 pivot 的矩形范围，_pivot 与 _size 会共同影响这个值
  // 如果子节点是相对位置，这个值会影响子节点的 position 和 size
  @deepClone
  private _localRect: Rect = new Rect(0, 0, 100, 100);


  // 相对值本质上是 Local 属性，他是相对与父节点的改变
  // 修改 LocalPosition 与 LocalSize 会影响相对值，同时，修改相对值也会影响 LocalPosition 与 LocalSize
  // LocalRotation 与 LocalScale 不会影响相对值


  private _left: number = NaN;
  private _right: number = NaN;
  private _center: number = NaN;
  private _horizontalAlignment: UIHorizontalAlignment = UIHorizontalAlignment.None;

  private _top: number = NaN;
  private _bottom: number = NaN;
  private _middle: number = NaN;
  private _verticalAlignment: UIVerticalAlignment = UIVerticalAlignment.None;

  get left(): number {
    if (this._isContainDirtyFlag(UITransformModifyFlags.Left)) {
      if (this._horizontalAlignment === UIHorizontalAlignment.LeftAndRight) {
        // 根据 Position 和 Size 计算 Left

      } else if (this._horizontalAlignment === UIHorizontalAlignment.Left) {
        // 

      }
      this._setDirtyFlagFalse(UITransformModifyFlags.Left);
    }
    return this._left;
  }

  set left(value: number) {
    if (this._left === value) return;
    this._left = value;
    if (UITransform._checkIsNull(value)) {
      this._horizontalAlignment &= ~UIHorizontalAlignment.Left;
    } else {
      this._horizontalAlignment &= ~UIHorizontalAlignment.Center;
      this._horizontalAlignment |= UIHorizontalAlignment.Left;
    }
  }

  get right(): number {
    return this._right;
  }

  set right(value: number) {
    if (this._right === value) return;
    this._right = value;
    if (UITransform._checkIsNull(value)) {
      this._horizontalAlignment &= ~UIHorizontalAlignment.Right;
    } else {
      this._horizontalAlignment &= ~UIHorizontalAlignment.Center;
      this._horizontalAlignment |= UIHorizontalAlignment.Right;
    }
  }

  get center(): number {
    return this._center;
  }

  set center(value: number) {
    if (this._center === value) return;
    this._center = value;
    if (UITransform._checkIsNull(value)) {
      this._horizontalAlignment &= ~UIHorizontalAlignment.Center;
    } else {
      this._horizontalAlignment = UIHorizontalAlignment.Center;
    }
  }

  get top(): number {
    return this._top;
  }

  set top(value: number) {
    if (this._top === value) return;
    this._top = value;
    if (UITransform._checkIsNull(value)) {
      this._verticalAlignment &= ~UIVerticalAlignment.Top;
    } else {
      this._verticalAlignment &= ~UIVerticalAlignment.Middle;
      this._verticalAlignment |= UIVerticalAlignment.Top;
    }
  }

  get bottom(): number {
    return this._bottom;
  }

  set bottom(value: number) {
    if (this._bottom === value) return;
    this._bottom = value;
    if (UITransform._checkIsNull(value)) {
      this._verticalAlignment &= ~UIVerticalAlignment.Bottom;
    } else {
      this._verticalAlignment &= ~UIVerticalAlignment.Middle;
      this._verticalAlignment |= UIVerticalAlignment.Bottom;
    }
  }

  get middle(): number {
    return this._middle;
  }

  set middle(value: number) {
    if (this._middle === value) return;
    this._middle = value;
    if (UITransform._checkIsNull(value)) {
      this._verticalAlignment &= ~UIVerticalAlignment.Middle;
    } else {
      this._verticalAlignment = UIVerticalAlignment.Middle;
    }
  }

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

  /**
   * @internal
   */
  _getRect(): Rect {
    // 如果 Rect 为脏
    return this._localRect;
  }

  /**
   * @internal
   */
  _parentChange(): void {
    this._isParentDirty = true;
    this._updateAllWorldFlag(UITransformModifyFlags.All);
  }

  @ignoreClone
  private _onSizeChange(): void {
    this._setDirtyFlagTrue(UITransformModifyFlags.LocalRect);
    if (this._horizontalAlignment === UIHorizontalAlignment.LeftAndRight) {
      this._setDirtyFlagTrue(UITransformModifyFlags.LeftAndRight);
    }
    if (this._verticalAlignment === UIVerticalAlignment.TopAndBottom) {
      this._setDirtyFlagTrue(UITransformModifyFlags.TopAndBottom);
    }
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Size);
  }

  private _onLocalRectChange(): void {
    const children = this.entity.children;
    for (let i = 0, n = children.length; i < n; i++) {
      (<UITransform>children[i].transform)?._onParentRectChange();
    }
  }

  private _onParentRectChange(): void {
    this._horizontalAlignment !== UIHorizontalAlignment.None && this._onHorizontalRelativeChange();
    this._verticalAlignment !== UIVerticalAlignment.None && this._onVerticalRelativeChange();
  }

  @ignoreClone
  private _onPivotChange(): void {
    this._setDirtyFlagTrue(UITransformModifyFlags.LocalRect);
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Pivot);
  }

  private _onHorizontalRelativeChange(): void {
    switch (this._horizontalAlignment) {
      case UIHorizontalAlignment.Left:
        // 影响 position
        break;
      case UIHorizontalAlignment.Center:
        // 影响 Position
        break;
      case UIHorizontalAlignment.Right:
        // 影响 position
        break;
      case UIHorizontalAlignment.LeftAndRight:
        // 影响 Size
        break;
      default:
        break;
    }
  }

  private _onVerticalRelativeChange(): void {
    switch (this._verticalAlignment) {
      // 影响 position
      case UIVerticalAlignment.Top:

        break;
      // 影响 position  
      case UIVerticalAlignment.Middle:

        break;
      // 影响 position
      case UIVerticalAlignment.Bottom:

        break;
      // 影响 Size
      case UIVerticalAlignment.TopAndBottom:

        break;
      default:
        break;
    }
  }

  private _calRelativeByAbsolute(): void {
    switch (this._horizontalAlignment) {
      case UIHorizontalAlignment.Left:

        break;
      case UIHorizontalAlignment.Right:

        break;
      case UIHorizontalAlignment.LeftAndRight:

        break;
      case UIHorizontalAlignment.Center:

        break;
      default:
        break;
    }
    switch (this._verticalAlignment) {
      case UIVerticalAlignment.Top:

        break;
      case UIVerticalAlignment.Bottom:

        break;
      case UIVerticalAlignment.TopAndBottom:

        break;
      case UIVerticalAlignment.Middle:

        break;
      default:
        break;
    }
  }

  /**
   * 这个是实时计算的，因为 Position 和 Size 是永远存在的，并且 Position 实际上是一个基准值，
   */
  private _calAbsoluteByRelative(): void {
    switch (this._horizontalAlignment) {
      case UIHorizontalAlignment.Left:

        break;
      case UIHorizontalAlignment.Right:

        break;
      case UIHorizontalAlignment.LeftAndRight:

        break;
      case UIHorizontalAlignment.Center:

        break;
      default:
        break;
    }
    switch (this._verticalAlignment) {
      case UIVerticalAlignment.Top:

        break;
      case UIVerticalAlignment.Bottom:

        break;
      case UIVerticalAlignment.TopAndBottom:

        break;
      case UIVerticalAlignment.Middle:

        break;
      default:
        break;
    }
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
  Pivot = 0x400,
  /** LocalRect. */
  LocalRect = 0x800,

  Left = 0x1000,
  Right = 0x2000,
  LeftAndRight = 0x3000,
  Center = 0x4000,
  Top = 0x8000,
  Bottom = 0x10000,
  TopAndBottom = 0x20000,
  Middle = 0x20000,

  /** All */
  All = 0xfffffffffff
}

export enum UIHorizontalAlignment {
  None = 0,
  Left = 1,
  Right = 2,
  LeftAndRight = 3,
  Center = 4,
}

export enum UIVerticalAlignment {
  None = 0,
  Top = 1,
  Bottom = 2,
  TopAndBottom = 3,
  Middle = 4,
}