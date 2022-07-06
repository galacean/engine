import { BoundingBox, Color } from "@oasis-engine/math";
import { BoolUpdateFlag } from "../../BoolUpdateFlag";
import { Camera } from "../../Camera";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { Entity } from "../../Entity";
import { Texture2D } from "../../texture";
import { CharAssembler } from "../assembler/CharAssembler";
import { TextAssembler } from "../assembler/textAssembler";
import { RenderData2D } from "../data/RenderData2D";
import { CharRenderData } from "../assembler/CharRenderData";
import { FontStyle } from "../enums/FontStyle";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { Font } from "./Font";
import { Renderer } from "../../Renderer";
import { Sprite } from "../sprite/Sprite";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { CompareFunction } from "../../shader/enums/CompareFunction";
import { ICustomClone } from "../../clone/ComponentCloner";

/**
 * Renders a text for 2D graphics.
 */
export class TextRenderer extends Renderer implements ICustomClone {
  private static _tempBounds: BoundingBox = new BoundingBox();

  /** @internal */
  @ignoreClone
  _sprite: Sprite = null;
  /** @internal */
  @ignoreClone
  _renderData: RenderData2D;
  /** @internal */
  @assignmentClone
  _charFont: Font = null;
  /** @internal */
  @ignoreClone
  _charRenderDatas: Array<CharRenderData> = [];

  @ignoreClone
  _dirtyFlag: number = DirtyFlag.Property;
  /** @internal */
  @ignoreClone
  _isWorldMatrixDirty: BoolUpdateFlag;

  @deepClone
  private _color: Color = new Color(1, 1, 1, 1);
  @assignmentClone
  private _text: string = "";
  @assignmentClone
  private _width: number = 0;
  @assignmentClone
  private _height: number = 0;
  @assignmentClone
  private _font: Font = null;
  @assignmentClone
  private _fontSize: number = 24;
  @assignmentClone
  private _fontStyle: FontStyle = FontStyle.None;
  @assignmentClone
  private _lineSpacing: number = 0;
  @ignoreClone
  private _useCharCache: boolean = true;
  @assignmentClone
  private _horizontalAlignment: TextHorizontalAlignment = TextHorizontalAlignment.Center;
  @assignmentClone
  private _verticalAlignment: TextVerticalAlignment = TextVerticalAlignment.Center;
  @assignmentClone
  private _enableWrapping: boolean = false;
  @assignmentClone
  private _overflowMode: OverflowMode = OverflowMode.Overflow;
  @assignmentClone
  private _maskInteraction: SpriteMaskInteraction = SpriteMaskInteraction.None;
  @assignmentClone
  private _maskLayer: number = SpriteMaskLayer.Layer0;

  /**
   * Rendering color for the Text.
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
   * Rendering string for the Text.
   */
  get text(): string {
    return this._text;
  }

