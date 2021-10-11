import { Camera } from "../../Camera";
import { assignmentClone, ignoreClone } from "../../clone/CloneManager";
import { Entity } from "../../Entity";
import { TextHorizontalAlignment, TextVerticalAlignment } from "../enums/TextAlignment";
import { TextHorizontalOverflow, TextVerticalOverflow } from "../enums/TextOverflow";
import { SpriteRenderer } from "../sprite";

export class TextRenderer extends SpriteRenderer {
  @assignmentClone
  private _text: string = '';
  @assignmentClone
  private _width: number = 0;
  @assignmentClone
  private _height: number = 0;
  @assignmentClone
  private _font: string = 'Arial';
  @assignmentClone
  private _fontSize: number = 24;
  @assignmentClone
  private _lineHeight: number = 1;
  @assignmentClone
  private _isBolb: boolean = false;
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
  private _textDirtyFlag: boolean = true;

  /**
   * 
   */
  get text(): string {
    return this._text;
  }

  set text(value: string) {
    value = value || '';
    if (this._text !== value) {
      this._text = value;
      this._textDirtyFlag = true;
    }
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (this._width !== value) {
      this._width = value;
      this._textDirtyFlag = true;
    }
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._textDirtyFlag = true;
    }
  }

  get font(): string {
    return this._font;
  }

  set font(value: string) {
    value = value || 'Arial';
    if (this._font !== value) {
      this._font = value;
      this._textDirtyFlag = true;
    }
  }

  get fontSize(): number {
    return this._fontSize;
  }

  set fontSize(value: number) {
    if (this._fontSize !== value) {
      this._fontSize = value;
      this._textDirtyFlag = true;
    }
  }

  get lineHeight(): number {
    return this._lineHeight;
  }

  set lineHeight(value: number) {
    if (this._lineHeight !== value) {
      this._lineHeight = value;
      this._textDirtyFlag = true;
    }
  }

  get isBolb(): boolean {
    return this._isBolb;
  }

  set isBolb(value: boolean) {
    if (this._isBolb !== value) {
      this._isBolb = value;
      this._textDirtyFlag = true;
    }
  }

  get isItalic(): boolean {
    return this._isItalic;
  }

  set isItalic(value: boolean) {
    if (this._isItalic !== value) {
      this._isItalic = value;
      this._textDirtyFlag = true;
    }
  }

  get horizontalAlignment(): TextHorizontalAlignment {
    return this._horizontalAlignment;
  }

  set horizontalAlignment(value: TextHorizontalAlignment) {
    if (this._horizontalAlignment !== value) {
      this._horizontalAlignment = value;
      this._textDirtyFlag = true;
    }
  }

  get verticalAlignment(): TextVerticalAlignment {
    return this._verticalAlignment;
  }

  set verticalAlignment(value: TextVerticalAlignment) {
    if (this._verticalAlignment !== value) {
      this._verticalAlignment = value;
      this._textDirtyFlag = true;
    }
  }

  get horizontalOverflow(): TextHorizontalOverflow {
    return this._horizontalOverflow;
  }

  set horizontalOverflow(value: TextHorizontalOverflow) {
    if (this._horizontalOverflow !== value) {
      this._horizontalOverflow = value;
      this._textDirtyFlag = true;
    }
  }

  get verticalOverflow(): TextVerticalOverflow {
    return this._verticalOverflow;
  }

  set verticalOverflow(value: TextVerticalOverflow) {
    if (this._verticalOverflow !== value) {
      this._verticalOverflow = value;
      this._textDirtyFlag = true;
    }
  }

  constructor(entity: Entity) {
    super(entity);
  }

  /**
   * @internal
   */
   _render(camera: Camera): void {

   }
}
