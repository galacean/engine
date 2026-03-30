import {
  BoundingBox,
  Entity,
  ISpriteAssembler,
  ISpriteRenderer,
  MathUtil,
  RenderQueueFlags,
  RendererUpdateFlags,
  SimpleSpriteAssembler,
  SlicedSpriteAssembler,
  Sprite,
  SpriteDrawMode,
  SpriteModifyFlags,
  SpriteTileMode,
  TiledSpriteAssembler,
  assignmentClone,
  ignoreClone
} from "@galacean/engine";
import { CanvasRenderMode } from "../../enums/CanvasRenderMode";
import { RootCanvasModifyFlags } from "../UICanvas";
import { UIRenderer, UIRendererUpdateFlags } from "../UIRenderer";
import { UITransform, UITransformModifyFlags } from "../UITransform";

/**
 * Determines how the Image element's size is controlled relative to the sprite.
 */
export enum SpriteSizeMode {
  /** The image size is controlled manually via UITransform (default, existing behavior). */
  Custom = 0,
  /** The image size is automatically set to the sprite's natural dimensions when the sprite changes. */
  Automatic = 1
}

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
  @assignmentClone
  private _tileMode: SpriteTileMode = SpriteTileMode.Continuous;
  @assignmentClone
  private _tiledAdaptiveThreshold: number = 0.5;
  @assignmentClone
  private _sizeMode: SpriteSizeMode = SpriteSizeMode.Custom;

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
        default:
          break;
      }
      this._assembler.resetData(this);
      this._dirtyUpdateFlag |= ImageUpdateFlags.WorldVolumeUVAndColor;
    }
  }

  /**
   * The size mode of the image. When set to `Automatic`, the UITransform size
   * is automatically synchronized to the sprite's natural dimensions.
   */
  get sizeMode(): SpriteSizeMode {
    return this._sizeMode;
  }

  set sizeMode(value: SpriteSizeMode) {
    if (this._sizeMode !== value) {
      this._sizeMode = value;
      if (value === SpriteSizeMode.Automatic && this._sprite) {
        this._applySpriteSize();
      }
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
      if (this._sizeMode === SpriteSizeMode.Automatic && value) {
        this._applySpriteSize();
      }
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
   * @internal
   */
  _cloneTo(target: Image): void {
    // @ts-ignore
    super._cloneTo(target);
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
    // Init sub render element.
    const { engine } = context.camera;
    const subRenderElement = engine._subRenderElementPool.get();
    const subChunk = this._subChunk;
    subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, this.sprite.texture, subChunk);
    if (canvas._realRenderMode === CanvasRenderMode.ScreenSpaceOverlay) {
      subRenderElement.shaderPasses = material.shader.subShaders[0].passes;
      subRenderElement.renderQueueFlags = RenderQueueFlags.All;
    }
    canvas._renderElement.addSubRenderElement(subRenderElement);
  }

  @ignoreClone
  protected override _onTransformChanged(type: number): void {
    if (type & UITransformModifyFlags.Size && this._drawMode === SpriteDrawMode.Tiled) {
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

  @ignoreClone
  private _onSpriteChange(type: SpriteModifyFlags): void {
    switch (type) {
      case SpriteModifyFlags.texture:
        this.shaderData.setTexture(UIRenderer._textureProperty, this.sprite.texture);
        break;
      case SpriteModifyFlags.size:
        if (this._sizeMode === SpriteSizeMode.Automatic) {
          this._applySpriteSize();
        }
        switch (this._drawMode) {
          case SpriteDrawMode.Sliced:
            this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
            break;
          case SpriteDrawMode.Tiled:
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
        this._dirtyUpdateFlag |= ImageUpdateFlags.UV;
        break;
      case SpriteModifyFlags.destroy:
        this.sprite = null;
        break;
    }
  }

  private _applySpriteSize(): void {
    const sprite = this._sprite;
    if (sprite) {
      (<UITransform>this._transformEntity.transform).size.set(sprite.width, sprite.height);
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
