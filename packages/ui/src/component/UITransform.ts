import { Entity, MathUtil, Rect, Transform, Vector2, deepClone, ignoreClone } from "@galacean/engine";

/**
 * The Transform component exclusive to the UI element.
 */
export class UITransform extends Transform {
  @deepClone
  private _size: Vector2 = new Vector2(100, 100);
  @deepClone
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  @deepClone
  private _localRect: Rect = new Rect(-50, -50, 100, 100);

  private _left: number = NaN;
  private _right: number = NaN;
  private _center: number = NaN;
  private _top: number = NaN;
  private _bottom: number = NaN;
  private _middle: number = NaN;
  private _alignment: UITransformAlignment = UITransformAlignment.None;

  get left(): number {
    return this._left;
  }

  set left(value: number) {
    if (MathUtil.equals(value, this._left)) return;
    this._left = value;
    if (Number.isFinite(value)) {
      this._alignment &= ~UITransformAlignment.Left;
    } else {
      this._center = NaN;
      this._alignment &= ~UITransformAlignment.Center;
      this._alignment |= UITransformAlignment.Left;
    }
    this._calAbsoluteByRelative(this._alignment & UITransformAlignment.Horizontal);
  }

  get right(): number {
    return this._right;
  }

  set right(value: number) {
    if (MathUtil.equals(value, this._right)) return;
    this._right = value;
    if (Number.isFinite(value)) {
      this._alignment &= ~UITransformAlignment.Right;
    } else {
      this._center = NaN;
      this._alignment &= ~UITransformAlignment.Center;
      this._alignment |= UITransformAlignment.Right;
    }
    this._calAbsoluteByRelative(this._alignment & UITransformAlignment.Horizontal);
  }

  get center(): number {
    return this._center;
  }

  set center(value: number) {
    if (MathUtil.equals(value, this._center)) return;
    this._center = value;
    if (Number.isFinite(value)) {
      this._alignment &= ~UITransformAlignment.Center;
    } else {
      this._left = this.right = NaN;
      this._alignment &= ~UITransformAlignment.LeftAndRight;
      this._alignment |= UITransformAlignment.Center;
    }
    this._calAbsoluteByRelative(this._alignment & UITransformAlignment.Horizontal);
  }

  get top(): number {
    return this._top;
  }

  set top(value: number) {
    if (MathUtil.equals(value, this._top)) return;
    this._top = value;
    if (Number.isFinite(value)) {
      this._alignment &= ~UITransformAlignment.Top;
    } else {
      this._middle = NaN;
      this._alignment &= ~UITransformAlignment.Middle;
      this._alignment |= UITransformAlignment.Top;
    }
    this._calAbsoluteByRelative(this._alignment & UITransformAlignment.Vertical);
  }

  get bottom(): number {
    return this._bottom;
  }

  set bottom(value: number) {
    if (MathUtil.equals(value, this._bottom)) return;
    this._bottom = value;
    if (Number.isFinite(value)) {
      this._alignment &= ~UITransformAlignment.Bottom;
    } else {
      this._middle = NaN;
      this._alignment &= ~UITransformAlignment.Middle;
      this._alignment |= UITransformAlignment.Bottom;
    }
    this._calAbsoluteByRelative(this._alignment & UITransformAlignment.Vertical);
  }

  get middle(): number {
    return this._middle;
  }

  set middle(value: number) {
    if (MathUtil.equals(value, this._middle)) return;
    this._middle = value;
    if (Number.isFinite(value)) {
      this._alignment &= ~UITransformAlignment.Middle;
    } else {
      this._top = this.bottom = NaN;
      this._alignment &= ~UITransformAlignment.TopAndBottom;
      this._alignment |= UITransformAlignment.Middle;
    }
    this._calAbsoluteByRelative(this._alignment & UITransformAlignment.Vertical);
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
    this._updateLocalRect();
    // @ts-ignore
    this._size._onValueChanged = this._onSizeChange.bind(this);
    // @ts-ignore
    this._pivot._onValueChanged = this._onPivotChange.bind(this);
  }

