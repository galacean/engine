import {
  BoundingBox,
  CharRenderInfo,
  Entity,
  Font,
  FontStyle,
  OverflowMode,
  RenderQueueFlags,
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
  assignmentClone,
  ignoreClone
} from "@galacean/engine";
import { CanvasRenderMode } from "../../enums/CanvasRenderMode";
import { UIRenderer, UIRendererUpdateFlags } from "../UIRenderer";
import { UITransform, UITransformModifyFlags } from "../UITransform";

export class Label extends UIRenderer {
  private static _textTextureProperty = ShaderProperty.getByName("renderElement_TextTexture");
  private static _worldPositions = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  private static _charRenderInfos: CharRenderInfo[] = [];

  @ignoreClone
  private _textChunks = Array<TextChunk>();
  @ignoreClone
  private _subFont: SubFont = null;
  @assignmentClone
  private _text: string = "";
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
   * Rendering string for the Text.
   */
  get text(): string {
    return this._text;
  }

  set text(value: string) {
    value = value || "";
    if (this._text !== value) {
      this._text = value;
      this._setDirtyFlagTrue(RendererUpdateFlags.AllPositionAndBounds);
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
      this._setDirtyFlagTrue(UITextUpdateFlags.FontAllPositionAndBounds);
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
      this._setDirtyFlagTrue(UITextUpdateFlags.FontAllPositionAndBounds);
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
      this._setDirtyFlagTrue(RendererUpdateFlags.AllPositionAndBounds);
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
      this._setDirtyFlagTrue(RendererUpdateFlags.AllPositionAndBounds);
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
      this._setDirtyFlagTrue(RendererUpdateFlags.AllPositionAndBounds);
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
      this._setDirtyFlagTrue(RendererUpdateFlags.AllPositionAndBounds);
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
      this._setDirtyFlagTrue(RendererUpdateFlags.AllPositionAndBounds);
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
      this._setDirtyFlagTrue(RendererUpdateFlags.AllPositionAndBounds);
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

  protected override _updateLocalBounds(localBounds: BoundingBox): void {
    if (this._isTextNoVisible()) {
      localBounds.min.set(0, 0, 0);
      localBounds.max.set(0, 0, 0);
    } else {
      this._updateLocalData();
    }
  }

  constructor(entity: Entity) {
    super(entity);
    const { engine } = this;
    // @ts-ignore
    this.font = engine._textDefaultFont;
    // @ts-ignore
    this.setMaterial(engine._basicResources.textDefaultMaterial);
  }
  z;

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

  // @ts-ignore
  override _cloneTo(target: Label, srcRoot: Entity, targetRoot: Entity): void {
    // @ts-ignore
    super._cloneTo(target, srcRoot, targetRoot);
    target.font = this._font;
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
    if (this._dirtyUpdateFlag & UITextUpdateFlags.SubFont) {
      const { fontSize, fontStyle, _font: font } = this;
      // @ts-ignore
      this._subFont = font._getSubFont(fontSize, fontStyle);
      this._subFont.nativeFontString = TextUtils.getNativeFontString(font.name, fontSize, fontStyle);
      this._setDirtyFlagFalse(UITextUpdateFlags.SubFont);
    }
    return this._subFont;
  }

  protected override _render(context): void {
    if (this._isTextNoVisible()) {
      return;
    }

    if (this._isContainDirtyFlag(RendererUpdateFlags.LocalPosition)) {
      this._updateLocalData();
      this._setDirtyFlagFalse(RendererUpdateFlags.LocalPositionAndBounds);
    }

    if (this._isContainDirtyFlag(RendererUpdateFlags.WorldPosition)) {
      this._updatePosition();
      this._setDirtyFlagFalse(RendererUpdateFlags.WorldPosition);
    }

    if (this._isContainDirtyFlag(UIRendererUpdateFlags.Color)) {
      this._updateColor();
      this._setDirtyFlagFalse(UIRendererUpdateFlags.Color);
    }

    const engine = context.camera.engine;
    const textSubRenderElementPool = engine._textSubRenderElementPool;
    const material = this.getMaterial();
    const canvas = this._rootCanvas;
    const renderElement = canvas._renderElement;
    const textChunks = this._textChunks;
    const isOverlay = canvas._realRenderMode === CanvasRenderMode.ScreenSpaceOverlay;
    for (let i = 0, n = textChunks.length; i < n; ++i) {
      const { subChunk, texture } = textChunks[i];
      const subRenderElement = textSubRenderElementPool.get();
      subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, texture, subChunk);
      // @ts-ignore
      subRenderElement.shaderData ||= new ShaderData(ShaderDataGroup.RenderElement);
      subRenderElement.shaderData.setTexture(Label._textTextureProperty, texture);
      if (isOverlay) {
        subRenderElement.shaderPasses = material.shader.subShaders[0].passes;
        subRenderElement.renderQueueFlags = RenderQueueFlags.All;
      }
      renderElement.addSubRenderElement(subRenderElement);
    }
  }

  private _updatePosition(): void {
    const { transform } = this.entity;
    const e = transform.worldMatrix.elements;

    // prettier-ignore
    const e0 = e[0], e1 = e[1], e2 = e[2],
          e4 = e[4], e5 = e[5], e6 = e[6],
          e12 = e[12], e13 = e[13], e14 = e[14];

    const up = UIRenderer._tempVec31.set(e4, e5, e6);
    const right = UIRenderer._tempVec30.set(e0, e1, e2);

    const worldPositions = Label._worldPositions;
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
    const charRenderInfos = Label._charRenderInfos;
    const charFont = this._getSubFont();
    const size = (<UITransform>this._transform).size;
    const rendererWidth = size.x;
    const rendererHeight = size.y;
    const textMetrics = this.enableWrapping
      ? TextUtils.measureTextWithWrap(this, rendererWidth, rendererHeight, this._lineSpacing)
      : TextUtils.measureTextWithoutWrap(this, rendererHeight, this._lineSpacing);
    const { height, lines, lineWidths, lineHeight, lineMaxSizes } = textMetrics;
    // @ts-ignore
    const charRenderInfoPool = this.engine._charRenderInfoPool;
    const linesLen = lines.length;
    let renderElementCount = 0;

    if (linesLen > 0) {
      const { horizontalAlignment } = this;
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
              const left = startX;
              const right = startX + w;
              const top = startY + ascent;
              const bottom = startY - descent;
              localPositions.set(left, top, right, bottom);
              i === firstLine && (maxY = Math.max(maxY, top));
              minY = Math.min(minY, bottom);
              j === firstRow && (minX = Math.min(minX, left));
              maxX = Math.max(maxX, right);
            }
            startX += charInfo.xAdvance + charInfo.offsetX;
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
    this._setDirtyFlagFalse(RendererUpdateFlags.LocalPositionAndBounds);
  }

  @ignoreClone
  protected override _onTransformChanged(type: number): void {
    if (type & UITransformModifyFlags.Size || type & UITransformModifyFlags.Pivot) {
      this._dirtyUpdateFlag |= RendererUpdateFlags.LocalPositionAndBounds;
    }
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldPositionAndBounds;
  }

  private _isTextNoVisible(): boolean {
    const size = (<UITransform>this._transform).size;
    return (
      this._text === "" ||
      this._fontSize === 0 ||
      (this.enableWrapping && size.x <= 0) ||
      (this.overflowMode === OverflowMode.Truncate && size.y <= 0)
    );
  }

  private _buildChunk(textChunk: TextChunk, count: number) {
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
    // @ts-ignore
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
 * @remarks Extends `RendererUpdateFlags`.
 */
enum UITextUpdateFlags {
  SubFont = 0x20,

  /** SubFont | LocalPosition | WorldPosition | LocalBounds | WorldBounds */
  FontAllPositionAndBounds = 0x2f,
  /** SubFont | LocalPosition | WorldPosition | Color | LocalBounds | WorldBounds */
  All = 0x3f
}
