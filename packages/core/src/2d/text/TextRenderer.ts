import { BoundingBox, Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Sprite, SpriteMaskInteraction, SpriteMaskLayer } from "..";
import { CompareFunction, Renderer, Shader, UpdateFlag } from "../..";
import { Camera } from "../../Camera";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { Entity } from "../../Entity";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { Texture2D } from "../../texture";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { TextHorizontalOverflow, TextVerticalOverflow } from "../enums/TextOverflow";
import { TextUtils } from "./TextUtils";

export class TextRenderer extends Renderer {
  static needPremultiplyAlpha: boolean = false;

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
  private _width: number = 0; // 3d space in unit
  @assignmentClone
  private _height: number = 0; // 3d space in unit
  @assignmentClone
  private _fontName: string = "Arial";
  @assignmentClone
  private _fontSize: number = 24;
  @assignmentClone
  private _lineSpace: number = 1; // pixel in unit
  @assignmentClone
  private _isBold: boolean = false;
  @assignmentClone
  private _isItalic: boolean = false;
  @assignmentClone
  private _horizontalAlignment: TextHorizontalAlignment = TextHorizontalAlignment.Center;
  @assignmentClone
  private _verticalAlignment: TextVerticalAlignment = TextVerticalAlignment.Center;
  @assignmentClone
  private _horizontalOverflow: TextHorizontalOverflow = TextHorizontalOverflow.Overflow;
  @assignmentClone
  private _verticalOverflow: TextVerticalOverflow = TextVerticalOverflow.Overflow;
  @ignoreClone
  private _dirtyFlag: number = DirtyFlag.All;
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
   *
   */
  get text(): string {
    return this._text;
  }

  set text(value: string) {
    value = value || "";
    if (this._text !== value) {
      this._text = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (this._width !== value) {
      this._width = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get fontName(): string {
    return this._fontName;
  }

  set fontName(value: string) {
    value = value || "Arial";
    if (this._fontName !== value) {
      this._fontName = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get fontSize(): number {
    return this._fontSize;
  }

  set fontSize(value: number) {
    if (this._fontSize !== value) {
      this._fontSize = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get lineSpace(): number {
    return this._lineSpace;
  }

  set lineSpace(value: number) {
    if (this._lineSpace !== value) {
      this._lineSpace = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get isBold(): boolean {
    return this._isBold;
  }

  set isBold(value: boolean) {
    if (this._isBold !== value) {
      this._isBold = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get isItalic(): boolean {
    return this._isItalic;
  }

  set isItalic(value: boolean) {
    if (this._isItalic !== value) {
      this._isItalic = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get horizontalAlignment(): TextHorizontalAlignment {
    return this._horizontalAlignment;
  }

  set horizontalAlignment(value: TextHorizontalAlignment) {
    if (this._horizontalAlignment !== value) {
      this._horizontalAlignment = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get verticalAlignment(): TextVerticalAlignment {
    return this._verticalAlignment;
  }

  set verticalAlignment(value: TextVerticalAlignment) {
    if (this._verticalAlignment !== value) {
      this._verticalAlignment = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get horizontalOverflow(): TextHorizontalOverflow {
    return this._horizontalOverflow;
  }

  set horizontalOverflow(value: TextHorizontalOverflow) {
    if (this._horizontalOverflow !== value) {
      this._horizontalOverflow = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
    }
  }

  get verticalOverflow(): TextVerticalOverflow {
    return this._verticalOverflow;
  }

  set verticalOverflow(value: TextVerticalOverflow) {
    if (this._verticalOverflow !== value) {
      this._verticalOverflow = value;
      this._setDirtyFlagTrue(DirtyFlag.Style);
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
    this.setMaterial(this._engine._spriteDefaultMaterial);
    this._sprite = new Sprite(this.engine);
  }

  /**
   * @internal
   */
  _render(camera: Camera): void {
    if (this._text === "") {
      this._sprite.texture = null;
      return;
    }

    if (this._isContainDirtyFlag(DirtyFlag.Style)) {
      this._updateText();
      this._setDirtyFlagFalse(DirtyFlag.Style);
    }

    if (TextRenderer.needPremultiplyAlpha) {
      this.shaderData.enableMacro("NEED_PREMULTIPLY_ALPHA");
    } else {
      this.shaderData.disableMacro("NEED_PREMULTIPLY_ALPHA");
    }

    const { _sprite: sprite } = this;
    const { texture } = sprite;
    if (!texture) {
      return;
    }

    const { _positions } = this;
    const { transform } = this.entity;

    // Update sprite data.
    const localDirty = sprite._updateMeshData();
    if (this._isWorldMatrixDirty.flag || localDirty) {
      const localPositions = sprite._positions;
      const localVertexPos = TextRenderer._tempVec3;
      const worldMatrix = transform.worldMatrix;

      for (let i = 0, n = _positions.length; i < n; i++) {
        const curVertexPos = localPositions[i];
        localVertexPos.setValue(curVertexPos.x, curVertexPos.y, 0);
        Vector3.transformToVec3(localVertexPos, worldMatrix, _positions[i]);
      }

      this._isWorldMatrixDirty.flag = false;
    }

    if (this._isContainDirtyFlag(DirtyFlag.MaskInteraction)) {
      this._updateStencilState();
      this._setDirtyFlagFalse(DirtyFlag.MaskInteraction);
    }

    this.shaderData.setTexture(TextRenderer._textureProperty, texture);
    const material = this.getMaterial();

    const spriteElementPool = this._engine._spriteElementPool;
    const spriteElement = spriteElementPool.getFromPool();
    spriteElement.setValue(this, _positions, sprite._uv, sprite._triangles, this.color, material, camera);
    camera._renderPipeline.pushPrimitive(spriteElement);
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    this._isWorldMatrixDirty.destroy();
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
    let str = "";
    if (this.isBold) {
      str += "bold ";
    }
    if (this.isItalic) {
      str += "italic ";
    }
    str += `${this._fontSize}px ${this._fontName}`;
    return str;
  }

  private _updateText() {
    if (this._text === "") {
      this._sprite.texture = null;
      return;
    }

    const textContext = TextUtils.textContext();
    const { canvas, context } = textContext;
    const fontStr = this._getFontString();
    const textMetrics = TextUtils.measureText(textContext, this, fontStr);
    const { width, height } = textMetrics;
    if (width === 0 || height === 0) {
      this._sprite.texture = null;
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
      this._sprite.texture = null;
      return;
    }
    const { width, height } = trimData;
    canvas.width = width;
    canvas.height = height;
    context.putImageData(data, 0, 0);
    const texture = new Texture2D(this.engine, width, height);
    if (TextRenderer.needPremultiplyAlpha) {
      texture.setImageSource(canvas, 0, false, true);
    } else {
      texture.setImageSource(canvas);
    }
    texture.generateMipmaps();
    this._sprite.texture = texture;
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
    switch(this._verticalAlignment) {
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

    switch(this._horizontalAlignment) {
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
}

enum DirtyFlag {
  Style = 0x1,
  MaskInteraction = 0x2,
  All = 0x3
}
