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
  Vector2,
  Vector3,
  assignmentClone,
  ignoreClone
} from "@galacean/engine";
import { CanvasRenderMode } from "../../enums/CanvasRenderMode";
import { UIRenderer, UIRendererUpdateFlags } from "../UIRenderer";
import { UITransform, UITransformModifyFlags } from "../UITransform";

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
        // @ts-ignore
        lastSprite._updateFlagManager.removeListener(this._onSpriteChange);
      }
      this._dirtyUpdateFlag |= ImageUpdateFlags.AllPositionUVAndColor;
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
    this.setMaterial(this._engine._basicResources.uiDefaultMaterial);
    this._onSpriteChange = this._onSpriteChange.bind(this);
    //@ts-ignore
    this._color._onValueChanged = this._onColorChange.bind(this);
  }

  protected override _hitTest(localPosition: Vector3): boolean {
    let { x, y } = localPosition;
    const uiTransform = <UITransform>this._transformEntity.transform;
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
      const transform = <UITransform>this._transformEntity.transform;
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
      material = this._engine._basicResources.uiDefaultMaterial;
    }

    if (this._color.a * this._alpha <= 0) {
      return;
    }

    let { _dirtyUpdateFlag: dirtyUpdateFlag } = this;
    // Update position
    if (dirtyUpdateFlag & RendererUpdateFlags.AllPositions) {
      this._assembler.updatePositions(this, transform.worldMatrix, width, height, transform.pivot);
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
    const canvas = this.canvas;
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
    const { size, pivot } = <UITransform>this._transformEntity.transform;
    return this._assembler.getUVByLocalPosition(this, size.x, size.y, pivot, position, out);
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
