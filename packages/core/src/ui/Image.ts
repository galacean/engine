import { BoundingBox, MathUtil, Vector2, Vector3 } from "@galacean/engine-math";
import { Sprite, SpriteDrawMode, SpriteTileMode } from "../2d";
import { ISpriteAssembler } from "../2d/assembler/ISpriteAssembler";
import { ISpriteRenderer } from "../2d/assembler/ISpriteRenderer";
import { SimpleSpriteAssembler } from "../2d/assembler/SimpleSpriteAssembler";
import { SlicedSpriteAssembler } from "../2d/assembler/SlicedSpriteAssembler";
import { TiledSpriteAssembler } from "../2d/assembler/TiledSpriteAssembler";
import { SpriteModifyFlags } from "../2d/enums/SpriteModifyFlags";
import { Entity } from "../Entity";
import { RenderQueueFlags } from "../RenderPipeline/BasicRenderPipeline";
import { BatchUtils } from "../RenderPipeline/BatchUtils";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { SubRenderElement } from "../RenderPipeline/SubRenderElement";
import { RendererUpdateFlags } from "../Renderer";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { UIRenderer, UIRendererUpdateFlags } from "./UIRenderer";
import { UITransform, UITransformModifyFlags } from "./UITransform";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";

export class Image extends UIRenderer implements ISpriteRenderer {
  private static _tempVec2: Vector2 = new Vector2();
  private static _tempUnit8Array: Uint8ClampedArray = new Uint8ClampedArray(4);

  @ignoreClone
  private _sprite: Sprite = null;
  @ignoreClone
  private _drawMode: SpriteDrawMode;
  @assignmentClone
  private _assembler: ISpriteAssembler;
  @assignmentClone
  private _tileMode: SpriteTileMode = SpriteTileMode.Continuous;
  @assignmentClone
  private _tiledAdaptiveThreshold: number = 0.5;
  @assignmentClone
  private _alphaHitTestMinimumThreshold: number = 0.0;

  get alphaHitTestMinimumThreshold(): number {
    return this._alphaHitTestMinimumThreshold;
  }

  set alphaHitTestMinimumThreshold(value: number) {
    this._alphaHitTestMinimumThreshold = MathUtil.clamp(value, 0, 1);
  }

  /**
   * The draw mode of the sprite renderer.
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
      this._dirtyUpdateFlag |= ImageUpdateFlags.AllPositionUVAndColor;
    }
  }

  /**
   * The tiling mode of the sprite renderer. (Only works in tiled mode.)
   */
  get tileMode(): SpriteTileMode {
    return this._tileMode;
  }

  set tileMode(value: SpriteTileMode) {
    if (this._tileMode !== value) {
      this._tileMode = value;
      if (this.drawMode === SpriteDrawMode.Tiled) {
        this._dirtyUpdateFlag |= ImageUpdateFlags.AllPositionUVAndColor;
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
        this._dirtyUpdateFlag |= ImageUpdateFlags.AllPositionUVAndColor;
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
        lastSprite._updateFlagManager.removeListener(this._onSpriteChange);
      }
      this._dirtyUpdateFlag |= ImageUpdateFlags.AllPositionUVAndColor;
      if (value) {
        this._addResourceReferCount(value, 1);
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
    this.setMaterial(this._engine._basicResources.uiDefaultMaterial);
    this._onSpriteChange = this._onSpriteChange.bind(this);
    //@ts-ignore
    this._color._onValueChanged = this._onColorChange.bind(this);
  }

  protected override _hitTest(localPosition: Vector3): boolean {
    let { x, y } = localPosition;
    const uiTransform = <UITransform>this._transform;
    const { x: width, y: height } = uiTransform.size;
    const { x: pivotX, y: pivotY } = uiTransform.pivot;
    const { x: paddingLeft, y: paddingBottom, z: paddingRight, w: paddingTop } = this.raycastPadding;
    if (
      x < -width * pivotX + paddingLeft ||
      x > width * (1 - pivotX) - paddingRight ||
      y < -height * pivotY + paddingTop ||
      y > height * (1 - pivotY) - paddingBottom
    ) {
      return false;
    }
    const alphaHitTestMinimumThreshold = this._alphaHitTestMinimumThreshold;
    if (alphaHitTestMinimumThreshold <= 0) {
      return true;
    }
    const texture = this.sprite?.texture;
    if (!texture) {
      return false;
    }
    const uv = Image._tempVec2;
    if (!this._getUVByLocalPosition(localPosition, uv)) {
      return false;
    }
    const pixel = Image._tempUnit8Array;
    texture.getPixelBuffer(Math.floor(uv.x * texture.width), Math.floor(uv.y * texture.height), 1, 1, 0, pixel);
    if (pixel[3] >= alphaHitTestMinimumThreshold * 255) {
      return true;
    } else {
      return false;
    }
  }

  protected override _updateLocalBounds(localBounds: BoundingBox): void {
    if (this._sprite) {
      const transform = <UITransform>this._transform;
      const { x: width, y: height } = transform.size;
      const { x: pivotX, y: pivotY } = transform.pivot;
      localBounds.min.set(-width * pivotX, -height * pivotY, 0);
      localBounds.max.set(width * (1 - pivotX), height * (1 - pivotY), 0);
    } else {
      localBounds.min.set(0, 0, 0);
      localBounds.max.set(0, 0, 0);
    }
  }

  /**
   * @internal
   */
  protected override _render(context: RenderContext): void {
    const { _sprite: sprite } = this;
    const transform = this._transform as UITransform;
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
      material = this._engine._basicResources.uiDefaultMaterial;
    }

    if (this._color.a * this._alpha <= 0) {
      return;
    }

    let { _dirtyUpdateFlag: dirtyUpdateFlag } = this;
    // Update position
    if (dirtyUpdateFlag & RendererUpdateFlags.AllPositions) {
      this._assembler.updatePositions(this, width, height, transform.pivot);
      dirtyUpdateFlag &= ~RendererUpdateFlags.AllPositions;
    }

    // Update uv
    if (dirtyUpdateFlag & ImageUpdateFlags.UV) {
      this._assembler.updateUVs(this);
      dirtyUpdateFlag &= ~ImageUpdateFlags.UV;
    }

    // Update color
    if (dirtyUpdateFlag & UIRendererUpdateFlags.Color) {
      this._assembler.updateColor(this, this._alpha);
      dirtyUpdateFlag &= ~UIRendererUpdateFlags.Color;
    }

    this._dirtyUpdateFlag = dirtyUpdateFlag;
    // Init sub render element.
    const { engine } = context.camera;
    const canvas = this._rootCanvas;
    const subRenderElement = engine._subRenderElementPool.get();
    const subChunk = this._subChunk;
    subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, this.sprite.texture, subChunk);
    if (canvas.renderMode === CanvasRenderMode.ScreenSpaceOverlay) {
      subRenderElement.shaderPasses = material.shader.subShaders[0].passes;
      subRenderElement.renderQueueFlags = RenderQueueFlags.All;
    }
    canvas._renderElement.addSubRenderElement(subRenderElement);
  }

