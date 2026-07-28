import {
  BoundingBox,
  Entity,
  FilledSpriteAssembler,
  ISpriteAssembler,
  ISpriteRenderer,
  MathUtil,
  RendererUpdateFlags,
  SimpleSpriteAssembler,
  SlicedSpriteAssembler,
  Sprite,
  SpriteDrawMode,
  SpriteFilledMode,
  SpriteFilledOrigin,
  SpriteModifyFlags,
  SpriteTileMode,
  TiledSpriteAssembler,
  ignoreClone
} from "@galacean/engine";
import { CanvasRenderMode } from "../../enums/CanvasRenderMode";
import { RootCanvasModifyFlags } from "../UICanvas";
import { UIRenderer, UIRendererUpdateFlags } from "../UIRenderer";
import { UITransform, UITransformModifyFlags } from "../UITransform";

/**
 * UI element that renders an image.
 */
export class Image extends UIRenderer implements ISpriteRenderer {
  @ignoreClone
  private _sprite: Sprite = null;
  @ignoreClone
  private _drawMode: SpriteDrawMode;
  @ignoreClone
  private _assembler: ISpriteAssembler;
  private _tileMode: SpriteTileMode = SpriteTileMode.Continuous;
  private _tiledAdaptiveThreshold: number = 0.5;
  private _filledMode: SpriteFilledMode = SpriteFilledMode.Radial360;
  private _filledAmount: number = 1;
  private _filledOrigin: SpriteFilledOrigin = SpriteFilledOrigin.Bottom;
  private _filledClockWise: boolean = true;

  /**
   * The draw mode of the image.
   */
  get drawMode(): SpriteDrawMode {
    return this._drawMode;
  }

  set drawMode(value: SpriteDrawMode) {
    if (this._drawMode !== value) {
      this._drawMode = value;
      switch (value) {
        case SpriteDrawMode.Simple:
          this._assembler = SimpleSpriteAssembler;
          break;
        case SpriteDrawMode.Sliced:
          this._assembler = SlicedSpriteAssembler;
          break;
        case SpriteDrawMode.Tiled:
          this._assembler = TiledSpriteAssembler;
          break;
        case SpriteDrawMode.Filled:
          this._assembler = FilledSpriteAssembler;
          break;
        default:
          break;
      }
      this._assembler.resetData(this);
      this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeUVAndColor;
    }
  }

  /**
   * The tiling mode of the image. (Only works in tiled mode.)
   */
  get tileMode(): SpriteTileMode {
    return this._tileMode;
  }

  set tileMode(value: SpriteTileMode) {
    if (this._tileMode !== value) {
      this._tileMode = value;
      if (this.drawMode === SpriteDrawMode.Tiled) {
        this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeUVAndColor;
      }
    }
  }

  /**
   * Stretch Threshold in Tile Adaptive Mode, specified in normalized. (Only works in tiled adaptive mode.)
   */
  get tiledAdaptiveThreshold(): number {
    return this._tiledAdaptiveThreshold;
  }

  set tiledAdaptiveThreshold(value: number) {
    if (value !== this._tiledAdaptiveThreshold) {
      value = MathUtil.clamp(value, 0, 1);
      this._tiledAdaptiveThreshold = value;
      if (this.drawMode === SpriteDrawMode.Tiled) {
        this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeUVAndColor;
      }
    }
  }

  /**
   * The fill amount of the image, range from 0 to 1. (Only works in filled mode.)
   */
  get filledAmount(): number {
    return this._filledAmount;
  }

  set filledAmount(value: number) {
    value = MathUtil.clamp(value, 0, 1);
    if (this._filledAmount !== value) {
      this._filledAmount = value;
      if (this._drawMode === SpriteDrawMode.Filled) {
        this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeAndUV;
      }
    }
  }

  /**
   * The fill mode of the image. (Only works in filled mode.)
   */
  get filledMode(): SpriteFilledMode {
    return this._filledMode;
  }

  set filledMode(value: SpriteFilledMode) {
    if (this._filledMode !== value) {
      this._filledMode = value;
      this._filledOrigin = Image._correctOrigin(value, this._filledOrigin);
      if (this._drawMode === SpriteDrawMode.Filled) {
        this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeAndUV;
      }
    }
  }

