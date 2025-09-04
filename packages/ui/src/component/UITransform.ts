import {
  Entity,
  MathUtil,
  Matrix,
  Quaternion,
  Rect,
  Transform,
  Vector2,
  Vector3,
  deepClone,
  ignoreClone
} from "@galacean/engine";
import { HorizontalAlignmentFlags, VerticalAlignmentFlags } from "../enums/AlignmentFlags";

/**
 * The Transform component exclusive to the UI element.
 */
export class UITransform extends Transform {
  @deepClone
  private _size: Vector2 = new Vector2(100, 100);
  @deepClone
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  @ignoreClone
  private _rect: Rect = new Rect(-50, -50, 100, 100);

  private _left: number = 0;
  private _right: number = 0;
  private _center: number = 0;
  private _top: number = 0;
  private _bottom: number = 0;
  private _middle: number = 0;
  private _horizontalAlignment: HorizontalAlignmentFlags = HorizontalAlignmentFlags.None;
  private _verticalAlignment: VerticalAlignmentFlags = VerticalAlignmentFlags.None;

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
   * Horizontal alignment mode: Left/Center/Right or LeftAndRight (stretch).
   */
  get horizontalAlignment(): HorizontalAlignmentFlags {
    return this._horizontalAlignment;
  }

  set horizontalAlignment(value: HorizontalAlignmentFlags) {
    const current = this._horizontalAlignment;
    if (current === value) return;
    this._horizontalAlignment = value;
    switch (value) {
      case HorizontalAlignmentFlags.Left:
      case HorizontalAlignmentFlags.Right:
      case HorizontalAlignmentFlags.Center:
        this._onPositionChanged();
        break;
      case HorizontalAlignmentFlags.LeftAndRight:
        this._onPositionChanged();
        this._onSizeChanged();
        break;
      default:
        break;
    }
  }

  /**
   * Left margin used in horizontal alignment formulas.
   */
  get left(): number {
    return this._left;
  }

