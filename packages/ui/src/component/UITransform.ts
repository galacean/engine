import {
  Entity,
  MathUtil,
  Rect,
  Transform,
  TransformModifyFlags,
  Vector2,
  deepClone,
  ignoreClone
} from "@galacean/engine";
import { HorizontalAlignmentMode } from "../enums/HorizontalAlignmentMode";
import { VerticalAlignmentMode } from "../enums/VerticalAlignmentMode";

/**
 * The Transform component exclusive to the UI element.
 */
export class UITransform extends Transform {
  @deepClone
  private _size = new Vector2(100, 100);
  @deepClone
  private _pivot = new Vector2(0.5, 0.5);
  @ignoreClone
  private _rect = new Rect(-50, -50, 100, 100);

  private _alignLeft = 0;
  private _alignRight = 0;
  private _alignCenter = 0;
  private _alignTop = 0;
  private _alignBottom = 0;
  private _alignMiddle = 0;
  private _horizontalAlignment = HorizontalAlignmentMode.None;
  private _verticalAlignment = VerticalAlignmentMode.None;

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
   * Horizontal alignment mode.
   *
   * @remarks
   * Controls how the element aligns horizontally within its parent:
   * - `Left` - Align to parent's left edge
   * - `Center` - Align to parent's horizontal center
   * - `Right` - Align to parent's right edge
   * - `LeftAndRight` - Align to both left and right edges (stretch to fill width)
   */
  get horizontalAlignment(): HorizontalAlignmentMode {
    return this._horizontalAlignment;
  }

  set horizontalAlignment(value: HorizontalAlignmentMode) {
    if (this._horizontalAlignment === value) return;
    this._horizontalAlignment = value;
    switch (value) {
      case HorizontalAlignmentMode.Left:
      case HorizontalAlignmentMode.Right:
      case HorizontalAlignmentMode.Center:
        this._onPositionChanged();
        break;
      case HorizontalAlignmentMode.LeftAndRight:
        this._onPositionChanged();
        this._onSizeChanged();
        break;
      default:
        break;
    }
  }

  /**
   * Left margin when horizontalAlignment is Left or LeftAndRight.
   *
   * @remarks
   * Only effective when horizontalAlignment includes Left mode.
   * Distance from the parent's left edge to the element's left edge.
   */
  get alignLeft(): number {
    return this._alignLeft;
  }

