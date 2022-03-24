import { RefObject } from "../../asset/RefObject"
import { assignmentClone } from "../../clone/CloneManager";
import { Engine } from "../../Engine";
import { UpdateFlag } from "../../UpdateFlag";
import { UpdateFlagManager } from "../../UpdateFlagManager";

export class Font extends RefObject {
  @assignmentClone
  private _name: string = "Arial";

  private _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  /**
   * The font name of the TextRenderer.
   */
  get name(): string {
    return this._name;
  }

  set name(value: string) {
    value = value || "Arial";
    if (this._name !== value) {
      this._name = value;
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
    this._name = name || "Arial";
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

