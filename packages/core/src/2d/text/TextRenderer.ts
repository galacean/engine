import { BoundingBox, Color, Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { Entity } from "../../Entity";
import { BatchUtils } from "../../RenderPipeline/BatchUtils";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { SubRenderElement } from "../../RenderPipeline/SubRenderElement";
import { Renderer } from "../../Renderer";
import { TransformModifyFlags } from "../../Transform";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderData, ShaderProperty } from "../../shader";
import { CompareFunction } from "../../shader/enums/CompareFunction";
import { ShaderDataGroup } from "../../shader/enums/ShaderDataGroup";
import { Texture2D } from "../../texture";
import { FontStyle } from "../enums/FontStyle";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { CharRenderInfo } from "./CharRenderInfo";
import { Font } from "./Font";
import { SubFont } from "./SubFont";
import { TextUtils } from "./TextUtils";

/**
 * Renders a text for 2D graphics.
 */
export class TextRenderer extends Renderer {
  private static _textureProperty = ShaderProperty.getByName("renderElement_TextTexture");
  private static _tempVec30 = new Vector3();
  private static _tempVec31 = new Vector3();
  private static _worldPositions = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  private static _charRenderInfos: CharRenderInfo[] = [];

  /** @internal */
  @ignoreClone
  _textChunks = Array<TextChunk>();
  /** @internal */
  @assignmentClone
  _subFont: SubFont = null;
  /** @internal */
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

  /**
   * Rendering color for the Text.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    if (this._color !== value) {
      this._color.copyFrom(value);
      this._setDirtyFlagTrue(DirtyFlag.Color);
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

    const { engine } = this;
    this._font = engine._textDefaultFont;
    this._addResourceReferCount(this._font, 1);
    this.setMaterial(engine._textDefaultMaterial);
    this._color._onValueChanged = this._onColorChanged.bind(this);
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

    this._freeTextChunks();
    this._textChunks = null;

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
  _getSubFont(): SubFont {
    if (!this._subFont) {
      this._resetSubFont();
    }
    return this._subFont;
  }

  /**
   * @internal
   */
  override _updateTransformShaderData(context: RenderContext, onlyMVP: boolean, batched: boolean): void {
    //@todo: Always update world positions to buffer, should opt
    super._updateTransformShaderData(context, onlyMVP, true);
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

  /**
   * @internal
   */
  _getChunkManager(): PrimitiveChunkManager {
    return this.engine._batcherManager.primitiveChunkManager2D;
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    BoundingBox.transform(this._localBounds, this._entity.transform.worldMatrix, worldBounds);
  }

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

    if (this._isContainDirtyFlag(DirtyFlag.Color)) {
      this._updateColor();
      this._setDirtyFlagFalse(DirtyFlag.Color);
    }

    const camera = context.camera;
    const engine = camera.engine;
    const textSubRenderElementPool = engine._textSubRenderElementPool;
    const material = this.getMaterial();
    const renderElement = engine._renderElementPool.get();
    renderElement.set(this.priority, this._distanceForSort);
    const textChunks = this._textChunks;
    for (let i = 0, n = textChunks.length; i < n; ++i) {
      const { subChunk, texture } = textChunks[i];
      const subRenderElement = textSubRenderElementPool.get();
      subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, texture, subChunk);
      subRenderElement.shaderData ||= new ShaderData(ShaderDataGroup.RenderElement);
      subRenderElement.shaderData.setTexture(TextRenderer._textureProperty, texture);
      renderElement.addSubRenderElement(subRenderElement);
    }
    camera._renderPipeline.pushRenderElement(context, renderElement);
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

    // prettier-ignore
    const e0 = e[0], e1 = e[1], e2 = e[2],
    e4 = e[4], e5 = e[5], e6 = e[6],
    e12 = e[12], e13 = e[13], e14 = e[14];

    const up = TextRenderer._tempVec31.set(e4, e5, e6);
    const right = TextRenderer._tempVec30.set(e0, e1, e2);

    const worldPositions = TextRenderer._worldPositions;
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
    const { r, g, b, a } = this._color;
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
        vertices[o + 3] = a;
      }
    }
  }

  private _updateLocalData(): void {
    const { min, max } = this._localBounds;
    const charRenderInfos = TextRenderer._charRenderInfos;
    const charFont = this._subFont;
    const textMetrics = this.enableWrapping
      ? TextUtils.measureTextWithWrap(this)
      : TextUtils.measureTextWithoutWrap(this);
    const { height, lines, lineWidths, lineHeight, lineMaxSizes } = textMetrics;
    const charRenderInfoPool = this.engine._charRenderInfoPool;
    const linesLen = lines.length;
    let renderElementCount = 0;

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
              const charRenderInfo = (charRenderInfos[renderElementCount++] = charRenderInfoPool.get());
              const { localPositions } = charRenderInfo;
              charRenderInfo.texture = charFont._getTextureByIndex(charInfo.index);
              charRenderInfo.uvs = charInfo.uvs;
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

  private _buildChunk(textChunk: TextChunk, count: number): SubPrimitiveChunk {
    const { r, g, b, a } = this.color;
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
        vertices[vo + 5] = a;
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

  @ignoreClone
  private _onColorChanged(): void {
    this._setDirtyFlagTrue(DirtyFlag.Color);
  }
}

class TextChunk {
  charRenderInfos = new Array<CharRenderInfo>();
  subChunk: SubPrimitiveChunk;
  texture: Texture2D;
}

enum DirtyFlag {
  SubFont = 0x1,
  LocalPositionBounds = 0x2,
  WorldPosition = 0x4,
  WorldBounds = 0x8,
  MaskInteraction = 0x10,
  Color = 0x20,

  Position = LocalPositionBounds | WorldPosition | WorldBounds,
  Font = SubFont | Position
}
