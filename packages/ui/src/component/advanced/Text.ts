import {
  BoundingBox,
  CharRenderInfo,
  Engine,
  Entity,
  Font,
  FontStyle,
  ITextRenderer,
  OverflowMode,
  RendererUpdateFlags,
  ShaderData,
  ShaderDataGroup,
  ShaderProperty,
  SubFont,
  TextHorizontalAlignment,
  TextUtils,
  TextVerticalAlignment,
  Texture2D,
  Vector3,
  ignoreClone
} from "@galacean/engine";
import { CanvasRenderMode } from "../../enums/CanvasRenderMode";
import { RootCanvasModifyFlags } from "../UICanvas";
import { UIRenderer, UIRendererUpdateFlags } from "../UIRenderer";
import { UITransform, UITransformModifyFlags } from "../UITransform";

/**
 * UI component used to render text.
 */
export class Text extends UIRenderer implements ITextRenderer {
  private static _textTextureProperty = ShaderProperty.getByName("renderElement_TextTexture");
  private static _worldPositions = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  private static _charRenderInfos: CharRenderInfo[] = [];

  @ignoreClone
  private _textChunks = Array<TextChunk>();
  @ignoreClone
  private _subFont: SubFont = null;
  private _text: string = "";
  @ignoreClone
  private _localBounds: BoundingBox = new BoundingBox();
  private _font: Font = null;
  private _fontSize: number = 24;
  private _fontStyle: FontStyle = FontStyle.None;
  private _lineSpacing: number = 0;
  private _characterSpacing: number = 0;
  private _horizontalAlignment: TextHorizontalAlignment = TextHorizontalAlignment.Center;
  private _verticalAlignment: TextVerticalAlignment = TextVerticalAlignment.Center;
  private _enableWrapping: boolean = false;
  private _overflowMode: OverflowMode = OverflowMode.Overflow;

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
   * The space between two lines, in em (ratio of fontSize).
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
   * The space between two characters, in em (ratio of fontSize).
   */
  get characterSpacing(): number {
    return this._characterSpacing;
  }

  set characterSpacing(value: number) {
    if (this._characterSpacing !== value) {
      this._characterSpacing = value;
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
      if (this._isContainDirtyFlag(RendererUpdateFlags.WorldVolume)) {
        const localBounds = this._localBounds;
        localBounds.min.set(0, 0, 0);
        localBounds.max.set(0, 0, 0);
        this._updateBounds(this._bounds);
        this._setDirtyFlagFalse(RendererUpdateFlags.WorldVolume);
      }
      return this._bounds;
    }
    this._isContainDirtyFlag(DirtyFlag.SubFont) && this._resetSubFont();
    this._isContainDirtyFlag(DirtyFlag.LocalPositionBounds) && this._updateLocalData();
    this._isContainDirtyFlag(DirtyFlag.WorldPosition) && this._updatePosition();
    this._isContainDirtyFlag(RendererUpdateFlags.WorldVolume) && this._updateBounds(this._bounds);
    this._setDirtyFlagFalse(DirtyFlag.Font);

    return this._bounds;
  }

