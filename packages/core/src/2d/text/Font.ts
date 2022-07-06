import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";
import { CharInfo } from "../assembler/CharInfo";
import { FontAtlas } from "../atlas/FontAtlas";

/**
 * Font.
 */
export class Font extends RefObject {
  private static _fontMap: Record<string, Font> = {};

  /**
   * Create a font from OS.
   * @param engine - Engine to which the font belongs
   * @param name - The name of font
   * @returns The font object has been create
   */
  static createFromOS(engine: Engine, name: string = ""): Font {
    const fontMap = Font._fontMap;
    let font = fontMap[name];
    if (font) {
      return font;
    }
    font = new Font(engine, name);
    fontMap[name] = font;
    return font;
  }

  private _name: string = "";
  private _fontAtlasArray: Array<FontAtlas> = [];

  /**
   * The name of the font object.
   */
  get name(): string {
    return this._name;
  }

  /**
   * @internal
   */
  addCharInfo(
    id: number,
    imageSource: TexImageSource | OffscreenCanvas,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    xAdvance: number,
    ascent: number,
    descent: number,
  ): CharInfo {
    const { _fontAtlasArray: fontAtlasArray } = this;
    if (fontAtlasArray.length === 0) {
      this._createFontAtlas();
    }

    const lastIndex = fontAtlasArray.length - 1;
    let lastFontAtlas = fontAtlasArray[lastIndex];
    let charInfo = lastFontAtlas.addCharInfo(id, imageSource, width, height, offsetX, offsetY, xAdvance, ascent, descent, lastIndex);
    if (!charInfo) {
      lastFontAtlas = this._createFontAtlas();
      charInfo = lastFontAtlas.addCharInfo(id, imageSource, width, height, offsetX, offsetY, xAdvance, ascent, descent, lastIndex + 1);
    }
    return charInfo;
  }

  /**
   * @internal
   */
  getCharInfo(id: number): CharInfo {
    const { _fontAtlasArray: fontAtlasArray } = this;
    for (let i = 0, l = fontAtlasArray.length; i < l; ++i) {
      const fontAtlas = fontAtlasArray[i];
      const charInfo = fontAtlas.getCharInfo(id);
      if (charInfo) {
        return charInfo;
      }
    }
    return null;
  }

  /**
   * @internal
   */
  getTextureByIndex(index: number): Texture2D {
    const fontAtlas = this._fontAtlasArray[index];
    if (fontAtlas) {
      return fontAtlas.texture;
    }
    return null;
  }

  /**
   * @override
   */
  _onDestroy(): void {
    const { _fontAtlasArray } = this;
    for (let i = 0, l = _fontAtlasArray.length; i < l; ++i) {
      _fontAtlasArray[i].destroy(true);
    }
    _fontAtlasArray.length = 0;
    delete Font._fontMap[this._name];
  }

  private constructor(engine: Engine, name: string = "") {
    super(engine);
    this._name = name;
  }

  private _createFontAtlas(): FontAtlas {
    const { engine } = this;
    const fontAtlas = new FontAtlas(engine);
    const texture = new Texture2D(engine, 512, 512);
    fontAtlas.texture = texture;
    this._fontAtlasArray.push(fontAtlas);
    return fontAtlas;
  }
}