  @ignoreClone
  protected override _onPositionChanged(): void {
    super._onPositionChanged();
    this._calRelativeByAbsolute();
  }

  /**
   * @internal
   */
  protected override _parentChange(): void {
    super._parentChange();
    this._calAbsoluteByRelative();
  }

  private _updateLocalRect(): void {
    const { _size: size, _pivot: pivot, _localRect: localRect } = this;
    const x = -pivot.x * size.x;
    const y = -pivot.y * size.y;
    localRect.set(x, y, size.x, size.y);
    this._calRelativeByAbsolute();
    const children = this.entity.children;
    for (let i = 0, n = children.length; i < n; i++) {
      (children[i].transform as unknown as UITransform)?._calAbsoluteByRelative();
    }
  }

  private _calRelativeByAbsolute(alignment: UITransformAlignment = this._alignment): void {
    const parentRect = (this._getParentTransform() as unknown as UITransform)?._localRect;
    if (!parentRect) return;
    const { _localRect: localRect } = this;
    switch (alignment & UITransformAlignment.Horizontal) {
      case UITransformAlignment.Left:
        this.left = this.position.x - parentRect.x - localRect.x;
        break;
      case UITransformAlignment.Center:
        this.center = this.position.x - parentRect.x - (parentRect.width - localRect.width) / 2 - localRect.x;
        break;
      case UITransformAlignment.Right:
        this.right = parentRect.x + parentRect.width - this.position.x - localRect.width - localRect.x;
        break;
      case UITransformAlignment.LeftAndRight:
        this._left = this.position.x - parentRect.x - localRect.x;
        this.right = parentRect.width - localRect.width - this._left;
        break;
      default:
        break;
    }
    switch (alignment & UITransformAlignment.Vertical) {
      case UITransformAlignment.Top:
        this.top = this.position.y - parentRect.y - localRect.y;
        break;
      case UITransformAlignment.Bottom:
        this.bottom = parentRect.y + parentRect.height - this.position.y - localRect.height - localRect.y;
        break;
      case UITransformAlignment.Middle:
        this.middle = this.position.y - parentRect.y - (parentRect.height - localRect.height) / 2 - localRect.y;
        break;
      case UITransformAlignment.TopAndBottom:
        this._top = this.position.y - parentRect.y - localRect.y;
        this.bottom = parentRect.height - localRect.height - this._top;
        break;
      default:
        break;
    }
  }

  private _calAbsoluteByRelative(alignment: UITransformAlignment = this._alignment): void {
    const parentRect = (this._getParentTransform() as unknown as UITransform)?._localRect;
    if (!parentRect) return;
    const { _localRect: localRect } = this;
    switch (alignment & UITransformAlignment.Horizontal) {
      case UITransformAlignment.Left:
        this.position.x = parentRect.x + this._left + localRect.x;
        break;
      case UITransformAlignment.Center:
        this.position.x = parentRect.x + (parentRect.width - localRect.width) >> 1 + localRect.x + this._center;
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
        this.position.y = parentRect.y + (parentRect.height - localRect.height) >> 1 + localRect.y + this._middle;
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
  private _onSizeChange(): void {
    this._updateLocalRect();
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Size);
  }

  @ignoreClone
  private _onPivotChange(): void {
    this._updateLocalRect();
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Pivot);
  }
}

/**
 * @internal
 */
export enum UITransformModifyFlags {
  /** Size. */
  Size = 0x200,
  /** Pivot. */
  Pivot = 0x400,
}

enum UITransformAlignment {
  None = 0,
  // Horizontal alignment
  Left = 0x1,
  Right = 0x2,
  LeftAndRight = 0x3,
  Center = 0x4,
  Horizontal = 0x7,
  // Vertical alignment
  Top = 0x8,
  Bottom = 0x10,
  TopAndBottom = 0x18,
  Middle = 0x20,
  Vertical = 0x38,
}