  set alignLeft(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._alignLeft)) return;
    this._alignLeft = value;
    if (this._horizontalAlignment & HorizontalAlignmentMode.Left) {
      this._onPositionChanged();
      this._horizontalAlignment & HorizontalAlignmentMode.Right && this._onSizeChanged();
    }
  }

  /**
   * Right margin when horizontalAlignment is Right or LeftAndRight.
   *
   * @remarks
   * Only effective when horizontalAlignment includes Right mode.
   * Distance from the parent's right edge to the element's right edge.
   */
  get alignRight(): number {
    return this._alignRight;
  }

  set alignRight(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._alignRight)) return;
    this._alignRight = value;
    if (this._horizontalAlignment & HorizontalAlignmentMode.Right) {
      this._onPositionChanged();
      this._horizontalAlignment & HorizontalAlignmentMode.Left && this._onSizeChanged();
    }
  }

  /**
   * Horizontal center offset when horizontalAlignment is Center.
   *
   * @remarks
   * Only effective when horizontalAlignment is Center mode.
   * Positive values move the element to the right, negative values to the left.
   */
  get alignCenter(): number {
    return this._alignCenter;
  }

  set alignCenter(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._alignCenter)) return;
    this._alignCenter = value;
    this._horizontalAlignment & HorizontalAlignmentMode.Center && this._onPositionChanged();
  }

  /**
   * Vertical alignment mode.
   *
   * @remarks
   * Controls how the element aligns vertically within its parent:
   * - `Top` - Align to parent's top edge
   * - `Middle` - Align to parent's vertical center
   * - `Bottom` - Align to parent's bottom edge
   * - `TopAndBottom` - Align to both top and bottom edges (stretch to fill height)
   */
  get verticalAlignment(): VerticalAlignmentMode {
    return this._verticalAlignment;
  }

  set verticalAlignment(value: VerticalAlignmentMode) {
    if (this._verticalAlignment === value) return;
    this._verticalAlignment = value;
    switch (value) {
      case VerticalAlignmentMode.Top:
      case VerticalAlignmentMode.Bottom:
      case VerticalAlignmentMode.Middle:
        this._onPositionChanged();
        break;
      case VerticalAlignmentMode.TopAndBottom:
        this._onPositionChanged();
        this._onSizeChanged();
        break;
      default:
        break;
    }
  }

  /**
   * Top margin when verticalAlignment is Top or TopAndBottom.
   *
   * @remarks
   * Only effective when verticalAlignment includes Top mode.
   * Used to offset the element from the parent's top edge.
   */
  get alignTop(): number {
    return this._alignTop;
  }

  set alignTop(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._alignTop)) return;
    this._alignTop = value;
    if (this._verticalAlignment & VerticalAlignmentMode.Top) {
      this._onPositionChanged();
      this._verticalAlignment & VerticalAlignmentMode.Bottom && this._onSizeChanged();
    }
  }

  /**
   * Bottom inset used in vertical alignment formulas.
   */
  get alignBottom(): number {
    return this._alignBottom;
  }

  set alignBottom(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._alignBottom)) return;
    this._alignBottom = value;
    if (this._verticalAlignment & VerticalAlignmentMode.Bottom) {
      this._onPositionChanged();
      this._verticalAlignment & VerticalAlignmentMode.Top && this._onSizeChanged();
    }
  }

  /**
   * Vertical middle offset relative to parent's middle.
   */
  get alignMiddle(): number {
    return this._alignMiddle;
  }

  set alignMiddle(value: number) {
    if (!Number.isFinite(value)) return;
    if (MathUtil.equals(value, this._alignMiddle)) return;
    this._alignMiddle = value;
    this._verticalAlignment & VerticalAlignmentMode.Middle && this._onPositionChanged();
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
    this._updateWorldFlagWithParentRectChange(TransformModifyFlags.WmWpWeWqWsWus);
  }

  // @ts-ignore
  override _cloneTo(target: UITransform, srcRoot: Entity, targetRoot: Entity): void {
    // @ts-ignore
    super._cloneTo(target, srcRoot, targetRoot);
    target.size.copyFrom(this._size);
    target.pivot.copyFrom(this._pivot);
  }

  protected override _onLocalMatrixChanging(): void {
    // `super._onLocalMatrixChanging()` will set `LocalMatrix` dirty flag `false`
    // If there is an alignment, `position` and `localMatrix` will be reset again
    if (this._horizontalAlignment || this._verticalAlignment) {
      this._updatePositionByAlignment();
      this._setDirtyFlagTrue(TransformModifyFlags.LocalMatrix);
    } else {
      super._onLocalMatrixChanging();
    }
  }

  protected override _onWorldMatrixChanging(): void {
    // `super._onWorldMatrixChanging()` will set `WorldMatrix` dirty flag `false`
    // If there is an alignment, `position` and `worldMatrix` will be reset again(`worldMatrix` dirty flag is already `true`)
    !this._horizontalAlignment && !this._verticalAlignment && super._onWorldMatrixChanging();
  }

  @ignoreClone
  protected override _onPositionChanged(): void {
    (this._horizontalAlignment || this._verticalAlignment) && this._updatePositionByAlignment();
    super._onPositionChanged();
  }

  @ignoreClone
  protected override _onWorldPositionChanged(): void {
    super._onWorldPositionChanged();
    if (this._horizontalAlignment || this._verticalAlignment) {
      this._setDirtyFlagTrue(TransformModifyFlags.WorldPosition);
    }
  }

  private _updatePositionByAlignment(): void {
    const parentRect = (this._getParentTransform() as UITransform)?._rect;
    if (parentRect) {
      const position = this.position;
      // @ts-ignore
      position._onValueChanged = null;
      const rect = this._rect;
      switch (this._horizontalAlignment) {
        case HorizontalAlignmentMode.Left:
        case HorizontalAlignmentMode.LeftAndRight:
          position.x = parentRect.x - rect.x + this._alignLeft;
          break;
        case HorizontalAlignmentMode.Center:
          position.x = parentRect.x + parentRect.width * 0.5 - rect.x - rect.width * 0.5 + this._alignCenter;
          break;
        case HorizontalAlignmentMode.Right:
          position.x = parentRect.x + parentRect.width - rect.x - rect.width - this._alignRight;
          break;
        default:
          break;
      }
      switch (this._verticalAlignment) {
        case VerticalAlignmentMode.Top:
          position.y = parentRect.y + parentRect.height - rect.y - rect.height - this._alignTop;
          break;
        case VerticalAlignmentMode.Middle:
          position.y = parentRect.y + parentRect.height * 0.5 - rect.y - rect.height * 0.5 + this._alignMiddle;
          break;
        case VerticalAlignmentMode.Bottom:
        case VerticalAlignmentMode.TopAndBottom:
          position.y = parentRect.y - rect.y + this._alignBottom;
          break;
        default:
          break;
      }
      // @ts-ignore
      position._onValueChanged = this._onPositionChanged;
    }
  }

  private _updateSizeByAlignment(): void {
    const parentRect = (this._getParentTransform() as UITransform)?._rect;
    if (parentRect) {
      const size = this._size;
      // @ts-ignore
      size._onValueChanged = null;
      // The values of size must be greater than 0
      if (this._horizontalAlignment === HorizontalAlignmentMode.LeftAndRight) {
        size.x = Math.max(parentRect.width - this._alignLeft - this._alignRight, 0);
      }
      if (this._verticalAlignment === VerticalAlignmentMode.TopAndBottom) {
        size.y = Math.max(parentRect.height - this._alignTop - this._alignBottom, 0);
      }
      // @ts-ignore
      size._onValueChanged = this._onSizeChanged;
    }
  }

  private _updateRectBySizeAndPivot(): void {
    const { size, _pivot: pivot } = this;
    const x = -pivot.x * size.x;
    const y = -pivot.y * size.y;
    this._rect.set(x, y, size.x, size.y);
  }

  @ignoreClone
  private _onSizeChanged(): void {
    if (
      this._horizontalAlignment === HorizontalAlignmentMode.LeftAndRight ||
      this._verticalAlignment === VerticalAlignmentMode.TopAndBottom
    ) {
      this._updateSizeByAlignment();
    }
    this._updateRectBySizeAndPivot();
    this._updateWorldFlagWithSelfRectChange();
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Size);
  }

  @ignoreClone
  private _onPivotChanged(): void {
    this._updateRectBySizeAndPivot();
    this._updateWorldFlagWithSelfRectChange();
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Pivot);
  }

  private _updateWorldFlagWithSelfRectChange(): void {
    let worldFlags = 0;
    if (this._horizontalAlignment || this._verticalAlignment) {
      this._updatePositionByAlignment();
      this._setDirtyFlagTrue(TransformModifyFlags.LocalMatrix);
      worldFlags = TransformModifyFlags.WmWp;
      !this._isContainDirtyFlags(worldFlags) && this._worldAssociatedChange(worldFlags);
    }
    const children = this.entity.children;
    for (let i = 0, n = children.length; i < n; i++) {
      (children[i].transform as UITransform)?._updateWorldFlagWithParentRectChange?.(worldFlags);
    }
  }

  private _updateWorldFlagWithParentRectChange(flags: number, parentChange: boolean = true): void {
    let selfChange = false;
    if (parentChange) {
      const { _horizontalAlignment: horizontalAlignment, _verticalAlignment: verticalAlignment } = this;
      if (horizontalAlignment || verticalAlignment) {
        if (
          horizontalAlignment === HorizontalAlignmentMode.LeftAndRight ||
          verticalAlignment === VerticalAlignmentMode.TopAndBottom
        ) {
          this._updateSizeByAlignment();
          this._updateRectBySizeAndPivot();
          selfChange = true;
        }
        this._updatePositionByAlignment();
        this._setDirtyFlagTrue(TransformModifyFlags.LocalMatrix);
        flags |= TransformModifyFlags.WmWp;
      }
    }
    const containDirtyFlags = this._isContainDirtyFlags(flags);
    !containDirtyFlags && this._worldAssociatedChange(flags);
    if (selfChange || !containDirtyFlags) {
      const children = this.entity.children;
      for (let i = 0, n = children.length; i < n; i++) {
        (children[i].transform as UITransform)?._updateWorldFlagWithParentRectChange?.(flags, selfChange);
      }
    }
    // @ts-ignore
    selfChange && this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Size);
  }
}

/**
 * @internal
 * extends TransformModifyFlags
 */
export enum UITransformModifyFlags {
  Size = 0x200,
  Pivot = 0x400
}
