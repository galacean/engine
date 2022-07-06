import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";
import { CharInfo } from "../assembler/CharInfo";

/**
 * @internal
 * Font Atlas.
 */
export class FontAtlas extends RefObject {
  private _charInfoMap: Record<number, CharInfo> = {};
  private _texture: Texture2D;

  get texture(): Texture2D {
    return this._texture;
  }

  set texture(value: Texture2D) {
    this._texture = value;
  }

  /**
   * Constructor a FontAtlas.
   * @param engine - Engine to which the FontAtlas belongs
   */
  constructor(engine: Engine) {
    super(engine);
  }

  /**
   * @override
   */
  _onDestroy(): void {
    this._texture.destroy();
    this._texture = null;
    this._charInfoMap = {};
  }

  addCharInfo(id: number, def: CharInfo): void {
    this._charInfoMap[id] = def;
  }

  getCharInfo(id: number): CharInfo {
    return this._charInfoMap[id];
  }
}
