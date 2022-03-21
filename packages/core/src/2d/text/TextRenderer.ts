import { BoundingBox, Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Sprite, SpriteMaskInteraction, SpriteMaskLayer } from "..";
import { CompareFunction, Renderer, Shader, UpdateFlag } from "../..";
import { Camera } from "../../Camera";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { Entity } from "../../Entity";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { Texture2D } from "../../texture";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { Font } from "./Font";
import { TextStyle } from "./TextStyle";
import { TextUtils } from "./TextUtils";

export class TextRenderer extends Renderer {
  private static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_spriteTexture");
  private static _tempVec2: Vector2 = new Vector2();
  private static _tempVec3: Vector3 = new Vector3();

  /** @internal temp solution. */
  @ignoreClone
  _customLocalBounds: BoundingBox = null;
  /** @internal temp solution. */
  @ignoreClone
  _customRootEntity: Entity = null;

  @assignmentClone
  private _sprite: Sprite = null;
  @deepClone
  private _positions: Vector3[] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
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
  private _lineSpacing: number = 0;
  @assignmentClone
  private _horizontalAlignment: TextHorizontalAlignment = TextHorizontalAlignment.Center;
  @assignmentClone
  private _verticalAlignment: TextVerticalAlignment = TextVerticalAlignment.Center;
  @assignmentClone
  private _enableWarpping: boolean = false;
  @assignmentClone
  private _overflowMode: OverflowMode = OverflowMode.Overflow;
  @assignmentClone
  private _style: TextStyle = null;
  @ignoreClone
  private _dirtyFlag: number = DirtyFlag.Property;
  @ignoreClone
  private _styleDirty: UpdateFlag;
  @ignoreClone
  private _fontDirty: UpdateFlag;
  @ignoreClone
  private _isWorldMatrixDirty: UpdateFlag;
  @assignmentClone
  private _maskInteraction: SpriteMaskInteraction = SpriteMaskInteraction.None;
  @assignmentClone
  private _maskLayer: number = SpriteMaskLayer.Layer0;

  /**
   * Rendering color for the TextRenderer.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    if (this._color !== value) {
      value.cloneTo(this._color);
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
   * The font name of the TextRenderer.
   */
  get font(): Font {
    return this._font;
  }

