import { BoundingBox, Color, Matrix, Vector2, Vector3 } from "@oasis-engine/math";
import { Camera } from "../../Camera";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { ICustomClone } from "../../clone/ComponentCloner";
import { Entity } from "../../Entity";
import { Renderer } from "../../Renderer";
import { CompareFunction } from "../../shader/enums/CompareFunction";
import { Shader } from "../../shader/Shader";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { RenderData2D } from "../data/RenderData2D";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { SpriteSimple } from "../assembler/SpriteSimple";
import { Sprite } from "./Sprite";
import { CallBackUpdateFlag } from "./SpriteUpdateFlag";
import { IAssembler } from "../assembler/IAssembler";
import { SpriteDirtyFlag } from "../enums/SpriteDirtyFlag";

/**
 * Renders a Sprite for 2D graphics.
 */
export class SpriteRenderer extends Renderer implements ICustomClone {
  /** @internal */
  static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_spriteTexture");
  /** @internal */
  static _normalBoundingBox: BoundingBox = new BoundingBox(new Vector3(), new Vector3(1, 1, 0));

  /** @internal */
  /** Render data. */
  _renderData: RenderData2D;
  _assembler: IAssembler;

  @deepClone
  private _color: Color = new Color(1, 1, 1, 1);

  /** About sprite */
  @ignoreClone
  private _sprite: Sprite = null;
  @ignoreClone
  private _spriteChangeFlag: CallBackUpdateFlag = null;

  /** About transform. */
  /** ModelMatrix = WorldMatrix * Size * Flip * Pivot. */
  @deepClone
  private _modelMatrix: Matrix = new Matrix();
  @deepClone
  private _pivot: Vector2 = new Vector2(0.5, 0.5);
  @assignmentClone
  private _width: number = 1;
  @assignmentClone
  private _height: number = 1;
  @assignmentClone
  private _flipX: boolean = false;
  @assignmentClone
  private _flipY: boolean = false;

  /** About mask. */
  @assignmentClone
  private _maskLayer: number = SpriteMaskLayer.Layer0;
  @assignmentClone
  private _maskInteraction: SpriteMaskInteraction = SpriteMaskInteraction.None;

  /** Dirty flag. */
  @ignoreClone
  private _dirtyFlag: number = 0;

  /**
   * The Sprite to render.
   */
  get sprite(): Sprite {
    return this._sprite;
  }

  set sprite(value: Sprite | null) {
    if (this._sprite !== value) {
      this._spriteChangeFlag && this._spriteChangeFlag.destroy();
      this._sprite = value;
      if (value) {
        this._spriteChangeFlag = value._registerUpdateFlag();
        this._spriteChangeFlag.callBack = this._onSpriteChange;
        this.shaderData.setTexture(SpriteRenderer._textureProperty, value.texture);
        this._dirtyFlag = DirtyFlag.All;
      } else {
        this.shaderData.setTexture(SpriteRenderer._textureProperty, null);
      }
    }
  }

  /**
   * Location of the sprite's center point in the rectangle region, specified in normalized.
   * The origin is at the bottom left and the default value is (0.5, 0.5).
   */
  get pivot(): Vector2 {
    return this._pivot;
  }

  set pivot(value: Vector2) {
    const pivot = this._pivot;
    const { x, y } = pivot;
    if (pivot === value || pivot.x !== x || pivot.y !== y) {
      pivot.setValue(x, y);
    }
  }

  /**
   * Rendering color for the Sprite graphic.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    if (this._color !== value) {
      value.cloneTo(this._color);
    }
  }

  /**
   * Render width.
   */
  get width(): number {
    return this._width;
  }

  set width(val: number) {
    if (this._width !== val) {
      this._width = val;
      this._setDirtyFlagTrue(DirtyFlag.Model | DirtyFlag.Bounds);
    }
  }

  /**
   * Render height.
   */
  get height(): number {
    return this._height;
  }

  set height(val: number) {
    if (this._height !== val) {
      this._height = val;
      this._setDirtyFlagTrue(DirtyFlag.Model | DirtyFlag.Bounds);
    }
  }

  /**
   * Flips the sprite on the X axis.
   */
  get flipX(): boolean {
    return this._flipX;
  }

  set flipX(value: boolean) {
    if (this._flipX !== value) {
      this._flipX = value;
      this._setDirtyFlagTrue(DirtyFlag.Model | DirtyFlag.Bounds);
    }
  }

  /**
   * Flips the sprite on the Y axis.
   */
  get flipY(): boolean {
    return this._flipY;
  }

  set flipY(value: boolean) {
    if (this._flipY !== value) {
      this._flipY = value;
      this._setDirtyFlagTrue(DirtyFlag.Model | DirtyFlag.Bounds);
    }
  }

