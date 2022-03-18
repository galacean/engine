import { assignmentClone } from "../../clone/CloneManager";
import { UpdateFlag } from "../../UpdateFlag";
import { UpdateFlagManager } from "../../UpdateFlagManager";

export class TextStyle {
  @assignmentClone
  private _fontSize: number = 24;
  @assignmentClone
  private _isBold: boolean = false;
  @assignmentClone
  private _isItalic: boolean = false;

  private _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  /**
   * The font size of the TextRenderer.
   */
  get fontSize(): number {
    return this._fontSize;
  }

  set fontSize(value: number) {
    if (this._fontSize !== value) {
      this._fontSize = value;
      this._updateFlagManager.distribute();
    }
  }

  /**
   * The text is bold.
   */
  get bold(): boolean {
    return this._isBold;
  }

  set bold(value: boolean) {
    if (this._isBold !== value) {
      this._isBold = value;
      this._updateFlagManager.distribute();
    }
  }

  /**
   * The text is italic.
   */
  get italic(): boolean {
    return this._isItalic;
  }

  set italic(value: boolean) {
    if (this._isItalic !== value) {
      this._isItalic = value;
      this._updateFlagManager.distribute();
    }
  }

  /**
   * @internal
   */
  _registerUpdateFlag(): UpdateFlag {
    return this._updateFlagManager.register();
  }
}
