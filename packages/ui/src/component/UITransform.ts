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
  private _rect: Rect = new Rect(-50, -50, 100, 100);

  private _left: number = 0;
  private _right: number = 0;
  private _center: number = 0;
  private _top: number = 0;
  private _bottom: number = 0;
  private _middle: number = 0;
  private _horizontalAlignment: UIHorizontalAlignmentFlags = UIHorizontalAlignmentFlags.None;
  private _verticalAlignment: UIVerticalAlignmentFlags = UIVerticalAlignmentFlags.None;

  /**
   * Width and height of UI element.
   */
  get size(): Vector2 {
    if (this._isContainDirtyFlag(UITransformModifyFlags.Size)) {
      const parentRect = (this._getParentTransform() as unknown as UITransform)?._getLocalRect?.();
      if (parentRect) {
        const size = this._size;
        // @ts-ignore
        size._onValueChanged = null;
        if (this._horizontalAlignment === UIHorizontalAlignmentFlags.LeftAndRight) {
          size.x = parentRect.width - this._left - this._right;
        }
        if (this._verticalAlignment === UIVerticalAlignmentFlags.TopAndBottom) {
          size.y = parentRect.height - this._top - this._bottom;
        }
        // @ts-ignore
        size._onValueChanged = this._onSizeChanged;
      }
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
   * Horizontal alignment mode: Left/Center/Right or LeftAndRight (stretch).
   */
  get horizontalAlignment(): UIHorizontalAlignmentFlags {
    return this._horizontalAlignment;
  }

  set horizontalAlignment(value: UIHorizontalAlignmentFlags) {
    const current = this._horizontalAlignment;
    if (current === value) return;
    this._horizontalAlignment = value;
    switch (value) {
      case UIHorizontalAlignmentFlags.Left:
      case UIHorizontalAlignmentFlags.Right:
      case UIHorizontalAlignmentFlags.Center:
        this._onPositionChanged();
        break;
      case UIHorizontalAlignmentFlags.LeftAndRight:
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
    if (this._horizontalAlignment & UIHorizontalAlignmentFlags.Left) {
      this._onPositionChanged();
      this._horizontalAlignment & UIHorizontalAlignmentFlags.Right && this._onSizeChanged();
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
    if (this._horizontalAlignment & UIHorizontalAlignmentFlags.Right) {
      this._onPositionChanged();
      this._horizontalAlignment & UIHorizontalAlignmentFlags.Left && this._onSizeChanged();
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
    this._horizontalAlignment & UIHorizontalAlignmentFlags.Center && this._onPositionChanged();
  }

  /**
   * Horizontal alignment mode: Left/Center/Right or LeftAndRight (stretch).
   */
  get verticalAlignment(): UIVerticalAlignmentFlags {
    return this._verticalAlignment;
  }

  set verticalAlignment(value: UIVerticalAlignmentFlags) {
    const current = this._verticalAlignment;
    if (current === value) return;
    this._verticalAlignment = value;
    switch (value) {
      case UIVerticalAlignmentFlags.Top:
      case UIVerticalAlignmentFlags.Bottom:
      case UIVerticalAlignmentFlags.Middle:
        this._onPositionChanged();
        break;
      case UIVerticalAlignmentFlags.TopAndBottom:
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
    if (this._verticalAlignment & UIVerticalAlignmentFlags.Top) {
      this._onPositionChanged();
      this._verticalAlignment & UIVerticalAlignmentFlags.Bottom && this._onSizeChanged();
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
    if (this._verticalAlignment & UIVerticalAlignmentFlags.Bottom) {
      this._onPositionChanged();
      this._verticalAlignment & UIVerticalAlignmentFlags.Top && this._onSizeChanged();
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
    this._verticalAlignment & UIVerticalAlignmentFlags.Middle && this._onPositionChanged();
  }

  /**
   * Local position.
   */
  override get position(): Vector3 {
    if (this._isContainDirtyFlag(UITransformModifyFlags.LocalPosition)) {
      const parentRect = (this._getParentTransform() as unknown as UITransform)?._getLocalRect?.();
      if (!!parentRect) {
        const position = this._position;
        // @ts-ignore
        position._onValueChanged = null;
        const localRect = this._getLocalRect();
        switch (this.horizontalAlignment) {
          case UIHorizontalAlignmentFlags.Left:
          case UIHorizontalAlignmentFlags.LeftAndRight:
            position.x = parentRect.x - localRect.x + this._left;
            break;
          case UIHorizontalAlignmentFlags.Center:
            position.x = parentRect.x + parentRect.width * 0.5 - localRect.x - localRect.width * 0.5 + this._center;
            break;
          case UIHorizontalAlignmentFlags.Right:
            position.x = parentRect.x + parentRect.width - localRect.x - localRect.width - this._right;
            break;
          default:
            break;
        }
        switch (this.verticalAlignment) {
          case UIVerticalAlignmentFlags.Top:
            position.y = parentRect.y + parentRect.height - localRect.y - localRect.height - this._top;
            break;
          case UIVerticalAlignmentFlags.Middle:
            position.y = parentRect.y + parentRect.height * 0.5 - localRect.y - localRect.height * 0.5 + this._middle;
            break;
          case UIVerticalAlignmentFlags.Bottom:
          case UIVerticalAlignmentFlags.TopAndBottom:
            position.y = parentRect.y - localRect.y + this._bottom;
            break;
          default:
            break;
        }
        // @ts-ignore
        position._onValueChanged = this._onPositionChanged;
      }
      this._setDirtyFlagFalse(UITransformModifyFlags.LocalPosition);
    }
    return this._position;
  }

  override set position(value: Vector3) {
    if (this._position !== value) {
      this._position.copyFrom(value);
    }
  }

  /**
   * Local matrix.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  override get localMatrix(): Matrix {
    if (this._isContainDirtyFlag(UITransformModifyFlags.LocalMatrix)) {
      Matrix.affineTransformation(this._scale, this.rotationQuaternion, this.position, this._localMatrix);
      this._setDirtyFlagFalse(UITransformModifyFlags.LocalMatrix);
    }
    return this._localMatrix;
  }

  override set localMatrix(value: Matrix) {
    if (this._localMatrix !== value) {
      this._localMatrix.copyFrom(value);
    }
    const { _position: position, _rotationQuaternion: rotationQuaternion, _scale: scale } = this;
    // @ts-ignore
    position._onValueChanged = rotationQuaternion._onValueChanged = scale._onValueChanged = null;
    value.decompose(position, rotationQuaternion, scale);
    // @ts-ignore
    position._onValueChanged = this._onPositionChanged;
    // @ts-ignore
    rotationQuaternion._onValueChanged = this._onRotationQuaternionChanged;
    // @ts-ignore
    scale._onValueChanged = this._onScaleChanged;
    const localUniformScaling = scale.x === scale.y && scale.y === scale.z;
    if (this._localUniformScaling !== localUniformScaling) {
      this._localUniformScaling = localUniformScaling;
      this._updateAllWorldFlag(UITransformModifyFlags.WmWpWeWqWsWus);
    } else {
      this._updateAllWorldFlag(UITransformModifyFlags.WmWpWeWqWs);
    }
    this._setDirtyFlagTrue(UITransformModifyFlags.LocalEuler);
    this._setDirtyFlagFalse(UITransformModifyFlags.LocalQuat);
    if (!!this._horizontalAlignment || !!this._verticalAlignment) {
      this._setDirtyFlagTrue(UITransformModifyFlags.LmLp);
    } else {
      this._setDirtyFlagFalse(UITransformModifyFlags.LmLp);
    }
  }

  /**
   * World matrix.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  override get worldMatrix(): Matrix {
    if (this._isContainDirtyFlag(UITransformModifyFlags.WorldMatrix)) {
      const parent = this._getParentTransform();
      if (parent) {
        Matrix.multiply(parent.worldMatrix, this.localMatrix, this._worldMatrix);
      } else {
        this._worldMatrix.copyFrom(this.localMatrix);
      }
      this._setDirtyFlagFalse(UITransformModifyFlags.WorldMatrix);
    }
    return this._worldMatrix;
  }

  override set worldMatrix(value: Matrix) {
    if (this._worldMatrix !== value) {
      this._worldMatrix.copyFrom(value);
    }
    const parent = this._getParentTransform();
    if (parent) {
      Matrix.invert(parent.worldMatrix, Transform._tempMat42);
      Matrix.multiply(Transform._tempMat42, value, this._localMatrix);
    } else {
      this._localMatrix.copyFrom(value);
    }
    this.localMatrix = this._localMatrix;
    if (!!this._horizontalAlignment || !!this._verticalAlignment) {
      this._setDirtyFlagTrue(UITransformModifyFlags.WorldMatrix);
    } else {
      this._setDirtyFlagFalse(UITransformModifyFlags.WorldMatrix);
    }
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
  protected override _parentChange(): void {
    this._isParentDirty = true;
    this._transferFlagsWithLocalRectDirty(UITransformModifyFlags.LrWmWpWeWqWsWus);
  }

  private _transferFlagsWithLocalRectDirty(flags: UITransformModifyFlags): void {
    if (flags & UITransformModifyFlags.LocalRect) {
      if (!!this._horizontalAlignment || !!this._verticalAlignment) {
        flags |= UITransformModifyFlags.WmWp;
        this._setDirtyFlagTrue(UITransformModifyFlags.LmLp);
        if (
          this._horizontalAlignment === UIHorizontalAlignmentFlags.LeftAndRight ||
          this._verticalAlignment === UIVerticalAlignmentFlags.TopAndBottom
        ) {
          this._setDirtyFlagTrue(UITransformModifyFlags.Size);
          // @ts-ignore
          this.entity._updateFlagManager.dispatch(UITransformModifyFlags.Size);
        } else {
          flags &= ~UITransformModifyFlags.LocalRect;
        }
      } else {
        flags &= ~UITransformModifyFlags.LocalRect;
      }
    }
    if (!this._isContainDirtyFlags(flags)) {
      this._setDirtyFlagTrue(flags & UITransformModifyFlags.LocalRect);
      const worldFlags = flags & ~UITransformModifyFlags.LocalRect;
      !this._isContainDirtyFlags(worldFlags) && this._worldAssociatedChange(worldFlags);
      const children = this.entity.children;
      for (let i = 0, n = children.length; i < n; i++) {
        (children[i].transform as unknown as UITransform)?._transferFlagsWithLocalRectDirty?.(flags);
      }
    }
  }

  private _getLocalRect(): Rect {
    if (this._isContainDirtyFlag(UITransformModifyFlags.LocalRect)) {
      const { size, _pivot: pivot, _rect: localRect } = this;
      const x = -pivot.x * size.x;
      const y = -pivot.y * size.y;
      localRect.set(x, y, size.x, size.y);
      this._setDirtyFlagFalse(UITransformModifyFlags.LocalRect);
    }
    return this._rect;
  }

  @ignoreClone
  protected override _onPositionChanged(): void {
    super._onPositionChanged();
    if (!!this._horizontalAlignment || !!this._verticalAlignment) {
      this._setDirtyFlagTrue(UITransformModifyFlags.LocalPosition);
    } else {
      this._setDirtyFlagFalse(UITransformModifyFlags.LocalPosition);
    }
  }

  @ignoreClone
  protected override _onWorldPositionChanged(): void {
    super._onWorldPositionChanged();
    if (!!this._horizontalAlignment || !!this._verticalAlignment) {
      this._setDirtyFlagTrue(UITransformModifyFlags.WorldPosition);
    }
  }

  @ignoreClone
  private _onSizeChanged(): void {
    if (!this._isContainDirtyFlag(UITransformModifyFlags.Size)) {
      if (
        this._horizontalAlignment === UIHorizontalAlignmentFlags.LeftAndRight ||
        this._verticalAlignment === UIVerticalAlignmentFlags.TopAndBottom
      ) {
        this._setDirtyFlagTrue(UITransformModifyFlags.Size);
      }
      this._setLocalRectDirty();
    }
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Size);
  }

  @ignoreClone
  private _onPivotChanged(): void {
    this._setLocalRectDirty();
    // @ts-ignore
    this._entity._updateFlagManager.dispatch(UITransformModifyFlags.Pivot);
  }

  private _setLocalRectDirty(): void {
    if (!this._isContainDirtyFlag(UITransformModifyFlags.LocalRect)) {
      this._setDirtyFlagTrue(UITransformModifyFlags.LocalRect);
      const children = this.entity.children;
      for (let i = 0, n = children.length; i < n; i++) {
        (children[i].transform as unknown as UITransform)?._transferFlagsWithLocalRectDirty?.(UITransformModifyFlags.LocalRect);
      }
    }
  }
}

/**
 * @internal
 * extends TransformModifyFlags
 */
export enum UITransformModifyFlags {
  LocalEuler = 0x1,
  LocalQuat = 0x2,
  WorldPosition = 0x4,
  LocalMatrix = 0x40,
  WorldMatrix = 0x80,
  Size = 0x200,
  Pivot = 0x400,
  LocalPosition = 0x800,
  LocalRect = 0x1000,

  LsLr = Size | LocalRect,
  /** Local matrix | local position. */
  LmLp = LocalMatrix | LocalPosition,
  /** Local rect | World matrix | world position. */
  LrWmWp = LocalRect | WorldMatrix | WorldPosition,
  /** World matrix | world position. */
  WmWp = WorldMatrix | WorldPosition,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat | WorldScale */
  WmWpWeWqWs = 0xbc,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat | WorldScale | WorldUniformScaling */
  WmWpWeWqWsWus = 0x1bc,
  /** Local rect | World matrix | world position | world Euler | world quaternion | world scale | world uniform scaling */
  LrWmWpWeWqWsWus = 0x11bc
}

export enum UIHorizontalAlignmentFlags {
  None = 0,
  Left = 0x1,
  Right = 0x2,
  LeftAndRight = 0x3,
  Center = 0x4
}

export enum UIVerticalAlignmentFlags {
  None = 0,
  Top = 0x1,
  Bottom = 0x2,
  TopAndBottom = 0x3,
  Middle = 0x4
}