  set font(value: Font) {
    if (this._font !== value) {
      this._fontDirty && this._fontDirty.destroy();
      this._font = value;
      if (value) {
        this._fontDirty = value._registerUpdateFlag();
      }
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
  get enableWarpping(): boolean {
    return this._enableWarpping;
  }

  set enableWarpping(value: boolean) {
    if (this._enableWarpping !== value) {
      this._enableWarpping = value;
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
   * The text style.
   */
  get style(): TextStyle {
    return this._style;
  }

  set style(value: TextStyle) {
    if (this._style !== value) {
      this._styleDirty && this._styleDirty.destroy();
      this._style = value;
      if (value) {
        this._styleDirty = value._registerUpdateFlag();
      }
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
    this._isWorldMatrixDirty = entity.transform.registerWorldChangeFlag();
    this._sprite = new Sprite(this.engine);
    this.style = new TextStyle();
    this.font = new Font(entity.engine);
    this.setMaterial(this._engine._spriteDefaultMaterial);
  }

  /**
   * @internal
   */
  _render(camera: Camera): void {
    if (this._text === "") {
      this._clearTexture();
      return;
    }

    const { _styleDirty, _fontDirty } = this;
    const isDirty = this._isContainDirtyFlag(DirtyFlag.Property) || _styleDirty.flag || _fontDirty.flag;
    if (isDirty) {
      this._updateText();
    }

    const { _sprite: sprite } = this;
    const { texture } = sprite;
    if (!texture) {
      this._setDirtyFlagFalse(DirtyFlag.Property);
      _styleDirty.flag = false;
      _fontDirty.flag = false;
      return;
    }

    // Update sprite data.
    sprite._updateMesh();
    if (this._isWorldMatrixDirty.flag || isDirty) {
      this._updatePosition();
      this._isWorldMatrixDirty.flag = false;
    }
    this._setDirtyFlagFalse(DirtyFlag.Property);
    _styleDirty.flag = false;
    _fontDirty.flag = false;

    if (this._isContainDirtyFlag(DirtyFlag.MaskInteraction)) {
      this._updateStencilState();
      this._setDirtyFlagFalse(DirtyFlag.MaskInteraction);
    }

    this.shaderData.setTexture(TextRenderer._textureProperty, texture);
    const spriteElementPool = this._engine._spriteElementPool;
    const spriteElement = spriteElementPool.getFromPool();
    spriteElement.setValue(
      this,
      this._positions,
      sprite._uv,
      sprite._triangles,
      this.color,
      this.getMaterial(),
      camera
    );
    camera._renderPipeline.pushPrimitive(spriteElement);
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    this.engine._dynamicTextAtlasManager.removeSprite(this._sprite);
    this._isWorldMatrixDirty.destroy();
    this._styleDirty && this._styleDirty.destroy();
    this._fontDirty && this._fontDirty.destroy();
    super._onDestroy();
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    const sprite = this._sprite;
    if (sprite && sprite.texture) {
      if (this._customLocalBounds && this._customRootEntity) {
        const worldMatrix = this._customRootEntity.transform.worldMatrix;
        BoundingBox.transform(this._customLocalBounds, worldMatrix, worldBounds);
      } else {
        const localBounds = sprite.bounds;
        const worldMatrix = this._entity.transform.worldMatrix;
        BoundingBox.transform(localBounds, worldMatrix, worldBounds);
      }
    } else {
      worldBounds.min.setValue(0, 0, 0);
      worldBounds.max.setValue(0, 0, 0);
    }
  }

  private _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  private _setDirtyFlagTrue(type: number): void {
    this._dirtyFlag |= type;
  }

  private _setDirtyFlagFalse(type: number): void {
    this._dirtyFlag &= ~type;
  }

  private _getFontString() {
    const { style } = this;
    let str = "";
    if (style.bold) {
      str += "bold ";
    }
    if (style.italic) {
      str += "italic ";
    }
    str += `${style.fontSize}px ${this._font.fontName}`;
    return str;
  }

  private _updateText() {
    const textContext = TextUtils.textContext();
    const { canvas, context } = textContext;
    const fontStr = this._getFontString();
    const textMetrics = TextUtils.measureText(textContext, this, fontStr);
    const { width, height } = textMetrics;
    if (width === 0 || height === 0) {
      this._clearTexture();
      return;
    }

    // reset canvas's width and height.
    canvas.width = width;
    canvas.height = height;
    // clear canvas.
    context.font = fontStr;
    context.clearRect(0, 0, width, height);
    // set canvas font info.
    context.textBaseline = "top";
    context.fillStyle = "#fff";

    // draw lines.
    const { lines, lineHeight, lineWidths } = textMetrics;
    for (let i = 0, l = lines.length; i < l; ++i) {
      const lineWidth = lineWidths[i];
      const pos = TextRenderer._tempVec2;
      this._calculateLinePosition(width, height, lineWidth, lineHeight, i, l, pos);
      const { x, y } = pos;
      if (y + lineHeight >= 0 && y < height) {
        // +1, for chrome.
        context.fillText(lines[i], x, y + 1);
      }
    }

    this._updateTexture();
  }

  private _updateTexture() {
    const textContext = TextUtils.textContext();
    const { canvas, context } = textContext;
    const trimData = TextUtils.trimCanvas(textContext);
    const { data } = trimData;
    if (!data) {
      this._clearTexture();
      return;
    }

    const { width, height } = trimData;
    canvas.width = width;
    canvas.height = height;
    context.putImageData(data, 0, 0);
    const texture = new Texture2D(this.engine, width, height);
    texture.setImageSource(canvas);
    texture.generateMipmaps();

    this._clearTexture();
    const { _sprite } = this;
    _sprite.texture = texture;
    this.engine._dynamicTextAtlasManager.addSprite(_sprite, canvas);
  }

  private _calculateLinePosition(
    width: number,
    height: number,
    lineWidth: number,
    lineHeight: number,
    index: number,
    length: number,
    out: Vector2
  ) {
    switch (this._verticalAlignment) {
      case TextVerticalAlignment.Top:
        out.y = index * lineHeight;
        break;
      case TextVerticalAlignment.Bottom:
        out.y = height - (length - index) * lineHeight;
        break;
      default:
        out.y = 0.5 * height - 0.5 * length * lineHeight + index * lineHeight;
        break;
    }

    switch (this._horizontalAlignment) {
      case TextHorizontalAlignment.Left:
        out.x = 0;
        break;
      case TextHorizontalAlignment.Right:
        out.x = width - lineWidth;
        break;
      default:
        out.x = (width - lineWidth) * 0.5;
        break;
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

  private _updatePosition() {
    const localPositions = this._sprite._positions;
    const localVertexPos = TextRenderer._tempVec3;
    const worldMatrix = this.entity.transform.worldMatrix;

    const { _positions } = this;
    for (let i = 0, n = _positions.length; i < n; i++) {
      const curVertexPos = localPositions[i];
      localVertexPos.setValue(curVertexPos.x, curVertexPos.y, 0);
      Vector3.transformToVec3(localVertexPos, worldMatrix, _positions[i]);
    }
  }

  private _clearTexture() {
    const { _sprite } = this;
    // Remove sprite from dynamic atlas.
    this.engine._dynamicTextAtlasManager.removeSprite(_sprite);
    // Destroy current texture.
    const texture = _sprite.texture;
    _sprite.texture = null;
    if (texture) {
      this.shaderData.setTexture(TextRenderer._textureProperty, null);
      texture.destroy();
    }
  }
}

enum DirtyFlag {
  Property = 0x1,
  MaskInteraction = 0x2,
  All = 0x3
}
