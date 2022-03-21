import { RefObject } from "../../asset/RefObject"
import { assignmentClone } from "../../clone/CloneManager";
import { Engine } from "../../Engine";
import { UpdateFlag } from "../../UpdateFlag";
import { UpdateFlagManager } from "../../UpdateFlagManager";

export class Font extends RefObject {
  @assignmentClone
  private _fontName: string = "Arial";

  private _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  /**
   * The font name of the TextRenderer.
   */
  get fontName(): string {
    return this._fontName;
  }

  set fontName(value: string) {
    value = value || "Arial";
    if (this._fontName !== value) {
      this._fontName = value;
      this._updateFlagManager.distribute();
    }
  }

  /**
   * Create a material instance.
   * @param engine - Engine to which the material belongs
   * @param shader - Shader used by the material
   */
  constructor(engine: Engine, name: string = "") {
    super(engine);
    this._fontName = name || "Arial";
  }

  /**
   * @internal
   */
  _registerUpdateFlag(): UpdateFlag {
    return this._updateFlagManager.register();
  }

  /**
   * @override
   */
  protected _onDestroy(): void {}
}

