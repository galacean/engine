import { BoundingBox } from "@oasis-engine/math";
import { Camera } from "../../Camera";
import { assignmentClone, ignoreClone } from "../../clone/CloneManager";
import { ICustomClone } from "../../clone/ComponentCloner";
import { Entity } from "../../Entity";
import { ListenerUpdateFlag } from "../../ListenerUpdateFlag";
import { Renderer } from "../../Renderer";
import { SpriteMaskElement } from "../../RenderPipeline/SpriteMaskElement";
import { Shader } from "../../shader/Shader";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { SimpleSpriteAssembler } from "../assembler/SimpleSpriteAssembler";
import { RenderData2D } from "../data/RenderData2D";
import { SpritePropertyDirtyFlag } from "../enums/SpriteDirtyFlag";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { Sprite } from "./Sprite";
import { SpriteRenderer } from "./SpriteRenderer";

/**
 * A component for masking Sprites.
 */
export class SpriteMask extends Renderer implements ICustomClone {
  /** @internal */
  static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_maskTexture");
  /** @internal */
  static _alphaCutoffProperty: ShaderProperty = Shader.getPropertyByName("u_maskAlphaCutoff");

  /** The mask layers the sprite mask influence to. */
  @assignmentClone
  influenceLayers: number = SpriteMaskLayer.Everything;
  /** @internal */
  _maskElement: SpriteMaskElement;

  /** @internal */
  _renderData: RenderData2D;

  @ignoreClone
  private _sprite: Sprite = null;

  @ignoreClone
  private _width: number = undefined;
  @ignoreClone
  private _height: number = undefined;
  @assignmentClone
  private _flipX: boolean = false;
  @assignmentClone
  private _flipY: boolean = false;

  @assignmentClone
  private _alphaCutoff: number = 0.5;

  @ignoreClone
  private _dirtyFlag: number = 0;
  @ignoreClone
  private _spriteChangeFlag: ListenerUpdateFlag = null;

  /**
   * Render width.
   */
  get width(): number {
    return this._width;
  }

  set width(val: number) {
    if (this._width !== val) {
      this._width = val;
      this._dirtyFlag |= DirtyFlag.Position;
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
      this._dirtyFlag |= DirtyFlag.Position;
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
      this._dirtyFlag |= DirtyFlag.Position;
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
      this._dirtyFlag |= DirtyFlag.Position;
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
      this._sprite = value;
      this._spriteChangeFlag && this._spriteChangeFlag.destroy();
      if (value) {
        this._spriteChangeFlag = value._registerUpdateFlag();
        this._spriteChangeFlag.listener = this._onSpriteChange;
        // Set default size.
        if (value.texture && this._width === undefined && this._height === undefined) {
          this.width = value.width;
          this.height = value.height;
        }
        this._dirtyFlag |= DirtyFlag.All;
      }
      this.shaderData.setTexture(SpriteRenderer._textureProperty, value.texture);
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
    this._renderData = new RenderData2D(4, [], []);
    SimpleSpriteAssembler.resetData(this);
    this.setMaterial(this._engine._spriteMaskDefaultMaterial);
    this.shaderData.setFloat(SpriteMask._alphaCutoffProperty, this._alphaCutoff);
    this._onSpriteChange = this._onSpriteChange.bind(this);
  }

  /**
   * @override
   * @inheritdoc
   */
  _onDestroy(): void {
    this._sprite = null;
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
    // Update position.
    if (this._transformChangeFlag.flag || this._dirtyFlag & DirtyFlag.Position) {
      SimpleSpriteAssembler.updatePositions(this);
      this._dirtyFlag &= ~DirtyFlag.Position;
      this._transformChangeFlag.flag = false;
    }

    // Update uv.
    if (this._dirtyFlag & DirtyFlag.UV) {
      SimpleSpriteAssembler.updateUVs(this);
      this._dirtyFlag &= ~DirtyFlag.UV;
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
    if (this._transformChangeFlag.flag || this._dirtyFlag & DirtyFlag.Position) {
      SimpleSpriteAssembler.updatePositions(this);
      this._dirtyFlag &= ~DirtyFlag.Position;
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

  private _onSpriteChange(dirtyFlag: SpritePropertyDirtyFlag) {
    switch (dirtyFlag) {
      case SpritePropertyDirtyFlag.texture:
        const { _sprite: sprite } = this;
        const { texture } = sprite;
        if (texture && this._width === undefined && this._height === undefined) {
          this.width = sprite.width;
          this.height = sprite.height;
        }
        this.shaderData.setTexture(SpriteRenderer._textureProperty, texture);
        break;
      case SpritePropertyDirtyFlag.region:
      case SpritePropertyDirtyFlag.atlas:
        this._dirtyFlag |= DirtyFlag.All;
        break;
      default:
        break;
    }
  }
}

enum DirtyFlag {
  Position = 0x1,
  UV = 0x2,
  All = 0x3
}
