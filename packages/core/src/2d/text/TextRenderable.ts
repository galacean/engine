import { BoundingBox, Color, Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { BatchUtils } from "../../RenderPipeline/BatchUtils";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { SubRenderElement } from "../../RenderPipeline/SubRenderElement";
import { Renderer, RendererUpdateFlags } from "../../Renderer";
import { assignmentClone, ignoreClone } from "../../clone/CloneManager";
import { SpriteMaskLayer } from "../../enums/SpriteMaskLayer";
import { Material } from "../../material";
import { ShaderProperty } from "../../shader";
import { Texture2D } from "../../texture";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { FontStyle } from "../enums/FontStyle";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { CharRenderInfo } from "./CharRenderInfo";
import { Font } from "./Font";
import { ITextRenderer } from "./ITextRenderer";
import { SubFont } from "./SubFont";
import { TextUtils } from "./TextUtils";

/**
 * @remarks Extends `RendererUpdateFlags`.
 */
export enum TextRenderableFlags {
  /** Color. */
  Color = 0x2,
  /** SubFont needs reset. */
  SubFont = 0x4,
  /** Local positions and bounds need recalculation. */
  LocalPositionBounds = 0x8,
  /** World positions need update. */
  WorldPosition = 0x10,

  /** Position = WorldVolume | LocalPositionBounds | WorldPosition. */
  Position = 0x19,
  /** Font = SubFont | Position. */
  Font = 0x1d,
  /** All. */
  All = 0x1f
}

type RendererConstructor = abstract new (...args: any[]) => Renderer;

/**
 * Public contract of the TextRenderable mixin.
 */
export interface ITextRenderable {
  text: string;
  font: Font;
  fontSize: number;
  fontStyle: FontStyle;
  lineSpacing: number;
  characterSpacing: number;
  horizontalAlignment: TextHorizontalAlignment;
  verticalAlignment: TextVerticalAlignment;
  enableWrapping: boolean;
  overflowMode: OverflowMode;
  maskInteraction: SpriteMaskInteraction;
  maskLayer: SpriteMaskLayer;
  _maskInteraction: SpriteMaskInteraction;
  _maskLayer: SpriteMaskLayer;
  _subFont: SubFont;
  _getChunkManager(): PrimitiveChunkManager;
  _getSubFont(): SubFont;
  _getTextWidth(): number;
  _getTextHeight(): number;
  _getTextPivotX(): number;
  _getTextPivotY(): number;
  _getTextReferenceResolutionPerUnit(): number | undefined;
  _getTextAlpha(): number;
  _submitText(context: RenderContext, material: Material): void;
  _isTextHostInvisible(): boolean;
  _isContainDirtyFlag(type: number): boolean;
  _setDirtyFlagTrue(type: number): void;
  _setDirtyFlagFalse(type: number): void;
  _getTextChunks(): TextChunk[];
  _getTextTextureProperty(): ShaderProperty;
  _initTextRenderable(): void;
}

/**
 * Wiring mixin that provides shared text rendering logic for both 2D TextRenderer and UI Text.
 */
export function TextRenderable<T extends RendererConstructor>(
  Base: T
): (abstract new (...args: any[]) => ITextRenderable) & T {
  abstract class TextRenderableHost extends Base implements ITextRenderer {
    private static _textureProperty = ShaderProperty.getByName("renderElement_TextTexture");
    private static _tempVec30 = new Vector3();
    private static _tempVec31 = new Vector3();
    private static _worldPositions = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
    private static _charRenderInfos: CharRenderInfo[] = [];

    /** @internal */
    @assignmentClone
    _maskInteraction: SpriteMaskInteraction = SpriteMaskInteraction.None;
    /** @internal */
    @assignmentClone
    _maskLayer: SpriteMaskLayer = SpriteMaskLayer.Layer0;

    @ignoreClone
    private _textChunks = Array<TextChunk>();
    /** @internal */
    @assignmentClone
    _subFont: SubFont = null;
    @ignoreClone
    private _localBounds = new BoundingBox();
    @assignmentClone
    private _text = "";
    @assignmentClone
    private _font: Font = null;
    @assignmentClone
    private _fontSize = 24;
    @assignmentClone
    private _fontStyle = FontStyle.None;
    @assignmentClone
    private _lineSpacing = 0;
    @assignmentClone
    private _characterSpacing = 0;
    @assignmentClone
    private _horizontalAlignment = TextHorizontalAlignment.Center;
    @assignmentClone
    private _verticalAlignment = TextVerticalAlignment.Center;
    @assignmentClone
    private _enableWrapping = false;
    @assignmentClone
    private _overflowMode = OverflowMode.Overflow;

    // ===== Abstract methods =====

    abstract get color(): Color;
    abstract _getChunkManager(): PrimitiveChunkManager;
    abstract _submitText(context: RenderContext, material: Material): void;

    /** The text layout width. */
    abstract _getTextWidth(): number;

    /** The text layout height. */
    abstract _getTextHeight(): number;

    // ===== Methods with defaults =====

    _getTextAlpha(): number {
      return 1;
    }

    _isTextHostInvisible(): boolean {
      return false;
    }

    /** Text pivot X. Default: 0.5. */
    _getTextPivotX(): number {
      return 0.5;
    }

    /** Text pivot Y. Default: 0.5. */
    _getTextPivotY(): number {
      return 0.5;
    }

    /** Reference resolution per unit. Default: undefined (no scaling). */
    _getTextReferenceResolutionPerUnit(): number | undefined {
      return undefined;
    }

    // ===== Mask properties =====

    /**
     * The mask layer the renderer belongs to.
     */
    get maskLayer(): SpriteMaskLayer {
      return this._maskLayer;
    }

    set maskLayer(value: SpriteMaskLayer) {
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
      }
    }

    // ===== Text properties =====

    get text(): string {
      return this._text;
    }

    set text(value: string) {
      value = value || "";
      if (this._text !== value) {
        this._text = value;
        this._setDirtyFlagTrue(TextRenderableFlags.Position);
      }
    }

    get font(): Font {
      return this._font;
    }

    set font(value: Font) {
      const lastFont = this._font;
      if (lastFont !== value) {
        lastFont && this._addResourceReferCount(lastFont, -1);
        value && this._addResourceReferCount(value, 1);
        this._font = value;
        this._setDirtyFlagTrue(TextRenderableFlags.Font);
      }
    }

    get fontSize(): number {
      return this._fontSize;
    }

    set fontSize(value: number) {
      if (this._fontSize !== value) {
        this._fontSize = value;
        this._setDirtyFlagTrue(TextRenderableFlags.Font);
      }
    }

    get fontStyle(): FontStyle {
      return this._fontStyle;
    }

    set fontStyle(value: FontStyle) {
      if (this._fontStyle !== value) {
        this._fontStyle = value;
        this._setDirtyFlagTrue(TextRenderableFlags.Font);
      }
    }

    get lineSpacing(): number {
      return this._lineSpacing;
    }

    set lineSpacing(value: number) {
      if (this._lineSpacing !== value) {
        this._lineSpacing = value;
        this._setDirtyFlagTrue(TextRenderableFlags.Position);
      }
    }

    get characterSpacing(): number {
      return this._characterSpacing;
    }

    set characterSpacing(value: number) {
      if (this._characterSpacing !== value) {
        this._characterSpacing = value;
        this._setDirtyFlagTrue(TextRenderableFlags.Position);
      }
    }

    get horizontalAlignment(): TextHorizontalAlignment {
      return this._horizontalAlignment;
    }

    set horizontalAlignment(value: TextHorizontalAlignment) {
      if (this._horizontalAlignment !== value) {
        this._horizontalAlignment = value;
        this._setDirtyFlagTrue(TextRenderableFlags.Position);
      }
    }

    get verticalAlignment(): TextVerticalAlignment {
      return this._verticalAlignment;
    }

    set verticalAlignment(value: TextVerticalAlignment) {
      if (this._verticalAlignment !== value) {
        this._verticalAlignment = value;
        this._setDirtyFlagTrue(TextRenderableFlags.Position);
      }
    }

    get enableWrapping(): boolean {
      return this._enableWrapping;
    }

    set enableWrapping(value: boolean) {
      if (this._enableWrapping !== value) {
        this._enableWrapping = value;
        this._setDirtyFlagTrue(TextRenderableFlags.Position);
      }
    }

    get overflowMode(): OverflowMode {
      return this._overflowMode;
    }

    set overflowMode(value: OverflowMode) {
      if (this._overflowMode !== value) {
        this._overflowMode = value;
        this._setDirtyFlagTrue(TextRenderableFlags.Position);
      }
    }

    // ===== Bounds =====

    override get bounds(): BoundingBox {
      if (this._isTextNoVisible()) {
        if (this._isContainDirtyFlag(RendererUpdateFlags.WorldVolume)) {
          this._localBounds.min.set(0, 0, 0);
          this._localBounds.max.set(0, 0, 0);
          this._updateBounds(this._bounds);
          this._setDirtyFlagFalse(RendererUpdateFlags.WorldVolume);
        }
        return this._bounds;
      }
      this._isContainDirtyFlag(TextRenderableFlags.SubFont) && this._resetSubFont();
      this._isContainDirtyFlag(TextRenderableFlags.LocalPositionBounds) && this._updateLocalData();
      this._isContainDirtyFlag(TextRenderableFlags.WorldPosition) && this._updatePosition();
      this._isContainDirtyFlag(RendererUpdateFlags.WorldVolume) && this._updateBounds(this._bounds);
      this._setDirtyFlagFalse(TextRenderableFlags.Font);

      return this._bounds;
    }

    // ===== Init =====

    _initTextRenderable(): void {
      this.font = this._engine._textDefaultFont;
      this.setMaterial(this._engine._basicResources.textDefaultMaterial);
    }

    // ===== Lifecycle =====

    override _updateTransformShaderData(context: RenderContext, onlyMVP: boolean, batched: boolean): void {
      super._updateTransformShaderData(context, onlyMVP, true);
    }

    override _canBatch(elementA: SubRenderElement, elementB: SubRenderElement): boolean {
      return BatchUtils.canBatchSprite(elementA, elementB);
    }

    override _batch(elementA: SubRenderElement, elementB?: SubRenderElement): void {
      BatchUtils.batchFor2D(elementA, elementB);
    }

    // @ts-ignore
    override _cloneTo(target: TextRenderableHost): void {
      // @ts-ignore
      super._cloneTo(target);
      target.font = this._font;
      target._subFont = this._subFont;
    }

    protected override _updateBounds(worldBounds: BoundingBox): void {
      BoundingBox.transform(this._localBounds, this._transformEntity.transform.worldMatrix, worldBounds);
    }

    protected override _render(context: RenderContext): void {
      if (this._isTextNoVisible()) {
        return;
      }

      if (this._isContainDirtyFlag(TextRenderableFlags.SubFont)) {
        this._resetSubFont();
        this._setDirtyFlagFalse(TextRenderableFlags.SubFont);
      }

      if (this._isContainDirtyFlag(TextRenderableFlags.LocalPositionBounds)) {
        this._updateLocalData();
        this._setDirtyFlagFalse(TextRenderableFlags.LocalPositionBounds);
      }

      if (this._isContainDirtyFlag(TextRenderableFlags.WorldPosition)) {
        this._updatePosition();
        this._setDirtyFlagFalse(TextRenderableFlags.WorldPosition);
      }

      if (this._isContainDirtyFlag(TextRenderableFlags.Color)) {
        this._updateColor();
        this._setDirtyFlagFalse(TextRenderableFlags.Color);
      }

      const material = this.getMaterial();
      if (!material) {
        return;
      }

      this._submitText(context, material);
    }

    protected override _onDestroy(): void {
      if (this._font) {
        this._addResourceReferCount(this._font, -1);
        this._font = null;
      }

      super._onDestroy();

      this._freeTextChunks();
      this._textChunks = null;
      this._subFont && (this._subFont = null);
    }

    @ignoreClone
    protected override _onTransformChanged(type: number): void {
      super._onTransformChanged(type);
      this._setDirtyFlagTrue(TextRenderableFlags.WorldPosition);
    }

    // ===== Shared text methods =====

    _isContainDirtyFlag(type: number): boolean {
      return (this._dirtyUpdateFlag & type) != 0;
    }

    _setDirtyFlagTrue(type: number): void {
      this._dirtyUpdateFlag |= type;
    }

    _setDirtyFlagFalse(type: number): void {
      this._dirtyUpdateFlag &= ~type;
    }

    _getSubFont(): SubFont {
      if (!this._subFont) {
        this._resetSubFont();
      }
      return this._subFont;
    }

    /** @internal Accessible by hosts for submit loop. */
    _getTextChunks(): TextChunk[] {
      return this._textChunks;
    }

    /** @internal Texture property for sub-render element shader data. */
    _getTextTextureProperty(): ShaderProperty {
      return TextRenderableHost._textureProperty;
    }

    // ===== Private =====

    private _isTextNoVisible(): boolean {
      const textWidth = this._getTextWidth();
      const textHeight = this._getTextHeight();
      return (
        !this._font ||
        this._text === "" ||
        this._fontSize === 0 ||
        (this._enableWrapping && textWidth <= 0) ||
        (this._overflowMode === OverflowMode.Truncate && textHeight <= 0) ||
        this._isTextHostInvisible()
      );
    }

    private _resetSubFont(): void {
      const font = this._font;
      this._subFont = font._getSubFont(this.fontSize, this.fontStyle);
      this._subFont.nativeFontString = TextUtils.getNativeFontString(font.name, this.fontSize, this.fontStyle);
    }

    private _updatePosition(): void {
      const e = this._transformEntity.transform.worldMatrix.elements;

      // prettier-ignore
      const e0 = e[0], e1 = e[1], e2 = e[2],
        e4 = e[4], e5 = e[5], e6 = e[6],
        e12 = e[12], e13 = e[13], e14 = e[14];

      const up = TextRenderableHost._tempVec31.set(e4, e5, e6);
      const right = TextRenderableHost._tempVec30.set(e0, e1, e2);

      const worldPositions = TextRenderableHost._worldPositions;
      const worldPosition0 = worldPositions[0];
      const worldPosition1 = worldPositions[1];
      const worldPosition2 = worldPositions[2];
      const worldPosition3 = worldPositions[3];

      const textChunks = this._textChunks;
      for (let i = 0, n = textChunks.length; i < n; ++i) {
        const { subChunk, charRenderInfos } = textChunks[i];
        for (let j = 0, m = charRenderInfos.length; j < m; ++j) {
          const charRenderInfo = charRenderInfos[j];
          const { localPositions } = charRenderInfo;
          const { x: topLeftX, y: topLeftY } = localPositions;

          // Top-Left
          worldPosition0.set(
            topLeftX * e0 + topLeftY * e4 + e12,
            topLeftX * e1 + topLeftY * e5 + e13,
            topLeftX * e2 + topLeftY * e6 + e14
          );

          // Right offset
          Vector3.scale(right, localPositions.z - topLeftX, worldPosition1);
          // Top-Right
          Vector3.add(worldPosition0, worldPosition1, worldPosition1);
          // Up offset
          Vector3.scale(up, localPositions.w - topLeftY, worldPosition2);
          // Bottom-Left
          Vector3.add(worldPosition0, worldPosition2, worldPosition3);
          // Bottom-Right
          Vector3.add(worldPosition1, worldPosition2, worldPosition2);

          const vertices = subChunk.chunk.vertices;
          for (let k = 0, o = subChunk.vertexArea.start + charRenderInfo.indexInChunk * 36; k < 4; ++k, o += 9) {
            worldPositions[k].copyToArray(vertices, o);
          }
        }
      }
    }

    private _updateColor(): void {
      const { r, g, b, a } = this.color;
      const finalAlpha = a * this._getTextAlpha();
      const textChunks = this._textChunks;
      for (let i = 0, n = textChunks.length; i < n; ++i) {
        const subChunk = textChunks[i].subChunk;
        const vertexArea = subChunk.vertexArea;
        const vertexCount = vertexArea.size / 9;
        const vertices = subChunk.chunk.vertices;
        for (let j = 0, o = vertexArea.start + 5; j < vertexCount; ++j, o += 9) {
          vertices[o] = r;
          vertices[o + 1] = g;
          vertices[o + 2] = b;
          vertices[o + 3] = finalAlpha;
        }
      }
    }

    private _updateLocalData(): void {
      let rendererWidth = this._getTextWidth();
      let rendererHeight = this._getTextHeight();
      const pivotX = this._getTextPivotX();
      const pivotY = this._getTextPivotY();
      const resPerUnit = this._getTextReferenceResolutionPerUnit();
      const pixelsPerUnit = resPerUnit ? Engine._pixelsPerUnit / resPerUnit : Engine._pixelsPerUnit;
      const offsetWidth = rendererWidth * (0.5 - pivotX);
      const offsetHeight = rendererHeight * (0.5 - pivotY);

      const { min, max } = this._localBounds;
      const charRenderInfos = TextRenderableHost._charRenderInfos;
      const charFont = this._getSubFont();
      const characterSpacing = this._characterSpacing * this._fontSize;
      const textMetrics = this._enableWrapping
        ? TextUtils.measureTextWithWrap(
            this,
            rendererWidth * pixelsPerUnit,
            rendererHeight * pixelsPerUnit,
            this._lineSpacing * this._fontSize,
            characterSpacing
          )
        : TextUtils.measureTextWithoutWrap(
            this,
            rendererHeight * pixelsPerUnit,
            this._lineSpacing * this._fontSize,
            characterSpacing
          );
      const { height, lines, lineWidths, lineHeight, lineMaxSizes } = textMetrics;
      const charRenderInfoPool = this.engine._charRenderInfoPool;
      const linesLen = lines.length;
      let renderElementCount = 0;

      if (linesLen > 0) {
        const { horizontalAlignment } = this;
        const pixelsPerUnitReciprocal = 1.0 / pixelsPerUnit;
        rendererWidth *= pixelsPerUnit;
        rendererHeight *= pixelsPerUnit;
        const halfRendererWidth = rendererWidth * 0.5;
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
                const charRenderInfo = (charRenderInfos[renderElementCount++] = charRenderInfoPool.get());
                const { localPositions } = charRenderInfo;
                charRenderInfo.texture = charFont._getTextureByIndex(charInfo.index);
                charRenderInfo.uvs = charInfo.uvs;
                const { w, ascent, descent } = charInfo;
                const left = (startX + offsetWidth) * pixelsPerUnitReciprocal;
                const right = (startX + w + offsetWidth) * pixelsPerUnitReciprocal;
                const top = (startY + ascent + offsetHeight) * pixelsPerUnitReciprocal;
                const bottom = (startY - descent + offsetHeight) * pixelsPerUnitReciprocal;
                localPositions.set(left, top, right, bottom);
                i === firstLine && (maxY = Math.max(maxY, top));
                minY = Math.min(minY, bottom);
                j === firstRow && (minX = Math.min(minX, left));
                maxX = Math.max(maxX, right);
              }
              startX += charInfo.xAdvance + characterSpacing;
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

      charFont._getLastIndex() > 0 &&
        charRenderInfos.sort((a, b) => {
          return a.texture.instanceId - b.texture.instanceId;
        });

      this._freeTextChunks();

      if (renderElementCount === 0) {
        return;
      }

      const textChunks = this._textChunks;
      let curTextChunk = new TextChunk();
      textChunks.push(curTextChunk);

      const chunkMaxVertexCount = this._getChunkManager().maxVertexCount;
      const curCharRenderInfo = charRenderInfos[0];
      let curTexture = curCharRenderInfo.texture;
      curTextChunk.texture = curTexture;
      let curCharInfos = curTextChunk.charRenderInfos;
      curCharInfos.push(curCharRenderInfo);

      for (let i = 1; i < renderElementCount; ++i) {
        const charRenderInfo = charRenderInfos[i];
        const texture = charRenderInfo.texture;
        if (curTexture !== texture || curCharInfos.length * 4 + 4 > chunkMaxVertexCount) {
          this._buildChunk(curTextChunk, curCharInfos.length);

          curTextChunk = new TextChunk();
          textChunks.push(curTextChunk);
          curTexture = texture;
          curTextChunk.texture = texture;
          curCharInfos = curTextChunk.charRenderInfos;
        }
        curCharInfos.push(charRenderInfo);
      }
      const charLength = curCharInfos.length;
      if (charLength > 0) {
        this._buildChunk(curTextChunk, charLength);
      }
      charRenderInfos.length = 0;
    }

    private _buildChunk(textChunk: TextChunk, count: number): SubPrimitiveChunk {
      const { r, g, b, a } = this.color;
      const finalAlpha = a * this._getTextAlpha();
      const tempIndices = CharRenderInfo.triangles;
      const tempIndicesLength = tempIndices.length;
      const subChunk = (textChunk.subChunk = this._getChunkManager().allocateSubChunk(count * 4));
      const vertices = subChunk.chunk.vertices;
      const indices = (subChunk.indices = []);
      const charRenderInfos = textChunk.charRenderInfos;
      for (let i = 0, ii = 0, io = 0, vo = subChunk.vertexArea.start + 3; i < count; ++i, io += 4) {
        const charRenderInfo = charRenderInfos[i];
        charRenderInfo.indexInChunk = i;

        // Set indices
        for (let j = 0; j < tempIndicesLength; ++j) {
          indices[ii++] = tempIndices[j] + io;
        }

        // Set uv and color for vertices
        for (let j = 0; j < 4; ++j, vo += 9) {
          const uv = charRenderInfo.uvs[j];
          uv.copyToArray(vertices, vo);
          vertices[vo + 2] = r;
          vertices[vo + 3] = g;
          vertices[vo + 4] = b;
          vertices[vo + 5] = finalAlpha;
        }
      }

      return subChunk;
    }

    private _freeTextChunks(): void {
      const textChunks = this._textChunks;
      const charRenderInfoPool = this.engine._charRenderInfoPool;
      const manager = this._getChunkManager();
      for (let i = 0, n = textChunks.length; i < n; ++i) {
        const textChunk = textChunks[i];
        const { charRenderInfos } = textChunk;
        for (let j = 0, m = charRenderInfos.length; j < m; ++j) {
          charRenderInfoPool.return(charRenderInfos[j]);
        }
        charRenderInfos.length = 0;
        manager.freeSubChunk(textChunk.subChunk);
        textChunk.subChunk = null;
        textChunk.texture = null;
      }
      textChunks.length = 0;
    }
  }

  return TextRenderableHost as unknown as (abstract new (...args: any[]) => ITextRenderable) & T;
}

/** @internal */
export class TextChunk {
  charRenderInfos = new Array<CharRenderInfo>();
  subChunk: SubPrimitiveChunk;
  texture: Texture2D;
}