  constructor(entity: Entity) {
    super(entity);
    const { engine } = this;
    this.font = engine._textDefaultFont;
    this.raycastEnabled = false;
    this.setMaterial(engine._basicResources.textDefaultMaterial);
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
  _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyUpdateFlag & type) != 0;
  }

  /**
   * @internal
   */
  _setDirtyFlagTrue(type: number): void {
    this._dirtyUpdateFlag |= type;
  }

  /**
   * @internal
   */
  _setDirtyFlagFalse(type: number): void {
    this._dirtyUpdateFlag &= ~type;
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
  _onRootCanvasModify(flag: RootCanvasModifyFlags): void {
    if (flag === RootCanvasModifyFlags.ReferenceResolutionPerUnit) {
      this._setDirtyFlagTrue(DirtyFlag.Position);
    }
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const transform = <UITransform>this._transformEntity.transform;
    const { x: width, y: height } = transform.size;
    const { x: pivotX, y: pivotY } = transform.pivot;
    worldBounds.min.set(-width * pivotX, -height * pivotY, 0);
    worldBounds.max.set(width * (1 - pivotX), height * (1 - pivotY), 0);
    BoundingBox.transform(worldBounds, this._transformEntity.transform.worldMatrix, worldBounds);
  }

  protected override _render(context): void {
    if (this._isTextNoVisible()) {
      return;
    }

    if (this._isContainDirtyFlag(DirtyFlag.SubFont)) {
      this._resetSubFont();
      this._setDirtyFlagFalse(DirtyFlag.SubFont);
    }

    const canvas = this._getRootCanvas();
    if (this._isContainDirtyFlag(DirtyFlag.LocalPositionBounds)) {
      this._updateLocalData();
      this._setDirtyFlagFalse(DirtyFlag.LocalPositionBounds);
    }

    if (this._isContainDirtyFlag(DirtyFlag.WorldPosition)) {
      this._updatePosition();
      this._setDirtyFlagFalse(DirtyFlag.WorldPosition);
    }

    if (this._isContainDirtyFlag(UIRendererUpdateFlags.Color)) {
      this._updateColor();
      this._setDirtyFlagFalse(UIRendererUpdateFlags.Color);
    }

    const engine = context.camera.engine;
    const textRenderElementPool = engine._textRenderElementPool;
    const material = this.getMaterial();
    const renderElements = canvas._renderElements;
    const priority = canvas.sortOrder;
    const distanceForSort = canvas._sortDistance;
    const textChunks = this._textChunks;
    const subShader = material.shader.subShaders[0];
    for (let i = 0, n = textChunks.length; i < n; ++i) {
      const { subChunk, texture } = textChunks[i];
      const renderElement = textRenderElementPool.get();
      renderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, texture, subChunk);
      renderElement.shaderData ||= new ShaderData(ShaderDataGroup.RenderElement);
      renderElement.shaderData.setTexture(Text._textTextureProperty, texture);
      renderElement.subShader = subShader;
      renderElement.priority = priority;
      renderElement.distanceForSort = distanceForSort;
      renderElements.push(renderElement);
    }
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

    const up = UIRenderer._tempVec31.set(e4, e5, e6);
    const right = UIRenderer._tempVec30.set(e0, e1, e2);

    const worldPositions = Text._worldPositions;
    const [worldPosition0, worldPosition1, worldPosition2, worldPosition3] = worldPositions;
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
    const finalAlpha = a * this._getGlobalAlpha();
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
    const pixelsPerResolution = Engine._pixelsPerUnit / this._getRootCanvas().referenceResolutionPerUnit;
    const { min, max } = this._localBounds;
    const charRenderInfos = Text._charRenderInfos;
    const charFont = this._getSubFont();
    const { size, pivot } = <UITransform>this._transformEntity.transform;
    let rendererWidth = size.x;
    let rendererHeight = size.y;
    const offsetWidth = rendererWidth * (0.5 - pivot.x);
    const offsetHeight = rendererHeight * (0.5 - pivot.y);
    const characterSpacing = this._characterSpacing * this._fontSize;
    const textMetrics = this.enableWrapping
      ? TextUtils.measureTextWithWrap(
          this,
          rendererWidth * pixelsPerResolution,
          rendererHeight * pixelsPerResolution,
          this._lineSpacing * this._fontSize,
          characterSpacing
        )
      : TextUtils.measureTextWithoutWrap(
          this,
          rendererHeight * pixelsPerResolution,
          this._lineSpacing * this._fontSize,
          characterSpacing
        );
    const { height, lines, lineWidths, lineHeight, lineMaxSizes } = textMetrics;
    const charRenderInfoPool = this.engine._charRenderInfoPool;
    const linesLen = lines.length;
    let renderElementCount = 0;

    if (linesLen > 0) {
      const { horizontalAlignment } = this;
      const pixelsPerUnitReciprocal = 1.0 / pixelsPerResolution;
      rendererWidth *= pixelsPerResolution;
      rendererHeight *= pixelsPerResolution;
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

  @ignoreClone
  protected override _onTransformChanged(type: number): void {
    if (type & UITransformModifyFlags.Size || type & UITransformModifyFlags.Pivot) {
      this._dirtyUpdateFlag |= DirtyFlag.LocalPositionBounds;
    }
    super._onTransformChanged(type);
    this._setDirtyFlagTrue(DirtyFlag.WorldPosition);
  }

  private _isTextNoVisible(): boolean {
    const size = (<UITransform>this._transformEntity.transform).size;
    return (
      !this._font ||
      this._text === "" ||
      this._fontSize === 0 ||
      (this.enableWrapping && size.x <= 0) ||
      (this.overflowMode === OverflowMode.Truncate && size.y <= 0) ||
      !this._getRootCanvas()
    );
  }

  private _buildChunk(textChunk: TextChunk, count: number) {
    const { r, g, b, a } = this.color;
    const finalAlpha = a * this._getGlobalAlpha();
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

class TextChunk {
  charRenderInfos = new Array<CharRenderInfo>();
  texture: Texture2D;
  subChunk;
}

/**
 * @remarks Extends `UIRendererUpdateFlags`.
 */
enum DirtyFlag {
  SubFont = 0x4,
  LocalPositionBounds = 0x8,
  WorldPosition = 0x10,

  // LocalPositionBounds | WorldPosition | WorldVolume
  Position = 0x19,
  Font = SubFont | Position
}