  /**
   * The fill origin of the image. (Only works in filled mode.)
   */
  get filledOrigin(): SpriteFilledOrigin {
    return this._filledOrigin;
  }

  set filledOrigin(value: SpriteFilledOrigin) {
    value = Image._correctOrigin(this._filledMode, value);
    if (this._filledOrigin !== value) {
      this._filledOrigin = value;
      if (this._drawMode === SpriteDrawMode.Filled) {
        this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeAndUV;
      }
    }
  }

  /**
   * Whether the fill is clockwise. (Only works in filled radial mode.)
   */
  get filledClockWise(): boolean {
    return this._filledClockWise;
  }

  set filledClockWise(value: boolean) {
    if (this._filledClockWise !== value) {
      this._filledClockWise = value;
      if (this._drawMode === SpriteDrawMode.Filled) {
        this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeAndUV;
      }
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
      if (lastSprite) {
        this._addResourceReferCount(lastSprite, -1);
        // @ts-ignore
        lastSprite._updateFlagManager.removeListener(this._onSpriteChange);
      }
      this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeUVAndColor;
      if (value) {
        this._addResourceReferCount(value, 1);
        // @ts-ignore
        value._updateFlagManager.addListener(this._onSpriteChange);
        this.shaderData.setTexture(UIRenderer._textureProperty, value.texture);
      } else {
        this.shaderData.setTexture(UIRenderer._textureProperty, null);
      }
      this._sprite = value;
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this.drawMode = SpriteDrawMode.Simple;
    // @ts-ignore
    this.setMaterial(this._engine._getUIDefaultMaterial());
    this._onSpriteChange = this._onSpriteChange.bind(this);
  }

  /**
   * @internal
   */
  _onRootCanvasModify(flag: RootCanvasModifyFlags): void {
    if (flag & RootCanvasModifyFlags.ReferenceResolutionPerUnit) {
      const drawMode = this._drawMode;
      if (drawMode === SpriteDrawMode.Tiled) {
        this._dirtyUpdateFlag |= ImageUpdateFlags.All;
      } else if (drawMode === SpriteDrawMode.Sliced) {
        this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
      }
    }
  }

  /**
   * @inheritdoc
   */
  override _onClone(target: Image): void {
    super._onClone(target);
    target.sprite = this._sprite;
    target.drawMode = this._drawMode;
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const sprite = this._sprite;
    const rootCanvas = this._getRootCanvas();
    if (sprite && rootCanvas) {
      const transform = <UITransform>this._transformEntity.transform;
      const { size } = transform;
      this._assembler.updatePositions(
        this,
        transform.worldMatrix,
        size.x,
        size.y,
        transform.pivot,
        false,
        false,
        rootCanvas.referenceResolutionPerUnit
      );
    } else {
      const { worldPosition } = this._transformEntity.transform;
      worldBounds.min.copyFrom(worldPosition);
      worldBounds.max.copyFrom(worldPosition);
    }
  }

  protected override _render(context): void {
    const { _sprite: sprite } = this;
    const transform = <UITransform>this._transformEntity.transform;
    const { x: width, y: height } = transform.size;
    if (!sprite?.texture || !width || !height) {
      return;
    }

    let material = this.getMaterial();
    if (!material) {
      return;
    }
    // @todo: This question needs to be raised rather than hidden.
    if (material.destroyed) {
      // @ts-ignore
      material = this._engine._getUIDefaultMaterial();
    }

    const alpha = this._getGlobalAlpha();
    if (this._color.a * alpha <= 0) {
      return;
    }

    let { _dirtyUpdateFlag: dirtyUpdateFlag } = this;
    const canvas = this._getRootCanvas();
    // Update position
    if (dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
      this._assembler.updatePositions(
        this,
        transform.worldMatrix,
        width,
        height,
        transform.pivot,
        false,
        false,
        canvas.referenceResolutionPerUnit
      );
      dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
    }

    // Update uv
    if (dirtyUpdateFlag & ImageUpdateFlags.UV) {
      this._assembler.updateUVs(this);
      dirtyUpdateFlag &= ~ImageUpdateFlags.UV;
    }

    // Update color
    if (dirtyUpdateFlag & UIRendererUpdateFlags.Color) {
      this._assembler.updateColor(this, alpha);
      dirtyUpdateFlag &= ~UIRendererUpdateFlags.Color;
    }

    this._dirtyUpdateFlag = dirtyUpdateFlag;
    const { engine } = context.camera;
    const renderElement = engine._renderElementPool.get();
    const subChunk = this._subChunk;
    renderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, this.sprite.texture, subChunk);
    renderElement.subShader = material.shader.subShaders[0];
    renderElement.priority = canvas.sortOrder;
    renderElement.distanceForSort = canvas._sortDistance;
    canvas._renderElements.push(renderElement);
  }

