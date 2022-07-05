import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture/Texture2D";

/**
 * @internal
 */
export interface CharDef {
  x: number;
  y: number;
  w: number;
  h: number;
  offsetX: number;
  offsetY: number;
  xAdvance: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  ascent: number;
  descent: number;
}

/**
 * @internal
 * Font Atlas.
 */
export class FontAtlas extends RefObject {
  private _charDefMap: Record<number, CharDef> = {};
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
    this._charDefMap = {};
  }

  addCharDef(id: number, def: CharDef): void {
    this._charDefMap[id] = def;
  }

  getCharDef(id: number): CharDef {
    return this._charDefMap[id];
  }
}