  set text(value: string) {
    value = value || "";
    if (this._text !== value) {
      this._text = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
  }

  /**
   * The width of the TextRenderer (in 3D world coordinates).
   */
  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (this._width !== value) {
      this._width = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
  }

  /**
   * The height of the TextRenderer (in 3D world coordinates).
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
  }

  /**
   * The font of the Text.
   */
  get font(): Font {
    return this._font;
  }

  set font(value: Font) {
    if (this._font !== value) {
      this._font = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
  }

  /**
   * The font size of the Text.
   */
  get fontSize(): number {
    return this._fontSize;
  }

  set fontSize(value: number) {
    if (this._fontSize !== value) {
      this._fontSize = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
  }

  /**
   * The style of the font.
   */
  get fontStyle(): FontStyle {
    return this._fontStyle;
  }

  set fontStyle(value: FontStyle) {
    if (this.fontStyle !== value) {
      this._fontStyle = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
  }

  /**
   * The space between two lines (in pixels).
   */
  get lineSpacing(): number {
    return this._lineSpacing;
  }

  set lineSpacing(value: number) {
    if (this._lineSpacing !== value) {
      this._lineSpacing = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
  }

  /**
   * Whether cache each character individually.
   */
  get useCharCache(): boolean {
    return this._useCharCache;
  }

  set useCharCache(value: boolean) {
    if (this._useCharCache !== value) {
      this._useCharCache = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);

      if (value) {
        if (this._sprite) {
          this._clearTexture();
          this._sprite.destroy();
          this._sprite = null;
        }
        TextAssembler.clearData(this);
        CharAssembler.resetData(this);
      } else {
        CharAssembler.clearData(this);
        this._sprite = new Sprite(this.engine);
        TextAssembler.resetData(this);
      }
    }
  }

  /**
   * The horizontal alignment.
   */
  get horizontalAlignment(): TextHorizontalAlignment {
    return this._horizontalAlignment;
  }

  set horizontalAlignment(value: TextHorizontalAlignment) {
    if (this._horizontalAlignment !== value) {
      this._horizontalAlignment = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
  }

  /**
   * The vertical alignment.
   */
  get verticalAlignment(): TextVerticalAlignment {
    return this._verticalAlignment;
  }

  set verticalAlignment(value: TextVerticalAlignment) {
    if (this._verticalAlignment !== value) {
      this._verticalAlignment = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
  }

  /**
   * Whether wrap text to next line when exceeds the width of the container.
   */
  get enableWrapping(): boolean {
    return this._enableWrapping;
  }

  set enableWrapping(value: boolean) {
    if (this._enableWrapping !== value) {
      this._enableWrapping = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
  }

  /**
   * The overflow mode.
   */
  get overflowMode(): OverflowMode {
    return this._overflowMode;
  }

  set overflowMode(value: OverflowMode) {
    if (this._overflowMode !== value) {
      this._overflowMode = value;
      this._setDirtyFlagTrue(DirtyFlag.Property);
    }
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
      this._setDirtyFlagTrue(DirtyFlag.MaskInteraction);
    }
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

  constructor(entity: Entity) {
    super(entity);
    const { engine } = this;
    this._isWorldMatrixDirty = entity.transform.registerWorldChangeFlag();
    CharAssembler.resetData(this);
    this.font = Font.createFromOS(engine);
    this.setMaterial(engine._spriteDefaultMaterial);
  }

  /**
   * @internal
   */
  _render(camera: Camera): void {
    if (
      this._text === "" ||
      (this.enableWrapping && this.width <= 0) ||
      (this.overflowMode === OverflowMode.Truncate && this.height <= 0)
    ) {
      this._clearTexture();
      return;
    }

    if (this._isContainDirtyFlag(DirtyFlag.MaskInteraction)) {
      this._updateStencilState();
      this._setDirtyFlagFalse(DirtyFlag.MaskInteraction);
    }

    if (this._useCharCache) {
      CharAssembler.updateData(this);

      const { _charRenderDatas } = this;
      for (let i = 0, l = _charRenderDatas.length; i < l; ++i) {
        const charRenderData = _charRenderDatas[i];
        this._drawPrimitive(camera, charRenderData.renderData, charRenderData.texture);
      }
    } else {
      TextAssembler.updateData(this);
      this._drawPrimitive(camera, this._renderData, this._sprite.texture);
    }
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    this.engine._dynamicTextAtlasManager.removeSprite(this._sprite);
    this._isWorldMatrixDirty.destroy();
    super._onDestroy();
  }

  /**
   * @internal
   */
  _cloneTo(target: TextRenderer): void {
    target.font = this._font;
    target.useCharCache = this._useCharCache;
  }

  /**
   * @internal
   */
  _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  /**
   * @internal
   */
  _setDirtyFlagTrue(type: number): void {
    this._dirtyFlag |= type;
  }

  /**
   * @internal
   */
  _setDirtyFlagFalse(type: number): void {
    this._dirtyFlag &= ~type;
  }

  /**
   * @internal
   */
  _clearTexture(): void {
    const { _sprite } = this;
    if (_sprite) {
      // Remove sprite from dynamic atlas.
      this.engine._dynamicTextAtlasManager.removeSprite(_sprite);
      this.shaderData.setTexture(SpriteRenderer._textureProperty, null);
      _sprite.atlasRegion = _sprite.region;
    }
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    const worldMatrix = this._entity.transform.worldMatrix;
    let bounds = TextRenderer._tempBounds;
    const { min, max } = bounds;
    min.set(0, 0, 0);
    max.set(0, 0, 0);
    if (this._useCharCache) {
      const { _charRenderDatas } = this;
      const dataLen = _charRenderDatas.length;
      if (dataLen > 0) {
        const charRenderData = _charRenderDatas[0];
        const { localPositions } = charRenderData;
        let minPos = localPositions[3];
        let maxPos = localPositions[1];
        let minX = minPos.x;
        let minY = minPos.y;
        let maxX = maxPos.x;
        let maxY = maxPos.y;

        for (let i = 1; i < dataLen; ++i) {
          const { localPositions } = _charRenderDatas[i];
          let minPos = localPositions[3];
          let maxPos = localPositions[1];
          minX > minPos.x && (minX = minPos.x);
          minY > minPos.y && (minY = minPos.y);
          maxX < maxPos.x && (maxX = maxPos.x);
          maxY < maxPos.y && (maxY = maxPos.y);
        }
        min.set(minX, minY, 0);
        max.set(maxX, maxY, 0);
      }
      BoundingBox.transform(bounds, worldMatrix, worldBounds);
    } else {
      if (this._sprite) {
        bounds = this._sprite._getBounds();
      }
      BoundingBox.transform(bounds, worldMatrix, worldBounds);
    }
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

  private _drawPrimitive(camera: Camera, renderData: RenderData2D, texture: Texture2D): void {
    const spriteElementPool = this._engine._spriteElementPool;
    const spriteElement = spriteElementPool.getFromPool();
    spriteElement.setValue(this, renderData, this.getMaterial(), texture);
    camera._renderPipeline.pushPrimitive(spriteElement);
  }
}

export enum DirtyFlag {
  Property = 0x1,
  MaskInteraction = 0x2,
  All = 0x3
}