  protected override _onTransformChanged(type: number): void {
    if (
      type & UITransformModifyFlags.Size &&
      (this._drawMode === SpriteDrawMode.Tiled || this._drawMode === SpriteDrawMode.Filled)
    ) {
      this._dirtyUpdateFlag |= ImageUpdateFlags.All;
    }
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }

  protected override _onDestroy(): void {
    const sprite = this._sprite;
    if (sprite) {
      this._addResourceReferCount(sprite, -1);
      // @ts-ignore
      sprite._updateFlagManager.removeListener(this._onSpriteChange);
      this._sprite = null;
    }
    super._onDestroy();
  }

  private _onSpriteChange(type: SpriteModifyFlags): void {
    switch (type) {
      case SpriteModifyFlags.texture:
        this.shaderData.setTexture(UIRenderer._textureProperty, this.sprite.texture);
        break;
      case SpriteModifyFlags.size:
        switch (this._drawMode) {
          case SpriteDrawMode.Sliced:
            this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
            break;
          case SpriteDrawMode.Tiled:
            this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeUVAndColor;
            break;
          case SpriteDrawMode.Filled:
            this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeUVAndColor;
            break;
          default:
            break;
        }
        break;
      case SpriteModifyFlags.border:
        switch (this._drawMode) {
          case SpriteDrawMode.Sliced:
            this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeAndUV;
            break;
          case SpriteDrawMode.Tiled:
            this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeUVAndColor;
            break;
          default:
            break;
        }
        break;
      case SpriteModifyFlags.region:
      case SpriteModifyFlags.atlasRegionOffset:
        this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeAndUV;
        break;
      case SpriteModifyFlags.atlasRegion:
        this._dirtyUpdateFlag |=
          this._drawMode === SpriteDrawMode.Filled ? ImageUpdateFlags.WorldVolumeAndUV : ImageUpdateFlags.UV;
        break;
      case SpriteModifyFlags.destroy:
        this.sprite = null;
        break;
    }
  }

  private static _correctOrigin(mode: SpriteFilledMode, origin: SpriteFilledOrigin): SpriteFilledOrigin {
    switch (mode) {
      case SpriteFilledMode.Horizontal:
        return origin === SpriteFilledOrigin.Left || origin === SpriteFilledOrigin.Right
          ? origin
          : SpriteFilledOrigin.Left;
      case SpriteFilledMode.Vertical:
        return origin === SpriteFilledOrigin.Top || origin === SpriteFilledOrigin.Bottom
          ? origin
          : SpriteFilledOrigin.Bottom;
      case SpriteFilledMode.Radial90:
        return origin === SpriteFilledOrigin.TopLeft ||
          origin === SpriteFilledOrigin.TopRight ||
          origin === SpriteFilledOrigin.BottomLeft ||
          origin === SpriteFilledOrigin.BottomRight
          ? origin
          : SpriteFilledOrigin.BottomLeft;
      default:
        return origin === SpriteFilledOrigin.Top ||
          origin === SpriteFilledOrigin.Bottom ||
          origin === SpriteFilledOrigin.Left ||
          origin === SpriteFilledOrigin.Right
          ? origin
          : SpriteFilledOrigin.Bottom;
    }
  }
}

/**
 * @remarks Extends `UIRendererUpdateFlags`.
 */
enum ImageUpdateFlags {
  /** UV. */
  UV = 0x4,
  /** Automatic Size. */
  AutomaticSize = 0x8,
  /** WorldVolume and UV. */
  WorldVolumeAndUV = 0x5,
  /** WorldVolume, UV and Color. */
  WorldVolumeUVAndColor = 0x7,
  /** All. */
  All = 0xf
}
