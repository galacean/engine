import { BoundingBox } from "@oasis-engine/math";
import { assignmentClone, ignoreClone } from "../../clone/CloneManager";
import { ICustomClone } from "../../clone/ComponentCloner";
import { Entity } from "../../Entity";
import { Renderer, RendererUpdateFlags } from "../../Renderer";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { SpriteMaskElement } from "../../RenderPipeline/SpriteMaskElement";
import { Shader } from "../../shader/Shader";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { SimpleSpriteAssembler } from "../assembler/SimpleSpriteAssembler";
import { RenderData2D } from "../data/RenderData2D";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { SpriteModifyFlags } from "../enums/SpriteModifyFlags";
import { Sprite } from "./Sprite";

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

  /**
   * Render width.
   */
  get width(): number {
    if (this._width === undefined && this._sprite) {
      this.width = this._sprite.width;
    }
    return this._width;
  }

  set width(value: number) {
    if (this._width !== value) {
      this._width = value;
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * Render height.
   */
  get height(): number {
    if (this._height === undefined && this._sprite) {
      this.height = this._sprite.height;
    }
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
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
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
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
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  /**
   * The Sprite to render.
   */
  get sprite(): Sprite {
    return this._sprite;
  }

  set sprite(value: Sprite | null) {
    const lastSprite = this._sprite;
    if (lastSprite !== value) {
      lastSprite && lastSprite._updateFlagManager.removeListener(this._onSpriteChange);
      if (value) {
        value._updateFlagManager.addListener(this._onSpriteChange);
        this._dirtyUpdateFlag |= SpriteMaskUpdateFlags.All;
        this.shaderData.setTexture(SpriteMask._textureProperty, value.texture);
      } else {
        this.shaderData.setTexture(SpriteMask._textureProperty, null);
      }
      this._sprite = value;
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
    this._sprite?._updateFlagManager.removeListener(this._onSpriteChange);
    this._sprite = null;
    this._renderData = null;
    super._onDestroy();
  }

  /**
   * @internal
   */
  _cloneTo(target: SpriteMask): void {
    target.sprite = this._sprite;
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    if (!this.sprite?.texture || !this.width || !this.height) {
      worldBounds.min.set(0, 0, 0);
      worldBounds.max.set(0, 0, 0);
    } else {
      SimpleSpriteAssembler.updatePositions(this);
    }
  }

  /**
   * @override
   * @inheritdoc
   */
  protected _render(context: RenderContext): void {
    if (!this.sprite?.texture || !this.width || !this.height) {
      return;
    }

    // Update position.
    if (this._dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
      SimpleSpriteAssembler.updatePositions(this);
      this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
    }

    // Update uv.
    if (this._dirtyUpdateFlag & SpriteMaskUpdateFlags.UV) {
      SimpleSpriteAssembler.updateUVs(this);
      this._dirtyUpdateFlag &= ~SpriteMaskUpdateFlags.UV;
    }

    const spriteMaskElementPool = this._engine._spriteMaskElementPool;
    const maskElement = spriteMaskElementPool.getFromPool();
    maskElement.setValue(this, this._renderData, this.getMaterial());
    context.camera._renderPipeline._allSpriteMasks.add(this);
    this._maskElement = maskElement;
  }

  @ignoreClone
  private _onSpriteChange(type: SpriteModifyFlags): void {
    switch (type) {
      case SpriteModifyFlags.texture:
        this.shaderData.setTexture(SpriteMask._textureProperty, this.sprite.texture);
        break;
      case SpriteModifyFlags.region:
      case SpriteModifyFlags.atlasRegionOffset:
        this._dirtyUpdateFlag |= SpriteMaskUpdateFlags.All;
        break;
      case SpriteModifyFlags.atlasRegion:
        this._dirtyUpdateFlag |= SpriteMaskUpdateFlags.UV;
        break;
      default:
        break;
    }
  }
}

/**
 * @remarks Extends `RendererUpdateFlag`.
 */
enum SpriteMaskUpdateFlags {
  /** UV. */
  UV = 0x2,
  /** All. */
  All = 0x3
}
