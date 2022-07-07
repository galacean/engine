import { BoundingBox, Color, Vector3 } from "@oasis-engine/math";
import { BoolUpdateFlag } from "../../BoolUpdateFlag";
import { Camera } from "../../Camera";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { Entity } from "../../Entity";
import { Texture2D } from "../../texture";
import { CharAssembler } from "../assembler/CharAssembler";
import { RenderData2D } from "../data/RenderData2D";
import { CharRenderData } from "../assembler/CharRenderData";
import { FontStyle } from "../enums/FontStyle";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { OverflowMode } from "../enums/TextOverflow";
import { Font } from "./Font";
import { Renderer } from "../../Renderer";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { CompareFunction } from "../../shader/enums/CompareFunction";
import { ICustomClone } from "../../clone/ComponentCloner";
import { TextUtils } from "./TextUtils";

/**
 * Renders a text for 2D graphics.
 */
export class TextRenderer extends Renderer implements ICustomClone {
  private static _tempBounds: BoundingBox = new BoundingBox();

  /** @internal */
  @assignmentClone
  _charFont: Font = null;
  /** @internal */
  @ignoreClone
  _charRenderDatas: Array<CharRenderData> = [];

  @ignoreClone
  _dirtyFlag: number = DirtyFlag.RenderDirty | DirtyFlag.FontDirty;
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
      this._setDirtyFlagTrue(DirtyFlag.RenderDirty);
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
      this._setDirtyFlagTrue(DirtyFlag.RenderDirty);
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
      this._setDirtyFlagTrue(DirtyFlag.RenderDirty);
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
      this._setDirtyFlagTrue(DirtyFlag.FontDirty);
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
      this._setDirtyFlagTrue(DirtyFlag.FontDirty);
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
      this._setDirtyFlagTrue(DirtyFlag.FontDirty);
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
      this._setDirtyFlagTrue(DirtyFlag.RenderDirty);
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
      this._setDirtyFlagTrue(DirtyFlag.RenderDirty);
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
      this._setDirtyFlagTrue(DirtyFlag.RenderDirty);
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
      this._setDirtyFlagTrue(DirtyFlag.RenderDirty);
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
      this._setDirtyFlagTrue(DirtyFlag.RenderDirty);
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
      return;
    }

    if (this._isContainDirtyFlag(DirtyFlag.MaskInteraction)) {
      this._updateStencilState();
      this._setDirtyFlagFalse(DirtyFlag.MaskInteraction);
    }

    const isFontDirty = this._isContainDirtyFlag(DirtyFlag.FontDirty);
    if (isFontDirty) {
      this._resetCharFont();
      this._setDirtyFlagFalse(DirtyFlag.FontDirty);
    }

    const isRenderDirty = this._isContainDirtyFlag(DirtyFlag.RenderDirty) || isFontDirty;
    if (isRenderDirty) {
      CharAssembler.updateData(this);
      this._setDirtyFlagFalse(DirtyFlag.RenderDirty);
    }

    if (this._isWorldMatrixDirty.flag || isRenderDirty) {
      this._updatePosition();
      this._isWorldMatrixDirty.flag = false;
    }

    const charRenderDatas = this._charRenderDatas;
    for (let i = 0, n = charRenderDatas.length; i < n; ++i) {
      const charRenderData = charRenderDatas[i];
      const spriteElement = this._engine._spriteElementPool.getFromPool();
      spriteElement.setValue(this, charRenderData.renderData, this.getMaterial(), charRenderData.texture);
      camera._renderPipeline.pushPrimitive(spriteElement);
    }
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    CharAssembler.clearData(this);
    this._isWorldMatrixDirty.destroy();
    super._onDestroy();
  }

  /**
   * @internal
   */
  _cloneTo(target: TextRenderer): void {
    target.font = this._font;
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
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    const worldMatrix = this._entity.transform.worldMatrix;
    let bounds = TextRenderer._tempBounds;
    const { min, max } = bounds;
    min.set(0, 0, 0);
    max.set(0, 0, 0);
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

  private _resetCharFont(): void {
    const lastCharFont = this._charFont;
    if (lastCharFont) {
      lastCharFont._addRefCount(-1);
      lastCharFont.destroy();
    }
    this._charFont = Font.createFromOS(
      this.engine,
      TextUtils.getNativeFontHash(this.font.name, this.fontSize, this.fontStyle)
    );
    this._charFont._addRefCount(1);
  }

  private _updatePosition() {
    const worldMatrix = this.entity.transform.worldMatrix;
    const { _charRenderDatas } = this;
    for (let i = 0, l = _charRenderDatas.length; i < l; ++i) {
      const { localPositions, renderData } = _charRenderDatas[i];
      for (let j = 0; j < 4; ++j) {
        Vector3.transformToVec3(localPositions[j], worldMatrix, renderData.positions[j]);
      }
    }
  }
}

export enum DirtyFlag {
  RenderDirty = 0x1,
  FontDirty = 0x2,
  MaskInteraction = 0x4,
  All = 0x7
}
