import { Entity, MathUtil, Matrix, Rect, Transform, Vector2, Vector3, deepClone, ignoreClone } from "@galacean/engine";

/**
 * The Transform component exclusive to the UI element.
 */
export class UITransform extends Transform {
  @deepClone
  private _size: Vector2 = new Vector2(100, 100);
  @deepClone
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  @ignoreClone
  private _localRect: Rect = new Rect(-50, -50, 100, 100);

  private _left: number = NaN;
  private _right: number = NaN;
  private _center: number = NaN;
  private _top: number = NaN;
  private _bottom: number = NaN;
  private _middle: number = NaN;
  private _alignment: UITransformAlignment = UITransformAlignment.None;

  override get position(): Vector3 {
    if (!!this._alignment) {
      const { _position: position } = this;
      if (this._isContainDirtyFlag(UITransformModifyFlags.LocalPosition)) {
        // @ts-ignore
        position._onValueChanged = null;
        this._calAbsoluteByAlignment(this._alignment);
        // @ts-ignore
        position._onValueChanged = this._onPositionChanged;
        this._setDirtyFlagFalse(UITransformModifyFlags.LocalPosition);
      }
    }
    return this._position;
  }

  override set localMatrix(value: Matrix) {
    super.localMatrix = value;
    !!this._alignment && this._setDirtyFlagTrue(UITransformModifyFlags.LpLm);
  }

  override set worldMatrix(value: Matrix) {
    super.worldMatrix = value;
    !!this._alignment && this._setDirtyFlagTrue(UITransformModifyFlags.LpLmWm);
  }

  get left(): number {
    return this._left;
  }

  set left(value: number) {
    if (MathUtil.equals(value, this._left)) return;
    this._left = value;
    if (Number.isFinite(value)) {
      this._center = NaN;
      this._alignment = (this._alignment | UITransformAlignment.Left) & ~UITransformAlignment.Center;
    } else {
      this._alignment &= ~UITransformAlignment.Left;
    }
    this._updateHorizontalAlignment();
  }

  get right(): number {
    return this._right;
  }

  set right(value: number) {
    if (MathUtil.equals(value, this._right)) return;
    this._right = value;
    if (Number.isFinite(value)) {
      this._center = NaN;
      this._alignment = (this._alignment | UITransformAlignment.Right) & ~UITransformAlignment.Center;
    } else {
      this._alignment &= ~UITransformAlignment.Right;
    }
    this._updateHorizontalAlignment();
  }

  get center(): number {
    return this._center;
  }

  set center(value: number) {
    if (MathUtil.equals(value, this._center)) return;
    this._center = value;
    if (Number.isFinite(value)) {
      this._left = this.right = NaN;
      this._alignment = (this._alignment | UITransformAlignment.Center) & ~UITransformAlignment.LeftAndRight;
    } else {
      this._alignment &= ~UITransformAlignment.Center;
    }
    this._updateHorizontalAlignment();
  }

  get top(): number {
    return this._top;
  }

  set top(value: number) {
    if (MathUtil.equals(value, this._top)) return;
    this._top = value;
    if (Number.isFinite(value)) {
      this._middle = NaN;
      this._alignment = (this._alignment | UITransformAlignment.Top) & ~UITransformAlignment.Middle;
    } else {
      this._alignment &= ~UITransformAlignment.Top;
    }
    this._updateVerticalAlignment();
  }

  get bottom(): number {
    return this._bottom;
  }

  set bottom(value: number) {
    if (MathUtil.equals(value, this._bottom)) return;
    this._bottom = value;
    if (Number.isFinite(value)) {
      this._middle = NaN;
      this._alignment = (this._alignment | UITransformAlignment.Bottom) & ~UITransformAlignment.Middle;
    } else {
      this._alignment &= ~UITransformAlignment.Bottom;
    }
    this._updateVerticalAlignment();
  }

  get middle(): number {
    return this._middle;
  }

  set middle(value: number) {
    if (MathUtil.equals(value, this._middle)) return;
    this._middle = value;
    if (Number.isFinite(value)) {
      this._top = this.bottom = NaN;
      this._alignment = (this._alignment | UITransformAlignment.Middle) & ~UITransformAlignment.TopAndBottom;
    } else {
      this._alignment &= ~UITransformAlignment.Middle;
    }
    this._updateVerticalAlignment();
  }

  /**
   * Width and height of UI element.
   */
  get size(): Vector2 {
    const alignment = this._alignment;
    if (((alignment & UITransformAlignment.Horizontal) === UITransformAlignment.LeftAndRight || (alignment & UITransformAlignment.Vertical) === UITransformAlignment.TopAndBottom) && this._isContainDirtyFlag(UITransformModifyFlags.Size)) {
      this._calAbsoluteByAlignment(this._alignment);
      this._setDirtyFlagFalse(UITransformModifyFlags.Size);
    }
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
    this._size._onValueChanged = this._onSizeChanged.bind(this);
    // @ts-ignore
    this._pivot._onValueChanged = this._onPivotChanged.bind(this);
  }

  /**
   * @internal
   */
  protected override _parentChange(): void {
    super._parentChange();
    this._calAbsoluteByAlignment();
  }

  private _updateHorizontalAlignment(): void {
    const alignment = this._alignment & UITransformAlignment.Horizontal;
    if (!!alignment) {
      this._onPositionChanged();
      alignment === UITransformAlignment.LeftAndRight && this._onSizeChanged();
    }
  }

