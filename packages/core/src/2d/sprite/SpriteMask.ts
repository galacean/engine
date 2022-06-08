import { BoundingBox, Vector2, Vector3 } from "@oasis-engine/math";
import { BoolUpdateFlag } from "../../BoolUpdateFlag";
import { Camera } from "../../Camera";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { ICustomClone } from "../../clone/ComponentCloner";
import { Entity } from "../../Entity";
import { Renderer } from "../../Renderer";
import { SpriteMaskElement } from "../../RenderPipeline/SpriteMaskElement";
import { Shader } from "../../shader/Shader";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { UpdateFlag } from "../../UpdateFlag";
import { IAssembler } from "../assembler/IAssembler";
import { SpriteSimple } from "../assembler/SpriteSimple";
import { RenderData2D } from "../data/RenderData2D";
import { SpriteDirtyFlag } from "../enums/SpriteDirtyFlag";
import { SpriteDrawMode } from "../enums/SpriteDrawMode";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { Sprite } from "./Sprite";
import { SpriteRenderer } from "./SpriteRenderer";
import { CallBackUpdateFlag } from "./SpriteUpdateFlag";

/**
 * A component for masking Sprites.
 */
export class SpriteMask extends Renderer implements ICustomClone {
  /** @internal */
  static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_maskTexture");
  /** @internal */
  static _alphaCutoffProperty: ShaderProperty = Shader.getPropertyByName("u_maskAlphaCutoff");

  /** @internal */
  _maskElement: SpriteMaskElement;
  /** The mask layers the sprite mask influence to. */
  @assignmentClone
  influenceLayers: number = SpriteMaskLayer.Everything;

  _renderData: RenderData2D;
  private _drawMode: SpriteDrawMode = SpriteDrawMode.Simple;
  private _assembler: IAssembler = SpriteSimple;

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

  @assignmentClone
  private _alphaCutoff: number = 0.5;

  /** Dirty flag. */
  @ignoreClone
  private _dirtyFlag: number = 0;

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
          this.shaderData.setTexture(SpriteMask._textureProperty, value.texture);
          // Set default size.
          this.width = value.width / SpriteRenderer._pixelPerUnit;
          this.height = value.height / SpriteRenderer._pixelPerUnit;
        }
        this._setDirtyFlagTrue(DirtyFlag.Position | DirtyFlag.UV);
      } else {
        this.shaderData.setTexture(SpriteMask._textureProperty, null);
      }
    }
  }

  /**
   * The minimum alpha value used by the mask to select the area of influence defined over the mask's sprite. Value between 0 and 1.
   */
  get alphaCutoff(): number {
    return this._alphaCutoff;
  }

  set alphaCutoff(value: number) {
    if (this._alphaCutoff !== value) {
      this._alphaCutoff = value;
      this.shaderData.setFloat(SpriteMask._alphaCutoffProperty, value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this.setMaterial(this._engine._spriteMaskDefaultMaterial);
    this.shaderData.setFloat(SpriteMask._alphaCutoffProperty, this._alphaCutoff);
    this._onSpriteChange = this._onSpriteChange.bind(this);
  }

  /**
   * @override
   * @inheritdoc
   */
  _onDestroy(): void {
    this._pivot = null;
    this._sprite = null;
    this._assembler = null;
    this._renderData = null;
    this._spriteChangeFlag && this._spriteChangeFlag.destroy();
    super._onDestroy();
  }

  /**
   * @override
   * @inheritdoc
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

    const spriteMaskElementPool = this._engine._spriteMaskElementPool;
    const maskElement = spriteMaskElementPool.getFromPool();
    maskElement.setValue(this, this._renderData, this.getMaterial());
    camera._renderPipeline._allSpriteMasks.add(this);
    this._maskElement = maskElement;
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
   * @internal
   */
  _cloneTo(target: SpriteMask): void {
    target.sprite = this._sprite;
  }

  private _onSpriteChange(dirtyFlag: SpriteDirtyFlag) {
    switch (dirtyFlag) {
      case SpriteDirtyFlag.texture:
        if (this.sprite.texture) {
          this.shaderData.setTexture(SpriteMask._textureProperty, this.sprite.texture);
        }
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
  All = 0x3
}
