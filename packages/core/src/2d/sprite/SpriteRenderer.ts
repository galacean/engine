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
import { Sprite } from "./Sprite";
import { CallBackUpdateFlag } from "./SpriteUpdateFlag";
import { IAssembler } from "../assembler/IAssembler";
import { SpriteDirtyFlag } from "../enums/SpriteDirtyFlag";
import { SpriteDrawMode } from "../enums/SpriteDrawMode";
import { SpriteSimple } from "../assembler/SpriteSimple";

/**
 * Renders a Sprite for 2D graphics.
 */
export class SpriteRenderer extends Renderer implements ICustomClone {
  /** @internal */
  static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_spriteTexture");
  /** @internal */
  /** Conversion of space units to pixel units. */
  static _pixelPerUnit: number = 100;

  /** @internal */
  /** Render data. */
  _renderData: RenderData2D;

  /** Draw mode. */
  private _drawMode: SpriteDrawMode = SpriteDrawMode.Simple;
  private _assembler: IAssembler = SpriteSimple;

  @deepClone
  private _color: Color = new Color(1, 1, 1, 1);

  /** About sprite. */
  @ignoreClone
  private _sprite: Sprite = null;
  @ignoreClone
  private _spriteChangeFlag: CallBackUpdateFlag = null;

  /** About transform. */
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
   * The draw mode of the sprite.
   */
  get drawMode(): SpriteDrawMode {
    return this._drawMode;
  }

  set drawMode(drawMode: SpriteDrawMode) {
    if (this._drawMode !== drawMode) {
      this._drawMode = drawMode;
      switch (drawMode) {
        case SpriteDrawMode.Simple:
          this._assembler = SpriteSimple;
          break;
        case SpriteDrawMode.Sliced:
          break;
        default:
          break;
      }
      this._setDirtyFlagTrue(DirtyFlag.Position | DirtyFlag.UV);
    }
  }

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
        if (value.texture) {
          this.shaderData.setTexture(SpriteRenderer._textureProperty, value.texture);
          // Set default size.
          this.width = value.width / SpriteRenderer._pixelPerUnit;
          this.height = value.height / SpriteRenderer._pixelPerUnit;
          console.log(this.width, this.height);
        }
        this._setDirtyFlagTrue(DirtyFlag.Position | DirtyFlag.UV);
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
    const { x, y } = value;
    if (pivot === value || pivot.x !== x || pivot.y !== y) {
      pivot.setValue(x, y);
    }
    this._setDirtyFlagTrue(DirtyFlag.Position);
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
      this._setDirtyFlagTrue(DirtyFlag.Color);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  /**
   * The bounding volume of the spriteRenderer.
   */
  get bounds(): BoundingBox {
    if (this._transformChangeFlag.flag || this._isContainDirtyFlag(DirtyFlag.Position)) {
      if (!this._renderData) {
        this._assembler.resetData(this);
      }
      this._assembler.updatePositions(this);
      this._setDirtyFlagFalse(DirtyFlag.Position);
      this._transformChangeFlag.flag = false;
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
    // Update position.
    if (this._transformChangeFlag.flag || this._isContainDirtyFlag(DirtyFlag.Position)) {
      this._assembler.updatePositions(this);
      this._setDirtyFlagFalse(DirtyFlag.Position);
      this._transformChangeFlag.flag = false;
    }

    // Update uv.
    if (this._isContainDirtyFlag(DirtyFlag.UV)) {
      this._assembler.updateUVs(this);
      this._setDirtyFlagFalse(DirtyFlag.UV);
    }

    // Update color.
    if (this._isContainDirtyFlag(DirtyFlag.Color)) {
      this._assembler.updateColor(this);
      this._setDirtyFlagFalse(DirtyFlag.Color);
    }

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
    this._pivot = null;
    this._color = null;
    this._sprite = null;
    this._assembler = null;
    this._renderData = null;
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

  private _onSpriteChange(dirtyFlag: SpriteDirtyFlag) {
    switch (dirtyFlag) {
      case SpriteDirtyFlag.texture:
        // Update shader data.
        this.sprite.texture && this.shaderData.setTexture(SpriteRenderer._textureProperty, this.sprite.texture);
        break;
      case SpriteDirtyFlag.border:
        this._drawMode === SpriteDrawMode.Sliced && this._setDirtyFlagTrue(DirtyFlag.UV);
        break;
      case SpriteDirtyFlag.region:
      case SpriteDirtyFlag.atlas:
        this._setDirtyFlagTrue(DirtyFlag.Position | DirtyFlag.UV);
        break;
      default:
        break;
    }
  }

  private _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  private _setDirtyFlagFalse(type: number): void {
    this._dirtyFlag &= ~type;
  }

  private _setDirtyFlagTrue(type: number): void {
    this._dirtyFlag |= type;
  }
}

enum DirtyFlag {
  Position = 0x1,
  UV = 0x2,
  Color = 0x4,
  All = 0x7
}