  /**
   * The bounding volume of the spriteRenderer.
   */
  get bounds(): BoundingBox {
    if (this._isContainDirtyFlag(DirtyFlag.Bounds)) {
      BoundingBox.transform(SpriteRenderer._normalBoundingBox, this._getModelMatrix(), this._bounds);
      this._setDirtyFlagFalse(DirtyFlag.Bounds);
    }
    return this._bounds;
  }

  /**
   * The mask layer the sprite renderer belongs to.
   */
  get maskLayer(): number {
    return this._maskLayer;
  }

  set maskLayer(value: number) {
    this._maskLayer = value;
  }

  /**
   * Interacts with the masks.
   */
  get maskInteraction(): SpriteMaskInteraction {
    return this._maskInteraction;
  }

  set maskInteraction(value: SpriteMaskInteraction) {
    if (this._maskInteraction !== value) {
      this._maskInteraction = value;
      this._updateStencilState();
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this.setMaterial(this._engine._spriteDefaultMaterial);
    this._transformChangeFlag.dispatch = this._onWorldMatrixChange.bind(this);
    this._onSpriteChange = this._onSpriteChange.bind(this);
  }

  /**
   * @internal
   */
  _render(camera: Camera): void {
    const { sprite } = this;
    if (!sprite || !sprite.texture) {
      return;
    }

    if (!this._renderData) {
      this._assembler.resetData(this);
    }

    // Update render data.
    this._assembler.updateData(this);

    // Push primitive.
    const spriteElement = this._engine._spriteElementPool.getFromPool();
    spriteElement.setValue(this, this._renderData, this.getMaterial());
    camera._renderPipeline.pushPrimitive(spriteElement);
  }

  /**
   * @internal
   */
  _cloneTo(target: SpriteRenderer): void {
    target.sprite = this._sprite;
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    this._spriteChangeFlag && this._spriteChangeFlag.destroy();
    super._onDestroy();
  }

  private _updateStencilState(): void {
    // Update stencil.
    const material = this.getInstanceMaterial();
    const stencilState = material.renderState.stencilState;
    const maskInteraction = this._maskInteraction;
    if (maskInteraction === SpriteMaskInteraction.None) {
      stencilState.enabled = false;
      stencilState.writeMask = 0xff;
      stencilState.referenceValue = 0;
      stencilState.compareFunctionFront = stencilState.compareFunctionBack = CompareFunction.Always;
    } else {
      stencilState.enabled = true;
      stencilState.writeMask = 0x00;
      stencilState.referenceValue = 1;
      const compare =
        maskInteraction === SpriteMaskInteraction.VisibleInsideMask
          ? CompareFunction.LessEqual
          : CompareFunction.Greater;
      stencilState.compareFunctionFront = compare;
      stencilState.compareFunctionBack = compare;
    }
  }

  private _getModelMatrix(): Matrix {
    if (this._isContainDirtyFlag(DirtyFlag.Model)) {
      // Update modelMatrix.
      const { _modelMatrix, _pivot } = this;
      const { elements: e } = _modelMatrix;
      this._entity.transform.worldMatrix.cloneTo(_modelMatrix);
      const sx = this._flipX ? -this._width : this._width;
      const sy = this._flipY ? -this._height : this._height;
      (e[0] *= sx), (e[1] *= sx), (e[2] *= sx);
      (e[4] *= sy), (e[5] *= sy), (e[6] *= sy);
      e[12] -= _pivot.x * e[0] + _pivot.y * e[4];
      e[13] -= _pivot.x * e[1] + _pivot.y * e[5];
      this._setDirtyFlagFalse(DirtyFlag.Model);
    }
    return this._modelMatrix;
  }

  private _onSpriteChange(dirtyFlag: SpriteDirtyFlag) {
    switch (dirtyFlag) {
      case SpriteDirtyFlag.texture:
        this.shaderData.setTexture(SpriteRenderer._textureProperty, this.sprite.texture);
        break;
      case SpriteDirtyFlag.positions:
        this._setDirtyFlagTrue(DirtyFlag.Position | DirtyFlag.Bounds);
        break;
      case SpriteDirtyFlag.uvs:
        this._setDirtyFlagTrue(DirtyFlag.UV);
        break;
      case SpriteDirtyFlag.uvsSliced:
        this._setDirtyFlagTrue(DirtyFlag.UV);
        break;
      default:
        break;
    }
  }

  private _onWorldMatrixChange() {
    this._setDirtyFlagTrue(DirtyFlag.Position | DirtyFlag.Bounds);
  }

  _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  _setDirtyFlagFalse(type: number): void {
    this._dirtyFlag &= ~type;
  }

  private _setDirtyFlagTrue(type: number): void {
    this._dirtyFlag |= type;
  }
}

enum DirtyFlag {
  Model = 0x1,
  UV = 0x2,
  Position = 0x4,
  Bounds = 0x8,
  All = 0x15
}