  set left(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._left)) return;
    this._left = value;
    if (this._horizontalAlignment & HorizontalAlignmentFlags.Left) {
      this._onPositionChanged();
      this._horizontalAlignment & HorizontalAlignmentFlags.Right && this._onSizeChanged();
    }
  }

  /**
   * Right margin used in horizontal alignment formulas.
   */
  get right(): number {
    return this._right;
  }

  set right(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._right)) return;
    this._right = value;
    if (this._horizontalAlignment & HorizontalAlignmentFlags.Right) {
      this._onPositionChanged();
      this._horizontalAlignment & HorizontalAlignmentFlags.Left && this._onSizeChanged();
    }
  }

  /**
   * Horizontal center offset relative to parent's center.
   */
  get center(): number {
    return this._center;
  }

  set center(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._center)) return;
    this._center = value;
    this._horizontalAlignment & HorizontalAlignmentFlags.Center && this._onPositionChanged();
  }

  /**
   * Vertical alignment mode: Top/Middle/Bottom or TopAndBottom (stretch).
   */
  get verticalAlignment(): VerticalAlignmentFlags {
    return this._verticalAlignment;
  }

  set verticalAlignment(value: VerticalAlignmentFlags) {
    const current = this._verticalAlignment;
    if (current === value) return;
    this._verticalAlignment = value;
    switch (value) {
      case VerticalAlignmentFlags.Top:
      case VerticalAlignmentFlags.Bottom:
      case VerticalAlignmentFlags.Middle:
        this._onPositionChanged();
        break;
      case VerticalAlignmentFlags.TopAndBottom:
        this._onPositionChanged();
        this._onSizeChanged();
        break;
      default:
        break;
    }
  }

  /**
   * Top margin used in vertical alignment formulas.
   */
  get top(): number {
    return this._top;
  }

  set top(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._top)) return;
    this._top = value;
    if (this._verticalAlignment & VerticalAlignmentFlags.Top) {
      this._onPositionChanged();
      this._verticalAlignment & VerticalAlignmentFlags.Bottom && this._onSizeChanged();
    }
  }

  /**
   * Bottom margin used in vertical alignment formulas.
   */
  get bottom(): number {
    return this._bottom;
  }

  set bottom(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._bottom)) return;
    this._bottom = value;
    if (this._verticalAlignment & VerticalAlignmentFlags.Bottom) {
      this._onPositionChanged();
      this._verticalAlignment & VerticalAlignmentFlags.Top && this._onSizeChanged();
    }
  }

  /**
   * Vertical middle offset relative to parent's middle.
   */
  get middle(): number {
    return this._middle;
  }

  set middle(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._middle)) return;
    this._middle = value;
    this._verticalAlignment & VerticalAlignmentFlags.Middle && this._onPositionChanged();
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._onSizeChanged = this._onSizeChanged.bind(this);
    this._onPivotChanged = this._onPivotChanged.bind(this);
    // @ts-ignore
    this._size._onValueChanged = this._onSizeChanged;
    // @ts-ignore
    this._pivot._onValueChanged = this._onPivotChanged;
  }

  /**
   * @internal
   */
  _parentChange(): void {
    this._isParentDirty = true;
    this._updateWorldFlagWithParentRectChange(UITransformModifyFlags.WmWpWeWqWsWus);
  }

  // @ts-ignore
  override _cloneTo(target: UITransform, srcRoot: Entity, targetRoot: Entity): void {
    // @ts-ignore
    super._cloneTo(target, srcRoot, targetRoot);
    target.size.copyFrom(this._size);
    target.pivot.copyFrom(this._pivot);
  }

  protected override _decomposeLocalMatrix(
    matrix: Matrix,
    position: Vector3,
    quaternion: Quaternion,
    scale: Vector3
  ): void {
    matrix.decompose(position, quaternion, scale);
    this._calPosition();
    this._setDirtyFlagTrue(UITransformModifyFlags.LocalEuler | UITransformModifyFlags.LocalMatrix);
    this._setDirtyFlagFalse(UITransformModifyFlags.LocalQuat);
  }

  protected override _onWorldMatrixChange() {
    !this._horizontalAlignment && !this._verticalAlignment && super._onWorldMatrixChange();
  }

  @ignoreClone
  protected override _onPositionChanged(): void {
    (this._horizontalAlignment || this._verticalAlignment) && this._calPosition();
    super._onPositionChanged();
  }

  @ignoreClone
  protected override _onWorldPositionChanged(): void {
    super._onWorldPositionChanged();
    if (!!this._horizontalAlignment || !!this._verticalAlignment) {
      this._setDirtyFlagTrue(UITransformModifyFlags.WorldPosition);
    }
  }

  private _calPosition(): void {
    const parentRect = (this._getParentTransform() as unknown as UITransform)?._rect;
    if (!!parentRect) {
      const position = this.position;
      // @ts-ignore
      position._onValueChanged = null;
      const rect = this._rect;
      switch (this.horizontalAlignment) {
        case HorizontalAlignmentFlags.Left:
        case HorizontalAlignmentFlags.LeftAndRight:
          position.x = parentRect.x - rect.x + this._left;
          break;
        case HorizontalAlignmentFlags.Center:
          position.x = parentRect.x + parentRect.width * 0.5 - rect.x - rect.width * 0.5 + this._center;
          break;
        case HorizontalAlignmentFlags.Right:
          position.x = parentRect.x + parentRect.width - rect.x - rect.width - this._right;
          break;
        default:
          break;
      }
      switch (this.verticalAlignment) {
        case VerticalAlignmentFlags.Top:
          position.y = parentRect.y + parentRect.height - rect.y - rect.height - this._top;
          break;
        case VerticalAlignmentFlags.Middle:
          position.y = parentRect.y + parentRect.height * 0.5 - rect.y - rect.height * 0.5 + this._middle;
          break;
        case VerticalAlignmentFlags.Bottom:
        case VerticalAlignmentFlags.TopAndBottom:
          position.y = parentRect.y - rect.y + this._bottom;
          break;
        default:
          break;
      }
      // @ts-ignore
      position._onValueChanged = this._onPositionChanged;
    }
  }

  private _calSize(): void {
    const parentRect = (this._getParentTransform() as unknown as UITransform)?._rect;
    if (parentRect) {
      const size = this._size;
      // @ts-ignore
      size._onValueChanged = null;
      // The values of size must be greater than 0.
      if (this._horizontalAlignment === HorizontalAlignmentFlags.LeftAndRight) {
        size.x = Math.max(parentRect.width - this._left - this._right, 0);
      }
      if (this._verticalAlignment === VerticalAlignmentFlags.TopAndBottom) {
        size.y = Math.max(parentRect.height - this._top - this._bottom, 0);
      }
      // @ts-ignore
      size._onValueChanged = this._onSizeChanged;
    }
  }

  private _calRect(): void {
    const { size, _pivot: pivot, _rect: rect } = this;
    const x = -pivot.x * size.x;
    const y = -pivot.y * size.y;
    rect.set(x, y, size.x, size.y);
  }

  @ignoreClone
  private _onSizeChanged(): void {
    if (
      this._horizontalAlignment === HorizontalAlignmentFlags.LeftAndRight ||
      this._verticalAlignment === VerticalAlignmentFlags.TopAndBottom
    ) {
      this._calSize();
    }
    this._calRect();
    this._updateWorldFlagWithSelfRectChange();
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Size);
  }

  @ignoreClone
  private _onPivotChanged(): void {
    this._calRect();
    this._updateWorldFlagWithSelfRectChange();
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Pivot);
  }

  private _updateWorldFlagWithSelfRectChange(): void {
    let worldFlags = UITransformModifyFlags.None;
    const { _horizontalAlignment: horizontalAlignment, _verticalAlignment: verticalAlignment } = this;
    if (!!horizontalAlignment || !!verticalAlignment) {
      this._calPosition();
      this._setDirtyFlagTrue(UITransformModifyFlags.LocalMatrix);
      worldFlags = UITransformModifyFlags.WmWp;
      !this._isContainDirtyFlags(worldFlags) && this._worldAssociatedChange(worldFlags);
    }
    const children = this.entity.children;
    for (let i = 0, n = children.length; i < n; i++) {
      (children[i].transform as unknown as UITransform)?._updateWorldFlagWithParentRectChange?.(worldFlags);
    }
  }

  private _updateWorldFlagWithParentRectChange(flags: UITransformModifyFlags, parentRectDirty: boolean = true): void {
    let selfRectDirty = false;
    if (parentRectDirty) {
      const { _horizontalAlignment: horizontalAlignment, _verticalAlignment: verticalAlignment } = this;
      if (!!horizontalAlignment || !!verticalAlignment) {
        if (
          horizontalAlignment === HorizontalAlignmentFlags.LeftAndRight ||
          verticalAlignment === VerticalAlignmentFlags.TopAndBottom
        ) {
          this._calSize();
          this._calRect();
          selfRectDirty = true;
        }
        this._calPosition();
        this._setDirtyFlagTrue(UITransformModifyFlags.LocalMatrix);
        flags |= UITransformModifyFlags.WmWp;
      }
    }
    const containDirtyFlags = this._isContainDirtyFlags(flags);
    !containDirtyFlags && this._worldAssociatedChange(flags);
    if (selfRectDirty || !containDirtyFlags) {
      const children = this.entity.children;
      for (let i = 0, n = children.length; i < n; i++) {
        (children[i].transform as unknown as UITransform)?._updateWorldFlagWithParentRectChange?.(flags, selfRectDirty);
      }
    }
  }
}

/**
 * @internal
 * extends TransformModifyFlags
 */
export enum UITransformModifyFlags {
  None = 0x0,
  LocalEuler = 0x1,
  LocalQuat = 0x2,
  WorldPosition = 0x4,
  LocalMatrix = 0x40,
  WorldMatrix = 0x80,
  Size = 0x200,
  Pivot = 0x400,

  /** World matrix | world position. */
  WmWp = WorldMatrix | WorldPosition,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat | WorldScale | WorldUniformScaling */
  WmWpWeWqWsWus = 0x1bc
}
