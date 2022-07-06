import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";
import { CharInfoWithTexture } from "../assembler/CharInfo";
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
   * Add char into font atlas.
   * @param id - The unique id for char
   * @param imageSource - The source of texture
   * @param width - The width of char
   * @param height - The height of char
   * @param offsetX - The char offset in X axis
   * @param offsetY - The char offset in Y axis
   * @param xAdvance - The next char start position in X axis
   * @param ascent - The ascent of char
   * @param descent - The descent of char
   * @returns - The char's char info and texture
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
  ): CharInfoWithTexture {
    const { _fontAtlasArray: fontAtlasArray } = this;
    if (fontAtlasArray.length === 0) {
      this._createFontAtlas();
    }

    const lastIndex = fontAtlasArray.length - 1;
    let lastFontAtlas = fontAtlasArray[lastIndex];
    let charInfo = lastFontAtlas.addCharInfo(id, imageSource, width, height, offsetX, offsetY, xAdvance, ascent, descent);
    if (!charInfo) {
      lastFontAtlas = this._createFontAtlas();
      charInfo = lastFontAtlas.addCharInfo(id, imageSource, width, height, offsetX, offsetY, xAdvance, ascent, descent);
    }
    return charInfo ? { charInfo: charInfo, texture: lastFontAtlas.texture } : null;
  }

  /**
   * Get char info.
   * @param id - The unique id for char
   * @returns - The char's char info and texture
   */
  getCharInfo(id: number): CharInfoWithTexture {
    const { _fontAtlasArray: fontAtlasArray } = this;
    for (let i = 0, l = fontAtlasArray.length; i < l; ++i) {
      const fontAtlas = fontAtlasArray[i];
      const charInfo = fontAtlas.getCharInfo(id);
      if (charInfo) {
        return {
          charInfo: charInfo,
          texture: fontAtlas.texture
        }
      }
    }
    return null;
  }

  /**
   * @override
   */
  protected _onDestroy(): void {}

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
