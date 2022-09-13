import { BoundingBox, Color } from "@oasis-engine/math";
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
import { IAssembler } from "../assembler/IAssembler";
import { SpritePropertyDirtyFlag } from "../enums/SpriteDirtyFlag";
import { SpriteDrawMode } from "../enums/SpriteDrawMode";
import { SimpleSpriteAssembler } from "../assembler/SimpleSpriteAssembler";
import { ListenerUpdateFlag } from "../../ListenerUpdateFlag";
import { SlicedSpriteAssembler } from "../assembler/SlicedSpriteAssembler";
import { Engine } from "../../Engine";

/**
 * Renders a Sprite for 2D graphics.
 */
export class SpriteRenderer extends Renderer implements ICustomClone {
  /** @internal */
  static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_spriteTexture");

  /** @internal */
  @ignoreClone
  _renderData: RenderData2D;

  @ignoreClone
  private _drawMode: SpriteDrawMode;
  @ignoreClone
  private _assembler: IAssembler;

  @deepClone
  private _color: Color = new Color(1, 1, 1, 1);
  @ignoreClone
  private _sprite: Sprite = null;

  @assignmentClone
  private _width: number = undefined;
  @assignmentClone
  private _height: number = undefined;
  @assignmentClone
  private _flipX: boolean = false;
  @assignmentClone
  private _flipY: boolean = false;

  @assignmentClone
  private _maskLayer: number = SpriteMaskLayer.Layer0;
  @assignmentClone
  private _maskInteraction: SpriteMaskInteraction = SpriteMaskInteraction.None;

  @ignoreClone
  private _dirtyFlag: number = 0;
  @ignoreClone
  private _spriteChangeFlag: ListenerUpdateFlag = null;

  /**
   * The draw mode of the sprite renderer.
   */
  get drawMode(): SpriteDrawMode {
    return this._drawMode;
  }

  set drawMode(drawMode: SpriteDrawMode) {
    if (this._drawMode !== drawMode) {
      this._drawMode = drawMode;
      switch (drawMode) {
        case SpriteDrawMode.Simple:
          this._assembler = SimpleSpriteAssembler;
          break;
        case SpriteDrawMode.Sliced:
          this._assembler = SlicedSpriteAssembler;
          break;
        default:
          break;
      }
      this._assembler.resetData(this);
      this._dirtyFlag |= DirtyFlag.All;
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
        this._dirtyFlag |= DirtyFlag.All;
        this.shaderData.setTexture(SpriteRenderer._textureProperty, value.texture);
      } else {
        this._spriteChangeFlag = null;
        this.shaderData.setTexture(SpriteRenderer._textureProperty, null);
      }
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
      this._color.copyFrom(value);
    }
  }

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
      this._dirtyFlag |= DirtyFlag.Position;
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
   * The bounding volume of the spriteRenderer.
   */
  get bounds(): BoundingBox {
    if (!this.sprite?.texture || !this.width || !this.height) {
      return Engine._defaultBoundingBox;
    } else if (this._transformChangeFlag.flag || this._dirtyFlag & DirtyFlag.Position) {
      this._assembler.updatePositions(this);
      this._dirtyFlag &= ~DirtyFlag.Position;
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
    this._renderData = new RenderData2D(4, [], [], null, this._color);
    this.drawMode = SpriteDrawMode.Simple;
    this.setMaterial(this._engine._spriteDefaultMaterial);
    this._onSpriteChange = this._onSpriteChange.bind(this);
  }

  /**
   * @internal
   */
  _render(camera: Camera): void {
    if (!this.sprite?.texture || !this.width || !this.height) {
      return;
    }

    // Update position.
    if (this._transformChangeFlag.flag || this._dirtyFlag & DirtyFlag.Position) {
      this._assembler.updatePositions(this);
      this._dirtyFlag &= ~DirtyFlag.Position;
      this._transformChangeFlag.flag = false;
    }

    // Update uv.
    if (this._dirtyFlag & DirtyFlag.UV) {
      this._assembler.updateUVs(this);
      this._dirtyFlag &= ~DirtyFlag.UV;
    }

    // Push primitive.
    const spriteElement = this._engine._spriteElementPool.getFromPool();
    spriteElement.setValue(this, this._renderData, this.getMaterial(), this.sprite.texture);
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
    this._color = null;
    this._sprite = null;
    this._assembler = null;
    this._renderData = null;
    if (this._spriteChangeFlag) {
      this._spriteChangeFlag.destroy();
      this._spriteChangeFlag = null;
    }
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

  private _onSpriteChange(dirtyFlag: SpritePropertyDirtyFlag): void {
    switch (dirtyFlag) {
      case SpritePropertyDirtyFlag.texture:
        this.shaderData.setTexture(SpriteRenderer._textureProperty, this.sprite.texture);
        break;
      case SpritePropertyDirtyFlag.size:
        this._drawMode === SpriteDrawMode.Sliced && (this._dirtyFlag |= DirtyFlag.Position);
        break;
      case SpritePropertyDirtyFlag.border:
        this._drawMode === SpriteDrawMode.Sliced && (this._dirtyFlag |= DirtyFlag.All);
        break;
      case SpritePropertyDirtyFlag.region:
      case SpritePropertyDirtyFlag.atlasRegionOffset:
        this._dirtyFlag |= DirtyFlag.All;
        break;
      case SpritePropertyDirtyFlag.atlasRegion:
        this._dirtyFlag |= DirtyFlag.UV;
        break;
      case SpritePropertyDirtyFlag.pivot:
        this._dirtyFlag |= DirtyFlag.Position;
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
