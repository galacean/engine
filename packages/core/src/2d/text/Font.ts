import { RefObject } from "../../asset/RefObject";
import { Engine } from "../../Engine";
import { TextUtils } from "./TextUtils";
import { SubFont } from "./SubFont";
import { FontStyle } from "../enums/FontStyle";

/**
 * Font.
 */
export class Font extends RefObject {
  private static _fontMap: Record<string, Font> = {};

  /**
   * Create a font.
   * @param engine - Engine to which the font belongs
   * @param name - The name of font want to create
   * @param fontUrl - The font url to register, if not, will use system font
   * @returns The font object has been create
   */
  static async create(engine: Engine, name: string, fontUrl: string = ""): Promise<Font> {
    if (name) {
      const fontMap = Font._fontMap;
      let font = fontMap[name];
      if (font) {
        return font;
      }
      if (fontUrl !== "") {
        await TextUtils.registerTTF(name, fontUrl);
      }
      font = new Font(engine, name);
      font._addRefCount(1);
      fontMap[name] = font;
      return font;
    }
    return null;
  }

  /**
   * Delete a font.
   * @param name - The name of font want to delete
   */
  static delete(name: string): void {
    const fontMap = Font._fontMap;
    const font = fontMap[name];
    if (font) {
      font._addRefCount(-1);
      font.destroy();
      delete fontMap[name];
    }
  }

  private _name: string = "";
  private _subFontMap: Record<string, SubFont> = {};

  /**
   * The name of the font object.
   */
  get name(): string {
    return this._name;
  }

  constructor(engine: Engine, name: string = "") {
    super(engine);
    this._name = name;
  }

  /** @internal */
  _getSubFont(fontSize: number, fontStyle: FontStyle): SubFont {
    const key = `${fontSize}-${fontStyle}`;
    const subFontMap = this._subFontMap;
    let subFont = subFontMap[key];
    if (subFont) {
      return subFont;
    }
    subFont = new SubFont(this.engine);
    subFontMap[key] = subFont;
    return subFont;
  }

  /**
   * @override
   */
  _onDestroy(): void {
    const styleFonts = Object.values(this._subFontMap);
    for (let i = 0, l = styleFonts.length; i < l; ++i) {
      styleFonts[i].destroy();
    }
    this._subFontMap = null;
    delete Font._fontMap[this._name];
  }
}
