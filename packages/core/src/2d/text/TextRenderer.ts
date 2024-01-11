import { BoundingBox, Color, Matrix, Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { Entity } from "../../Entity";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Renderer } from "../../Renderer";
import { TransformModifyFlags } from "../../Transform";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { CompareFunction } from "../../shader/enums/CompareFunction";
import { FontStyle } from "../enums/FontStyle";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { CharRenderData } from "./CharRenderData";
import { CharRenderDataPool } from "./CharRenderDataPool";
import { Font } from "./Font";
import { SubFont } from "./SubFont";
import { TextUtils } from "./TextUtils";

/**
 * Renders a text for 2D graphics.
 */
export class TextRenderer extends Renderer {
  private static _charRenderDataPool: CharRenderDataPool<CharRenderData> = new CharRenderDataPool(CharRenderData, 50);
  private static _tempVec30: Vector3 = new Vector3();
  private static _tempVec31: Vector3 = new Vector3();

  /** @internal */
  @assignmentClone
  _subFont: SubFont = null;
  /** @internal */
  @ignoreClone
  _charRenderDatas: CharRenderData[] = [];
  @ignoreClone
  _dirtyFlag: number = DirtyFlag.Font;

  @deepClone
  private _color: Color = new Color(1, 1, 1, 1);
  @assignmentClone
  private _text: string = "";
  @assignmentClone
  private _width: number = 0;
  @assignmentClone
  private _height: number = 0;
  @ignoreClone
  private _localBounds: BoundingBox = new BoundingBox();
  @assignmentClone
  private _font: Font = null;
  @assignmentClone
  private _fontSize: number = 24;
  @assignmentClone
  private _fontStyle: FontStyle = FontStyle.None;
  @assignmentClone
  private _lineSpacing: number = 0;
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  /**
   * The font of the Text.
   */
  get font(): Font {
    return this._font;
  }