  private _updateVerticalAlignment(): void {
    const alignment = this._alignment & UITransformAlignment.Vertical;
    if (!!alignment) {
      this._onPositionChanged();
      alignment === UITransformAlignment.TopAndBottom && this._onSizeChanged();
    }
  }

  private _getLocalRect(): Rect {
    if (this._isContainDirtyFlag(UITransformModifyFlags.LocalRect)) {
      const { _size: size, _pivot: pivot, _localRect: localRect } = this;
      const x = -pivot.x * size.x;
      const y = -pivot.y * size.y;
      localRect.set(x, y, size.x, size.y);
      this._setDirtyFlagFalse(UITransformModifyFlags.LocalRect);
    }
    return this._localRect;
  }

  private _setLocalRectDirty(flags: UITransformModifyFlags): void {
    if (this._isContainDirtyFlag(flags)) return;
    this._setDirtyFlagTrue(flags);
    const children = this.entity.children;
    for (let i = 0, n = children.length; i < n; i++) {
      const transform = children[i].transform as unknown as UITransform;
      const alignment = transform?._alignment ?? UITransformAlignment.None;
      const horizontalAlignment = alignment & UITransformAlignment.Horizontal;
      const verticalAlignment = alignment & UITransformAlignment.Vertical;
      if (!!horizontalAlignment || !!verticalAlignment) {
        transform._setDirtyFlagTrue(UITransformModifyFlags.LocalPosition);
        if (horizontalAlignment === UITransformAlignment.LeftAndRight || verticalAlignment === UITransformAlignment.TopAndBottom) {
          transform._setLocalRectDirty(UITransformModifyFlags.Size | UITransformModifyFlags.LocalRect);
        }
      }
    }
  }

  private _calAbsoluteByAlignment(alignment: UITransformAlignment = this._alignment): void {
    const parentRect = (this._getParentTransform() as unknown as UITransform)?._getLocalRect?.();
    if (!parentRect) return;
    const { _localRect: localRect } = this;
    switch (alignment & UITransformAlignment.Horizontal) {
      case UITransformAlignment.Left:
        this.position.x = parentRect.x + this._left + localRect.x;
        break;
      case UITransformAlignment.Center:
        this.position.x = (parentRect.x + (parentRect.width - localRect.width)) >> (1 + localRect.x + this._center);
        break;
      case UITransformAlignment.Right:
        this.position.x = parentRect.width + parentRect.x - this._right - localRect.width - localRect.x;
        break;
      case UITransformAlignment.LeftAndRight:
        this._size.x = parentRect.width - this._left - this._right;
        this.position.x = parentRect.x + this._left + localRect.x;
        break;
      default:
        break;
    }
    switch (alignment & UITransformAlignment.Vertical) {
      case UITransformAlignment.Top:
        this.position.y = parentRect.y + this._top + localRect.y;
        break;
      case UITransformAlignment.Middle:
        this.position.y = (parentRect.y + (parentRect.height - localRect.height)) >> (1 + localRect.y + this._middle);
        break;
      case UITransformAlignment.Bottom:
        this.position.y = parentRect.height + parentRect.y - this._bottom - localRect.height - localRect.y;
        break;
      case UITransformAlignment.TopAndBottom:
        this._size.y = parentRect.height - this._top - this._bottom;
        this.position.y = parentRect.y + this._top + localRect.y;
        break;
      default:
        break;
    }
  }

  @ignoreClone
  protected override _onPositionChanged(): void {
    super._onPositionChanged();
    !!this._alignment && this._setDirtyFlagTrue(UITransformModifyFlags.LocalPosition);
  }

  @ignoreClone
  protected override _onWorldPositionChanged(): void {
    super._onWorldPositionChanged();
    !!this._alignment && this._setDirtyFlagTrue(UITransformModifyFlags.WorldPosition);
  }

  @ignoreClone
  private _onSizeChanged(): void {
    this._setLocalRectDirty(UITransformModifyFlags.LocalRect);
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Size);
  }

  @ignoreClone
  private _onPivotChanged(): void {
    this._setLocalRectDirty(UITransformModifyFlags.LocalRect);
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Pivot);
  }
}

/**
 * @internal
 * extends TransformModifyFlags
 */
export enum UITransformModifyFlags {
  /** World position. */
  WorldPosition = 0x4,
  /** Local matrix. */
  LocalMatrix = 0x40,
  /** World matrix. */
  WorldMatrix = 0x80,
  /** Size. */
  Size = 0x200,
  /** Pivot. */
  Pivot = 0x400,
  /** Local position. */
  LocalPosition = 0x800,
  /** Local Rect. */
  LocalRect = 0x1000,

  /** Local position | local matrix. */
  LpLm = LocalPosition | LocalMatrix,
  /** Local position | local matrix | world matrix. */
  LpLmWm = LocalPosition | LocalMatrix | WorldMatrix
}

enum UITransformAlignment {
  None = 0,
  /** Horizontal. */
  Left = 0x1,
  Right = 0x2,
  LeftAndRight = 0x3,
  Center = 0x4,
  Horizontal = 0x7,
  /** Vertical. */
  Top = 0x8,
  Bottom = 0x10,
  TopAndBottom = 0x18,
  Middle = 0x20,
  Vertical = 0x38
}