  /**
   * @internal
   */
  override _canBatch(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
    return BatchUtils.canBatchSprite(elementA, elementB);
  }

  /**
   * @internal
   */
  override _batch(elementA: SubRenderElement, elementB?: SubRenderElement): void {
    BatchUtils.batchFor2D(elementA, elementB);
  }

  @ignoreClone
  protected override _onTransformChanged(type: number): void {
    if (type & UITransformModifyFlags.Size) {
      switch (this._drawMode) {
        case SpriteDrawMode.Simple:
        case SpriteDrawMode.Sliced:
          this._dirtyUpdateFlag |= RendererUpdateFlags.AllPositionAndBounds;
          break;
        case SpriteDrawMode.Tiled:
          this._dirtyUpdateFlag |= ImageUpdateFlags.All;
          break;
        default:
          break;
      }
    }
    if (type & UITransformModifyFlags.Pivot) {
      this._dirtyUpdateFlag |= RendererUpdateFlags.AllPositionAndBounds;
    }
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldPositionAndBounds;
  }

  protected override _onDestroy(): void {
    const sprite = this._sprite;
    if (sprite) {
      this._addResourceReferCount(sprite, -1);
      sprite._updateFlagManager.removeListener(this._onSpriteChange);
    }

    super._onDestroy();

    this._entity = null;
    this._color = null;
    this._sprite = null;
    this._assembler = null;
  }

  @ignoreClone
  private _onSpriteChange(type: SpriteModifyFlags): void {
    switch (type) {
      case SpriteModifyFlags.texture:
        this.shaderData.setTexture(UIRenderer._textureProperty, this.sprite.texture);
        break;
      case SpriteModifyFlags.size:
        switch (this._drawMode) {
          case SpriteDrawMode.Sliced:
            this._dirtyUpdateFlag |= RendererUpdateFlags.AllPositions;
            break;
          case SpriteDrawMode.Tiled:
            this._dirtyUpdateFlag |= ImageUpdateFlags.AllPositionUVAndColor;
            break;
          default:
            break;
        }
        break;
      case SpriteModifyFlags.border:
        switch (this._drawMode) {
          case SpriteDrawMode.Sliced:
            this._dirtyUpdateFlag |= ImageUpdateFlags.AllPositionAndUV;
            break;
          case SpriteDrawMode.Tiled:
            this._dirtyUpdateFlag |= ImageUpdateFlags.AllPositionUVAndColor;
            break;
          default:
            break;
        }
        break;
      case SpriteModifyFlags.region:
      case SpriteModifyFlags.atlasRegionOffset:
        this._dirtyUpdateFlag |= ImageUpdateFlags.AllPositionAndUV;
        break;
      case SpriteModifyFlags.atlasRegion:
        this._dirtyUpdateFlag |= ImageUpdateFlags.UV;
        break;
      case SpriteModifyFlags.destroy:
        this.sprite = null;
        break;
    }
  }

  private _getUVByLocalPosition(position: Vector3, out: Vector2): boolean {
    const transform = <UITransform>this._transform;
    const { size, pivot } = transform;
    switch (this._drawMode) {
      case SpriteDrawMode.Simple:
        return SimpleSpriteAssembler.getUVByLocalPosition(this, size.x, size.y, pivot, position, out);
      case SpriteDrawMode.Sliced:
        return SlicedSpriteAssembler.getUVByLocalPosition(this, size.x, size.y, pivot, position, out);
      case SpriteDrawMode.Tiled:
        return SlicedSpriteAssembler.getUVByLocalPosition(this, size.x, size.y, pivot, position, out);
      default:
        return false;
    }
  }
}

/**
 * @remarks Extends `UIRendererUpdateFlags`.
 */
enum ImageUpdateFlags {
  UV = 0x20,

  /** LocalPosition | WorldPosition | UV */
  AllPositionAndUV = 0x23,
  /** LocalPosition | WorldPosition | UV | Color */
  AllPositionUVAndColor = 0x33,
  /** LocalPosition | WorldPosition | UV | Color | LocalBounds | WorldBounds */
  All = 0x3f
}