  set font(value: Font) {
    const lastFont = this._font;
    if (lastFont !== value) {
      lastFont && this._addResourceReferCount(lastFont, -1);
      value && this._addResourceReferCount(value, 1);
      this._font = value;
      this._setDirtyFlagTrue(DirtyFlag.Font);
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
      this._setDirtyFlagTrue(DirtyFlag.Font);
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
      this._setDirtyFlagTrue(DirtyFlag.Font);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
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
      this._setDirtyFlagTrue(DirtyFlag.Position);
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

  /**
   * The bounding volume of the TextRenderer.
   */
  override get bounds(): BoundingBox {
    if (this._isTextNoVisible()) {
      if (this._isContainDirtyFlag(DirtyFlag.WorldBounds)) {
        const localBounds = this._localBounds;
        localBounds.min.set(0, 0, 0);
        localBounds.max.set(0, 0, 0);
        this._updateBounds(this._bounds);
        this._setDirtyFlagFalse(DirtyFlag.WorldBounds);
      }
      return this._bounds;
    }
    this._isContainDirtyFlag(DirtyFlag.SubFont) && this._resetSubFont();
    this._isContainDirtyFlag(DirtyFlag.LocalPositionBounds) && this._updateLocalData();
    this._isContainDirtyFlag(DirtyFlag.WorldPosition) && this._updatePosition();
    this._isContainDirtyFlag(DirtyFlag.WorldBounds) && this._updateBounds(this._bounds);
    this._setDirtyFlagFalse(DirtyFlag.Font);

    return this._bounds;
  }

  constructor(entity: Entity) {
    super(entity);
    this._init();
  }

  /**
   * @internal
   * Standalone for CanvasRenderer plugin.
   */
  _init(): void {
    const { engine } = this;
    this._font = engine._textDefaultFont;
    this._addResourceReferCount(this._font, 1);
    this.setMaterial(engine._spriteDefaultMaterial);
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    if (this._font) {
      this._addResourceReferCount(this._font, -1);
      this._font = null;
    }

    super._onDestroy();
    // Clear render data.
    const charRenderDatas = this._charRenderDatas;
    for (let i = 0, n = charRenderDatas.length; i < n; ++i) {
      TextRenderer._charRenderDataPool.put(charRenderDatas[i]);
    }
    charRenderDatas.length = 0;

    this._subFont && (this._subFont = null);
  }

  /**
   * @internal
   */
  override _cloneTo(target: TextRenderer, srcRoot: Entity, targetRoot: Entity): void {
    super._cloneTo(target, srcRoot, targetRoot);
    target.font = this._font;
    target._subFont = this._subFont;
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
  protected override _updateShaderData(context: RenderContext): void {
    // @ts-ignore
    this._updateTransformShaderData(context, Matrix._identity);
  }

  /**
   * @internal
   */
  protected override _updateBounds(worldBounds: BoundingBox): void {
    BoundingBox.transform(this._localBounds, this._entity.transform.worldMatrix, worldBounds);
  }

  /**
   * @internal
   */
  protected override _render(context: RenderContext): void {
    if (this._isTextNoVisible()) {
      return;
    }

    if (this._isContainDirtyFlag(DirtyFlag.MaskInteraction)) {
      this._updateStencilState();
      this._setDirtyFlagFalse(DirtyFlag.MaskInteraction);
    }

    if (this._isContainDirtyFlag(DirtyFlag.SubFont)) {
      this._resetSubFont();
      this._setDirtyFlagFalse(DirtyFlag.SubFont);
    }

    if (this._isContainDirtyFlag(DirtyFlag.LocalPositionBounds)) {
      this._updateLocalData();
      this._setDirtyFlagFalse(DirtyFlag.LocalPositionBounds);
    }

    if (this._isContainDirtyFlag(DirtyFlag.WorldPosition)) {
      this._updatePosition();
      this._setDirtyFlagFalse(DirtyFlag.WorldPosition);
    }

    const spriteRenderDataPool = this._engine._spriteRenderDataPool;
    const textData = this._engine._textRenderDataPool.getFromPool();
    const charsData = textData.charsData;
    const material = this.getMaterial();
    const charRenderDatas = this._charRenderDatas;
    const charCount = charRenderDatas.length;

    textData.component = this;
    textData.material = material;
    charsData.length = charCount;

    for (let i = 0; i < charCount; ++i) {
      const charRenderData = charRenderDatas[i];
      const spriteRenderData = spriteRenderDataPool.getFromPool();
      spriteRenderData.set(this, material, charRenderData.renderData, charRenderData.texture, i);
      charsData[i] = spriteRenderData;
    }
    context.camera._renderPipeline.pushRenderData(context, textData);
  }

  private _updateStencilState(): void {
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

  private _resetSubFont(): void {
    const font = this._font;
    this._subFont = font._getSubFont(this.fontSize, this.fontStyle);
    this._subFont.nativeFontString = TextUtils.getNativeFontString(font.name, this.fontSize, this.fontStyle);
  }

  private _updatePosition(): void {
    const { transform } = this.entity;
    const e = transform.worldMatrix.elements;
    const charRenderDatas = this._charRenderDatas;

    // prettier-ignore
    const e0 = e[0], e1 = e[1], e2 = e[2],
    e4 = e[4], e5 = e[5], e6 = e[6],
    e12 = e[12], e13 = e[13], e14 = e[14];

    const up = TextRenderer._tempVec31.set(e4, e5, e6);
    const right = TextRenderer._tempVec30.set(e0, e1, e2);

    for (let i = 0, n = charRenderDatas.length; i < n; ++i) {
      const charRenderData = charRenderDatas[i];
      const { localPositions } = charRenderData;
      const { positions } = charRenderData.renderData;

      const { x: topLeftX, y: topLeftY } = localPositions;

      // Top-Left
      const worldPosition0 = positions[0];
      worldPosition0.x = topLeftX * e0 + topLeftY * e4 + e12;
      worldPosition0.y = topLeftX * e1 + topLeftY * e5 + e13;
      worldPosition0.z = topLeftX * e2 + topLeftY * e6 + e14;

      // Right offset
      const worldPosition1 = positions[1];
      Vector3.scale(right, localPositions.z - topLeftX, worldPosition1);

      // Top-Right
      Vector3.add(worldPosition0, worldPosition1, worldPosition1);

      // Up offset
      const worldPosition2 = positions[2];
      Vector3.scale(up, localPositions.w - topLeftY, worldPosition2);

      // Bottom-Left
      Vector3.add(worldPosition0, worldPosition2, positions[3]);
      // Bottom-Right
      Vector3.add(worldPosition1, worldPosition2, worldPosition2);
    }
  }

  private _updateLocalData(): void {
    const { min, max } = this._localBounds;
    const { color, _charRenderDatas: charRenderDatas, _subFont: charFont } = this;
    const textMetrics = this.enableWrapping
      ? TextUtils.measureTextWithWrap(this)
      : TextUtils.measureTextWithoutWrap(this);
    const { height, lines, lineWidths, lineHeight, lineMaxSizes } = textMetrics;
    const charRenderDataPool = TextRenderer._charRenderDataPool;
    const linesLen = lines.length;
    let renderDataCount = 0;

    if (linesLen > 0) {
      const { _pixelsPerUnit } = Engine;
      const { horizontalAlignment } = this;
      const pixelsPerUnitReciprocal = 1.0 / _pixelsPerUnit;
      const rendererWidth = this.width * _pixelsPerUnit;
      const halfRendererWidth = rendererWidth * 0.5;
      const rendererHeight = this.height * _pixelsPerUnit;
      const halfLineHeight = lineHeight * 0.5;

      let startY = 0;
      const topDiff = lineHeight * 0.5 - lineMaxSizes[0].ascent;
      const bottomDiff = lineHeight * 0.5 - lineMaxSizes[linesLen - 1].descent - 1;
      switch (this.verticalAlignment) {
        case TextVerticalAlignment.Top:
          startY = rendererHeight * 0.5 - halfLineHeight + topDiff;
          break;
        case TextVerticalAlignment.Center:
          startY = height * 0.5 - halfLineHeight - (bottomDiff - topDiff) * 0.5;
          break;
        case TextVerticalAlignment.Bottom:
          startY = height - rendererHeight * 0.5 - halfLineHeight - bottomDiff;
          break;
      }

      let firstLine = -1;
      let minX = Number.MAX_SAFE_INTEGER;
      let minY = Number.MAX_SAFE_INTEGER;
      let maxX = Number.MIN_SAFE_INTEGER;
      let maxY = Number.MIN_SAFE_INTEGER;
      for (let i = 0; i < linesLen; ++i) {
        const lineWidth = lineWidths[i];
        if (lineWidth > 0) {
          const line = lines[i];
          let startX = 0;
          let firstRow = -1;
          if (firstLine < 0) {
            firstLine = i;
          }
          switch (horizontalAlignment) {
            case TextHorizontalAlignment.Left:
              startX = -halfRendererWidth;
              break;
            case TextHorizontalAlignment.Center:
              startX = -lineWidth * 0.5;
              break;
            case TextHorizontalAlignment.Right:
              startX = halfRendererWidth - lineWidth;
              break;
          }
          for (let j = 0, n = line.length; j < n; ++j) {
            const char = line[j];
            const charInfo = charFont._getCharInfo(char);
            if (charInfo.h > 0) {
              firstRow < 0 && (firstRow = j);
              const charRenderData = (charRenderDatas[renderDataCount++] ||= charRenderDataPool.get());
              const { renderData, localPositions } = charRenderData;
              charRenderData.texture = charFont._getTextureByIndex(charInfo.index);
              renderData.color = color;
              renderData.uvs = charInfo.uvs;

              const { w, ascent, descent } = charInfo;
              const left = startX * pixelsPerUnitReciprocal;
              const right = (startX + w) * pixelsPerUnitReciprocal;
              const top = (startY + ascent) * pixelsPerUnitReciprocal;
              const bottom = (startY - descent) * pixelsPerUnitReciprocal;
              localPositions.set(left, top, right, bottom);
              i === firstLine && (maxY = Math.max(maxY, top));
              minY = Math.min(minY, bottom);
              j === firstRow && (minX = Math.min(minX, left));
              maxX = Math.max(maxX, right);
            }
            startX += charInfo.xAdvance;
          }
        }
        startY -= lineHeight;
      }
      if (firstLine < 0) {
        min.set(0, 0, 0);
        max.set(0, 0, 0);
      } else {
        min.set(minX, minY, 0);
        max.set(maxX, maxY, 0);
      }
    } else {
      min.set(0, 0, 0);
      max.set(0, 0, 0);
    }

    // Revert excess render data to pool.
    const lastRenderDataCount = charRenderDatas.length;
    if (lastRenderDataCount > renderDataCount) {
      for (let i = renderDataCount; i < lastRenderDataCount; ++i) {
        charRenderDataPool.put(charRenderDatas[i]);
      }
      charRenderDatas.length = renderDataCount;
    }

    charFont._getLastIndex() > 0 &&
      charRenderDatas.sort((a, b) => {
        return a.texture.instanceId - b.texture.instanceId;
      });
  }

  /**
   * @internal
   */
  protected override _onTransformChanged(bit: TransformModifyFlags): void {
    super._onTransformChanged(bit);
    this._setDirtyFlagTrue(DirtyFlag.WorldPosition | DirtyFlag.WorldBounds);
  }

  private _isTextNoVisible(): boolean {
    return (
      this._text === "" ||
      this._fontSize === 0 ||
      (this.enableWrapping && this.width <= 0) ||
      (this.overflowMode === OverflowMode.Truncate && this.height <= 0)
    );
  }
}

enum DirtyFlag {
  SubFont = 0x1,
  LocalPositionBounds = 0x2,
  WorldPosition = 0x4,
  WorldBounds = 0x8,
  MaskInteraction = 0x10,

  Position = LocalPositionBounds | WorldPosition | WorldBounds,
  Font = SubFont | Position
}
