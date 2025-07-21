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
  private _alignment: UITransformAlignmentFlags = UITransformAlignmentFlags.None;

  override get position(): Vector3 {
    if (this._isContainDirtyFlag(UITransformModifyFlags.LocalPosition)) {
      const parentRect = (this._getParentTransform() as unknown as UITransform)?._getLocalRect?.();
      if (!!parentRect) {
        const { _position: position, _alignment: alignment } = this;
        // @ts-ignore
        position._onValueChanged = null;
        const localRect = this._getLocalRect();
        switch (alignment & UITransformAlignmentFlags.Horizontal) {
          case UITransformAlignmentFlags.Left:
          case UITransformAlignmentFlags.LeftAndRight:
            position.x = parentRect.x - localRect.x + this._left;
            break;
          case UITransformAlignmentFlags.Center:
            position.x = parentRect.x + parentRect.width * 0.5 - localRect.x - localRect.width * 0.5 + this._center;
            break;
          case UITransformAlignmentFlags.Right:
            position.x = parentRect.x + parentRect.width - localRect.x - localRect.width - this._right;
            break;
          default:
            break;
        }
        switch (alignment & UITransformAlignmentFlags.Vertical) {
          case UITransformAlignmentFlags.Top:
            position.y = parentRect.y + parentRect.height - localRect.y - localRect.height - this._top;
            break;
          case UITransformAlignmentFlags.Middle:
            position.y = parentRect.y + parentRect.height * 0.5 - localRect.y - localRect.height * 0.5 + this._middle;
            break;
          case UITransformAlignmentFlags.Bottom:
          case UITransformAlignmentFlags.TopAndBottom:
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
    if (!!this._alignment) {
      this._setDirtyFlagTrue(UITransformModifyFlags.LpLm);
    } else {
      this._setDirtyFlagFalse(UITransformModifyFlags.LpLm);
    }
  }

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
    if (!!this._alignment) {
      this._setDirtyFlagTrue(UITransformModifyFlags.WorldMatrix);
    } else {
      this._setDirtyFlagFalse(UITransformModifyFlags.WorldMatrix);
    }
  }

  get left(): number {
    return this._left;
  }

  set left(value: number) {
    if (MathUtil.equals(value, this._left)) return;
    this._left = value;
    let horizontalAlignment = this._alignment & UITransformAlignmentFlags.Horizontal;
    if (Number.isFinite(value)) {
      this._center = NaN;
      horizontalAlignment = (horizontalAlignment | UITransformAlignmentFlags.Left) & ~UITransformAlignmentFlags.Center;
    } else {
      horizontalAlignment &= ~UITransformAlignmentFlags.Left;
    }
    this._setHorizontalAlignment(horizontalAlignment);
  }

  get right(): number {
    return this._right;
  }

  set right(value: number) {
    if (MathUtil.equals(value, this._right)) return;
    this._right = value;
    let horizontalAlignment = this._alignment & UITransformAlignmentFlags.Horizontal;
    if (Number.isFinite(value)) {
      this._center = NaN;
      horizontalAlignment = (horizontalAlignment | UITransformAlignmentFlags.Right) & ~UITransformAlignmentFlags.Center;
    } else {
      horizontalAlignment &= ~UITransformAlignmentFlags.Right;
    }
    this._setHorizontalAlignment(horizontalAlignment);
  }

  get center(): number {
    return this._center;
  }

  set center(value: number) {
    if (MathUtil.equals(value, this._center)) return;
    this._center = value;
    let horizontalAlignment = this._alignment & UITransformAlignmentFlags.Horizontal;
    if (Number.isFinite(value)) {
      this._left = this._right = NaN;
      horizontalAlignment =
        (horizontalAlignment | UITransformAlignmentFlags.Center) & ~UITransformAlignmentFlags.LeftAndRight;
    } else {
      horizontalAlignment &= ~UITransformAlignmentFlags.Center;
    }
    this._setHorizontalAlignment(horizontalAlignment);
  }

  get top(): number {
    return this._top;
  }

  set top(value: number) {
    if (MathUtil.equals(value, this._top)) return;
    this._top = value;
    let verticalAlignment = this._alignment & UITransformAlignmentFlags.Vertical;
    if (Number.isFinite(value)) {
      this._middle = NaN;
      verticalAlignment = (verticalAlignment | UITransformAlignmentFlags.Top) & ~UITransformAlignmentFlags.Middle;
    } else {
      verticalAlignment &= ~UITransformAlignmentFlags.Top;
    }
    this._setVerticalAlignment(verticalAlignment);
  }

  get bottom(): number {
    return this._bottom;
  }

  set bottom(value: number) {
    if (MathUtil.equals(value, this._bottom)) return;
    this._bottom = value;
    let verticalAlignment = this._alignment & UITransformAlignmentFlags.Vertical;
    if (Number.isFinite(value)) {
      this._middle = NaN;
      verticalAlignment = (verticalAlignment | UITransformAlignmentFlags.Bottom) & ~UITransformAlignmentFlags.Middle;
    } else {
      verticalAlignment &= ~UITransformAlignmentFlags.Bottom;
    }
    this._setVerticalAlignment(verticalAlignment);
  }

  get middle(): number {
    return this._middle;
  }

  set middle(value: number) {
    if (MathUtil.equals(value, this._middle)) return;
    this._middle = value;
    let verticalAlignment = this._alignment & UITransformAlignmentFlags.Vertical;
    if (Number.isFinite(value)) {
      this._top = this._bottom = NaN;
      verticalAlignment =
        (verticalAlignment | UITransformAlignmentFlags.Middle) & ~UITransformAlignmentFlags.TopAndBottom;
    } else {
      verticalAlignment &= ~UITransformAlignmentFlags.Middle;
    }
    this._setVerticalAlignment(verticalAlignment);
  }

  /**
   * Width and height of UI element.
   */
  get size(): Vector2 {
    if (this._isContainDirtyFlag(UITransformModifyFlags.Size)) {
      const parentRect = (this._getParentTransform() as unknown as UITransform)?._getLocalRect?.();
      if (parentRect) {
        const { _size: size, _alignment: alignment } = this;
        // @ts-ignore
        size._onValueChanged = null;
        if ((alignment & UITransformAlignmentFlags.Horizontal) === UITransformAlignmentFlags.LeftAndRight) {
          size.x = parentRect.width - this._left - this._right;
        }
        if ((alignment & UITransformAlignmentFlags.Vertical) === UITransformAlignmentFlags.TopAndBottom) {
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
    const alignment = this._alignment;
    if (!!alignment) {
      this._setDirtyFlagTrue(UITransformModifyFlags.LocalPosition);
      if (
        (alignment & UITransformAlignmentFlags.Horizontal) === UITransformAlignmentFlags.LeftAndRight ||
        (alignment & UITransformAlignmentFlags.Vertical) === UITransformAlignmentFlags.TopAndBottom
      ) {
        this._setLocalRectDirty(UITransformModifyFlags.LsLr);
      }
    }
  }

  private _setHorizontalAlignment(value: UITransformAlignmentFlags): void {
    this._alignment = (this._alignment & UITransformAlignmentFlags.Vertical) | value;
    if (!!value) {
      this._onPositionChanged();
      value === UITransformAlignmentFlags.LeftAndRight && this._onSizeChanged();
    }
  }

  private _setVerticalAlignment(value: UITransformAlignmentFlags): void {
    this._alignment = (this._alignment & UITransformAlignmentFlags.Horizontal) | value;
    if (!!value) {
      this._onPositionChanged();
      value === UITransformAlignmentFlags.TopAndBottom && this._onSizeChanged();
    }
  }

  private _getLocalRect(): Rect {
    if (this._isContainDirtyFlag(UITransformModifyFlags.LocalRect)) {
      const { size, _pivot: pivot, _localRect: localRect } = this;
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
      const alignment = transform?._alignment ?? UITransformAlignmentFlags.None;
      if (!!alignment) {
        transform._setDirtyFlagTrue(UITransformModifyFlags.LocalPosition);
        if (
          (alignment & UITransformAlignmentFlags.Horizontal) === UITransformAlignmentFlags.LeftAndRight ||
          (alignment & UITransformAlignmentFlags.Vertical) === UITransformAlignmentFlags.TopAndBottom
        ) {
          transform._setLocalRectDirty(UITransformModifyFlags.LsLr);
        }
      }
    }
  }

  @ignoreClone
  protected override _onPositionChanged(): void {
    super._onPositionChanged();
    if (!!this._alignment) {
      this._setDirtyFlagTrue(UITransformModifyFlags.LocalPosition);
    } else {
      this._setDirtyFlagFalse(UITransformModifyFlags.LocalPosition);
    }
  }

  @ignoreClone
  protected override _onWorldPositionChanged(): void {
    super._onWorldPositionChanged();
    !!this._alignment && this._setDirtyFlagTrue(UITransformModifyFlags.WorldPosition);
  }

  @ignoreClone
  private _onSizeChanged(): void {
    this._setLocalRectDirty(UITransformModifyFlags.LocalRect);
    const alignment = this._alignment;
    if (
      (alignment & UITransformAlignmentFlags.Horizontal) === UITransformAlignmentFlags.LeftAndRight ||
      (alignment & UITransformAlignmentFlags.Vertical) === UITransformAlignmentFlags.TopAndBottom
    ) {
      this._setDirtyFlagTrue(UITransformModifyFlags.Size);
    }
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
  LocalEuler = 0x1,
  LocalQuat = 0x2,
  WorldPosition = 0x4,
  LocalMatrix = 0x40,
  WorldMatrix = 0x80,
  Size = 0x200,
  Pivot = 0x400,
  LocalPosition = 0x800,
  LocalRect = 0x1000,

  /** Local size | local rect. */
  LsLr = Size | LocalRect,
  /** Local position | local matrix. */
  LpLm = LocalPosition | LocalMatrix,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat | WorldScale */
  WmWpWeWqWs = 0xbc,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat | WorldScale | WorldUniformScaling */
  WmWpWeWqWsWus = 0x1bc
}

enum UITransformAlignmentFlags {
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
