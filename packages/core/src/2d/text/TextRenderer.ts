import { BoundingBox } from "@oasis-engine/math";
import { Camera } from "../../Camera";
import { assignmentClone, ignoreClone } from "../../clone/CloneManager";
import { Entity } from "../../Entity";
import { Texture2D } from "../../texture";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { TextHorizontalOverflow, TextVerticalOverflow } from "../enums/TextOverflow";
import { Sprite, SpriteRenderer } from "../sprite";
import { TextUtils } from "./TextUtils";

export class TextRenderer extends SpriteRenderer {
  @assignmentClone
  private _text: string = "";
  @assignmentClone
  private _width: number = 0;
  @assignmentClone
  private _height: number = 0;
  @assignmentClone
  private _fontName: string = "Arial";
  @assignmentClone
  private _fontSize: number = 24;
  @assignmentClone
  private _lineHeight: number = 1;
  @assignmentClone
  private _isBold: boolean = false;
  @assignmentClone
  private _isItalic: boolean = false;
  @assignmentClone
  private _horizontalAlignment: TextHorizontalAlignment = TextHorizontalAlignment.Center;
  @assignmentClone
  private _verticalAlignment: TextVerticalAlignment = TextVerticalAlignment.Center;
  @assignmentClone
  private _horizontalOverflow: TextHorizontalOverflow = TextHorizontalOverflow.Wrap;
  @assignmentClone
  private _verticalOverflow: TextVerticalOverflow = TextVerticalOverflow.Truncate;
  @ignoreClone
  private _styleDirtyFlag: boolean = true;

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
      this._styleDirtyFlag = true;
    }
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (this._width !== value) {
      this._width = value;
      this._styleDirtyFlag = true;
    }
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._styleDirtyFlag = true;
    }
  }

  get fontName(): string {
    return this._fontName;
  }

  set fontName(value: string) {
    value = value || "Arial";
    if (this._fontName !== value) {
      this._fontName = value;
      this._styleDirtyFlag = true;
    }
  }

  get fontSize(): number {
    return this._fontSize;
  }

  set fontSize(value: number) {
    if (this._fontSize !== value) {
      this._fontSize = value;
      this._styleDirtyFlag = true;
    }
  }

  get lineHeight(): number {
    return this._lineHeight;
  }

  set lineHeight(value: number) {
    if (this._lineHeight !== value) {
      this._lineHeight = value;
      this._styleDirtyFlag = true;
    }
  }

  get isBold(): boolean {
    return this._isBold;
  }

  set isBold(value: boolean) {
    if (this._isBold !== value) {
      this._isBold = value;
      this._styleDirtyFlag = true;
    }
  }

  get isItalic(): boolean {
    return this._isItalic;
  }

  set isItalic(value: boolean) {
    if (this._isItalic !== value) {
      this._isItalic = value;
      this._styleDirtyFlag = true;
    }
  }

  get horizontalAlignment(): TextHorizontalAlignment {
    return this._horizontalAlignment;
  }

  set horizontalAlignment(value: TextHorizontalAlignment) {
    if (this._horizontalAlignment !== value) {
      this._horizontalAlignment = value;
      this._styleDirtyFlag = true;
    }
  }

  get verticalAlignment(): TextVerticalAlignment {
    return this._verticalAlignment;
  }

  set verticalAlignment(value: TextVerticalAlignment) {
    if (this._verticalAlignment !== value) {
      this._verticalAlignment = value;
      this._styleDirtyFlag = true;
    }
  }

  get horizontalOverflow(): TextHorizontalOverflow {
    return this._horizontalOverflow;
  }

  set horizontalOverflow(value: TextHorizontalOverflow) {
    if (this._horizontalOverflow !== value) {
      this._horizontalOverflow = value;
      this._styleDirtyFlag = true;
    }
  }

  get verticalOverflow(): TextVerticalOverflow {
    return this._verticalOverflow;
  }

  set verticalOverflow(value: TextVerticalOverflow) {
    if (this._verticalOverflow !== value) {
      this._verticalOverflow = value;
      this._styleDirtyFlag = true;
    }
  }

  constructor(entity: Entity) {
    super(entity);

    // const canvas = this._canvas = document.createElement("canvas");
    // this._context = canvas.getContext("2d");
    // canvas.width = canvas.height = 1;

    this.sprite = new Sprite(this.engine);
  }

  /**
   * @internal
   */
  _render(camera: Camera): void {
    if (this._styleDirtyFlag) {
      this._updateText();
      this._styleDirtyFlag = false;
    }

    super._render(camera);
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    const sprite = this.sprite;
    if (sprite) {
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
    const fontStr = this._getFontString();
    TextUtils.measureText(TextUtils.textContext(), this, fontStr);
    this._updateTexture();
  }

  private _updateTexture() {
    const textContext = TextUtils.textContext();
    const { canvas, context } = textContext;
    const trimData = TextUtils.trimCanvas(textContext);
    const { width, height } = trimData;
    canvas.width = width;
    canvas.height = height;
    context.putImageData(trimData.data, 0, 0);
    const texture = new Texture2D(this.engine, width, height);
    texture.setImageSource(canvas);
    texture.generateMipmaps();
    this.sprite.texture = texture;
  }
}
