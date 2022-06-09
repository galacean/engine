import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";

export interface CharDef {
  x: number,
  y: number,
  w: number,
  h: number,
  offsetX: number,
  offsetY: number,
  xAdvance: number
}

export interface CharDefDict {
  [key: string]: CharDef;
}

/**
 * Font Atlas.
 */
export class FontAtlas extends RefObject {
  private _charDefDict: CharDefDict;
  private _texture: Texture2D;

  /**
   * Constructor a FontAtlas.
   * @param engine - Engine to which the FontAtlas belongs
   */
  constructor(engine: Engine, texture: Texture2D) {
    super(engine);
    this._charDefDict = {};
    this._texture = texture;
  }

  /**
   * @override
   */
  _onDestroy(): void {
    this._texture.destroy();
    this._texture = null;
    this._charDefDict = {};
  }

  addCharDef(key: string, def: CharDef): void {
    this._charDefDict[key] = def;
  }

  getCharDef(key: string): CharDef {
    return this._charDefDict[key];
  }

  getTexture(): Texture2D {
    return this._texture;
  }
}

